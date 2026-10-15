import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, Users, FileSpreadsheet, Gift, Settings2 } from "lucide-react";
import * as XLSX from "xlsx";
import { formatRupiah } from "@/lib/format";
import { DEFAULT_LOYALTY, normPhone, recommendedReward, tierFor, type LoyaltySettings, type Tier } from "@/lib/loyalty";

export const Route = createFileRoute("/_authenticated/pelanggan")({
  head: () => ({ meta: [
    { title: "Pelanggan & Loyalitas — Dagang Pintar" },
    { name: "description", content: "Daftar pelanggan, poin, laba per pelanggan, dan reward loyalitas." },
    { property: "og:title", content: "Pelanggan & Loyalitas — Dagang Pintar" },
    { property: "og:description", content: "Kelola poin dan reward pelanggan tanpa merusak pembukuan." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: PelangganPage,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error instanceof Error ? error.message : "Halaman gagal dimuat"}</div>,
  notFoundComponent: () => <div className="p-6 text-sm">Tidak ditemukan</div>,
});

type Customer = {
  id: string; tenant_id: string; name: string; phone: string | null; address: string | null;
  note: string | null; points: number; created_at: string;
};
type Stat = { tx: number; spend: number; profit: number };
type Reward = { id: string; customer_id: string | null; customer_name: string; reward_type: string; description: string | null; amount: number; points_used: number; created_at: string };
type FormState = { id?: string; name: string; phone: string; address: string; note: string };
const empty: FormState = { name: "", phone: "", address: "", note: "" };
type SortKey = "profit" | "points" | "spend" | "name";

const tierClass: Record<Tier, string> = {
  Bronze: "bg-muted text-muted-foreground",
  Silver: "bg-secondary text-secondary-foreground",
  Gold: "bg-primary/15 text-primary",
  Platinum: "bg-primary text-primary-foreground",
};
const typeLabel: Record<string, string> = { voucher: "Voucher", product: "Produk bonus", cash: "Uang" };

function PelangganPage() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(`${year}-12-31`);
  const [stats, setStats] = useState<Map<string, Stat>>(new Map());
  const [loadingStats, setLoadingStats] = useState(false);
  const [settings, setSettings] = useState<LoyaltySettings>(DEFAULT_LOYALTY);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState<LoyaltySettings>(DEFAULT_LOYALTY);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [sort, setSort] = useState<SortKey>("profit");
  const [rewardFor, setRewardFor] = useState<Customer | null>(null);
  const [rw, setRw] = useState({ type: "voucher", amount: "", points: "", description: "" });

  const load = async () => {
    const { data: tid } = await supabase.rpc("current_tenant_id");
    let resolvedTid = (tid as string | null) ?? null;
    if (!resolvedTid) {
      const { data: t } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
      resolvedTid = t?.id ?? null;
    }
    setTenantId(resolvedTid);
    const { data: cs } = await supabase.rpc("is_cashier_session");
    const owner = !cs;
    setIsOwner(owner);
    const { data, error } = await supabase.from("customers").select("*").order("name", { ascending: true });
    if (error) toast.error(error.message);
    else setRows((data || []) as Customer[]);
    if (owner) {
      const { data: s } = await supabase.from("loyalty_settings").select("*").maybeSingle();
      if (s) setSettings({ reward_cap_percent: Number(s.reward_cap_percent), silver_min: Number(s.silver_min), gold_min: Number(s.gold_min), platinum_min: Number(s.platinum_min) });
      const { data: r } = await supabase.from("customer_rewards").select("*").order("created_at", { ascending: false }).limit(1000);
      setRewards((r || []) as Reward[]);
    }
  };

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const start = new Date(from + "T00:00:00").toISOString();
      const end = new Date(to + "T23:59:59.999").toISOString();
      const txs: { id: string; customer_phone: string; total: number }[] = [];
      for (let off = 0; ; off += 1000) {
        const { data, error } = await supabase.from("transactions")
          .select("id, customer_phone, total").not("customer_phone", "is", null)
          .gte("created_at", start).lte("created_at", end).order("id").range(off, off + 999);
        if (error) throw error;
        txs.push(...((data || []) as any));
        if (!data || data.length < 1000) break;
      }
      const phoneOf = new Map<string, string>();
      const m = new Map<string, Stat>();
      for (const t of txs) {
        const p = normPhone(t.customer_phone);
        if (!p) continue;
        phoneOf.set(t.id, p);
        const s = m.get(p) || { tx: 0, spend: 0, profit: 0 };
        s.tx += 1; s.spend += Number(t.total) || 0;
        m.set(p, s);
      }
      const ids = Array.from(phoneOf.keys());
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        for (let off = 0; ; off += 1000) {
          const { data, error } = await supabase.from("transaction_items")
            .select("transaction_id, subtotal, unit_cost, qty").in("transaction_id", chunk).order("id").range(off, off + 999);
          if (error) throw error;
          for (const it of (data || []) as any[]) {
            const s = m.get(phoneOf.get(it.transaction_id)!);
            if (s) s.profit += (Number(it.subtotal) || 0) - (Number(it.unit_cost) || 0) * (Number(it.qty) || 0);
          }
          if (!data || data.length < 1000) break;
        }
      }
      setStats(m);
    } catch (e: any) {
      toast.error(e?.message || "Gagal menghitung laba pelanggan");
    } finally { setLoadingStats(false); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (isOwner) loadStats(); }, [isOwner, from, to]);

  const givenByCustomer = useMemo(() => {
    const m = new Map<string, number>();
    const s = new Date(from + "T00:00:00"), e = new Date(to + "T23:59:59");
    for (const r of rewards) {
      const d = new Date(r.created_at);
      if (!r.customer_id || d < s || d > e) continue;
      m.set(r.customer_id, (m.get(r.customer_id) || 0) + Number(r.amount));
    }
    return m;
  }, [rewards, from, to]);

  const enriched = useMemo(() => rows.map((c) => {
    const st = stats.get(normPhone(c.phone)) || { tx: 0, spend: 0, profit: 0 };
    const given = givenByCustomer.get(c.id) || 0;
    return { ...c, ...st, given, tier: tierFor(st.profit, settings), rec: recommendedReward(st.profit, given, settings) };
  }), [rows, stats, givenByCustomer, settings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? enriched.filter((r) =>
      r.name.toLowerCase().includes(q) || (r.phone || "").toLowerCase().includes(q) || (r.address || "").toLowerCase().includes(q)) : [...enriched];
    if (isOwner) list.sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "points" ? b.points - a.points : sort === "spend" ? b.spend - a.spend : b.profit - a.profit);
    return list;
  }, [enriched, query, sort, isOwner]);

  const summary = useMemo(() => {
    const totalPoints = enriched.reduce((s, c) => s + (c.points || 0), 0);
    const liability = enriched.reduce((s, c) => s + c.rec, 0);
    const givenPeriod = Array.from(givenByCustomer.values()).reduce((s, v) => s + v, 0);
    const profit = enriched.reduce((s, c) => s + c.profit, 0);
    return { totalPoints, liability, givenPeriod, profit, net: profit - givenPeriod };
  }, [enriched, givenByCustomer]);

  const openAdd = () => { setForm(empty); setOpen(true); };
  const openEdit = (c: Customer) => {
    setForm({ id: c.id, name: c.name, phone: c.phone || "", address: c.address || "", note: c.note || "" });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Nama wajib diisi"); return; }
    if (!tenantId) { toast.error("Akun belum terhubung ke toko"); return; }
    setSaving(true);
    const payload = { name: form.name.trim(), phone: form.phone.trim() || null, address: form.address.trim() || null, note: form.note.trim() || null };
    let error;
    if (form.id) ({ error } = await supabase.from("customers").update(payload).eq("id", form.id));
    else ({ error } = await supabase.from("customers").insert({ ...payload, tenant_id: tenantId } as any));
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(form.id ? "Pelanggan diperbarui" : "Pelanggan ditambahkan");
    setOpen(false);
    load();
  };

  const remove = async (c: Customer) => {
    if (!confirm(`Hapus pelanggan "${c.name}"?`)) return;
    const { error } = await supabase.from("customers").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Pelanggan dihapus");
    load();
  };

  const saveSettings = async () => {
    if (!tenantId) return;
    const { error } = await supabase.from("loyalty_settings").upsert({ tenant_id: tenantId, ...settingsForm, updated_at: new Date().toISOString() });
    if (error) return toast.error(error.message);
    setSettings(settingsForm); setSettingsOpen(false); toast.success("Aturan reward disimpan");
  };

  const openReward = (c: typeof enriched[number]) => {
    setRewardFor(c);
    setRw({ type: "voucher", amount: String(c.rec || ""), points: String(c.points || 0), description: "" });
  };

  const giveReward = async () => {
    if (!rewardFor || !tenantId) return;
    const amount = Number(rw.amount) || 0;
    const points = Math.floor(Number(rw.points) || 0);
    if (amount <= 0) return toast.error("Nominal reward wajib diisi");
    if (points > rewardFor.points) return toast.error("Poin pelanggan tidak cukup");
    const rec = enriched.find((e) => e.id === rewardFor.id)?.rec || 0;
    if (amount > rec && !confirm(`Nominal melebihi rekomendasi (${formatRupiah(rec)}). Tetap berikan?`)) return;
    setSaving(true);
    const { error } = await supabase.from("customer_rewards").insert({
      tenant_id: tenantId, customer_id: rewardFor.id, customer_name: rewardFor.name,
      reward_type: rw.type, amount, points_used: points, description: rw.description.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Reward dicatat sebagai biaya loyalitas");
    setRewardFor(null);
    load();
  };

  const exportExcel = () => {
    if (filtered.length === 0) { toast.error("Tidak ada data untuk diekspor"); return; }
    const wb = XLSX.utils.book_new();
    const header = ["Nama", "No. HP", "Alamat", "Poin", ...(isOwner ? ["Transaksi", "Total Belanja", "Laba", "Status", "Rekomendasi Reward"] : []), "Catatan", "Tanggal Daftar"];
    const data = filtered.map((c) => [
      c.name, c.phone || "", c.address || "", c.points ?? 0,
      ...(isOwner ? [c.tx, Math.round(c.spend), Math.round(c.profit), c.tier, c.rec] : []),
      c.note || "", new Date(c.created_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
    XLSX.utils.book_append_sheet(wb, ws, "Pelanggan");
    XLSX.writeFile(wb, `Data-Pelanggan-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success(`${filtered.length} pelanggan diekspor`);
  };

  const cols = isOwner ? 10 : 6;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Users className="h-6 w-6 text-primary" /> Pelanggan
          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{rows.length}</span>
        </h1>
        <div className="flex flex-wrap gap-2">
          {isOwner && <Button variant="outline" onClick={() => { setSettingsForm(settings); setSettingsOpen(true); }}><Settings2 className="mr-1 h-4 w-4" />Aturan Reward</Button>}
          <Button variant="outline" onClick={exportExcel} disabled={filtered.length === 0}><FileSpreadsheet className="mr-1 h-4 w-4" />Export Excel</Button>
          <Button onClick={openAdd}><Plus className="mr-1 h-4 w-4" />Tambah</Button>
        </div>
      </div>

      {isOwner && (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <div><Label className="text-xs">Dari</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><Label className="text-xs">Sampai</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <div>
              <Label className="text-xs">Urutkan</Label>
              <select className="h-9 rounded-md border bg-background px-2 text-sm" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                <option value="profit">Laba terbesar</option><option value="points">Poin terbanyak</option>
                <option value="spend">Belanja terbesar</option><option value="name">Nama</option>
              </select>
            </div>
            {loadingStats && <span className="pb-2 text-xs text-muted-foreground">Menghitung laba pelanggan…</span>}
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Card className="p-3"><div className="text-xs text-muted-foreground">Poin aktif</div><div className="text-lg font-bold">{summary.totalPoints.toLocaleString("id-ID")}</div></Card>
            <Card className="p-3"><div className="text-xs text-muted-foreground">Potensi biaya reward</div><div className="text-lg font-bold">{formatRupiah(summary.liability)}</div></Card>
            <Card className="p-3"><div className="text-xs text-muted-foreground">Reward diberikan (periode)</div><div className="text-lg font-bold">{formatRupiah(summary.givenPeriod)}</div></Card>
            <Card className="p-3"><div className="text-xs text-muted-foreground">Laba pelanggan setelah reward</div><div className="text-lg font-bold">{formatRupiah(summary.net)}</div></Card>
          </div>
          <p className="text-xs text-muted-foreground">Poin tidak mengurangi kas/laba. Hanya reward yang diberikan dicatat sebagai biaya loyalitas dan mengurangi keuntungan.</p>
        </>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Cari nama, no. HP, atau alamat..." value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Nama</th><th className="p-3">No. HP</th>
                {!isOwner && <th className="p-3">Alamat</th>}
                <th className="p-3 text-right">Poin</th>
                {isOwner && <><th className="p-3 text-right">Trx</th><th className="p-3 text-right">Belanja</th><th className="p-3 text-right">Laba</th><th className="p-3">Status</th><th className="p-3 text-right">Rekomendasi</th></>}
                {!isOwner && <th className="p-3">Catatan</th>}
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={cols} className="p-12 text-center text-muted-foreground"><Users className="mx-auto mb-3 h-12 w-12 opacity-30" />Belum ada pelanggan</td></tr>
              ) : filtered.map((c) => (
                <tr key={c.id} className="border-t hover:bg-muted/40">
                  <td className="p-3 font-medium">{c.name}</td>
                  <td className="p-3">{c.phone || "-"}</td>
                  {!isOwner && <td className="p-3">{c.address || "-"}</td>}
                  <td className="p-3 text-right font-semibold">{c.points ?? 0}</td>
                  {isOwner && <>
                    <td className="p-3 text-right">{c.tx}</td>
                    <td className="p-3 text-right">{formatRupiah(c.spend)}</td>
                    <td className="p-3 text-right">{formatRupiah(c.profit)}</td>
                    <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tierClass[c.tier]}`}>{c.tier}</span></td>
                    <td className="p-3 text-right">{c.rec > 0 ? formatRupiah(c.rec) : "-"}{c.given > 0 && <div className="text-xs text-muted-foreground">sudah {formatRupiah(c.given)}</div>}</td>
                  </>}
                  {!isOwner && <td className="p-3 text-muted-foreground">{c.note || "-"}</td>}
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      {isOwner && <Button size="icon" variant="ghost" title="Beri Reward" onClick={() => openReward(c)}><Gift className="h-4 w-4" /></Button>}
                      <Button size="icon" variant="ghost" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(c)} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {isOwner && rewards.length > 0 && (
        <Card className="p-3">
          <div className="mb-2 font-semibold">Riwayat Reward</div>
          <div className="space-y-1 text-sm">
            {rewards.slice(0, 50).map((r) => (
              <div key={r.id} className="flex flex-wrap justify-between gap-2 border-t py-1">
                <span>{new Date(r.created_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })} · {r.customer_name} · {typeLabel[r.reward_type] || r.reward_type}{r.description ? ` (${r.description})` : ""}</span>
                <span className="font-medium">{formatRupiah(Number(r.amount))}{r.points_used > 0 ? ` · ${r.points_used} poin` : ""}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form.id ? "Edit Pelanggan" : "Tambah Pelanggan"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nama *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>No. HP / WhatsApp</Label><Input inputMode="numeric" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/[^\d+]/g, "") })} placeholder="08xxxxxxxxxx" /></div>
            <div><Label>Alamat</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div><Label>Catatan</Label><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Aturan Reward</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Batas reward (% dari laba pelanggan)</Label><Input type="number" value={settingsForm.reward_cap_percent} onChange={(e) => setSettingsForm({ ...settingsForm, reward_cap_percent: Number(e.target.value) })} /></div>
            <div><Label>Silver mulai laba (Rp)</Label><Input type="number" value={settingsForm.silver_min} onChange={(e) => setSettingsForm({ ...settingsForm, silver_min: Number(e.target.value) })} /></div>
            <div><Label>Gold mulai laba (Rp)</Label><Input type="number" value={settingsForm.gold_min} onChange={(e) => setSettingsForm({ ...settingsForm, gold_min: Number(e.target.value) })} /></div>
            <div><Label>Platinum mulai laba (Rp)</Label><Input type="number" value={settingsForm.platinum_min} onChange={(e) => setSettingsForm({ ...settingsForm, platinum_min: Number(e.target.value) })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setSettingsOpen(false)}>Batal</Button><Button onClick={saveSettings}>Simpan</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rewardFor} onOpenChange={(o) => !o && setRewardFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Beri Reward — {rewardFor?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Jenis reward</Label>
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={rw.type} onChange={(e) => setRw({ ...rw, type: e.target.value })}>
                <option value="voucher">Voucher belanja (keluar kas)</option>
                <option value="product">Produk bonus (biaya modal barang, tidak keluar kas)</option>
                <option value="cash">Uang tunai (keluar kas)</option>
              </select>
            </div>
            <div><Label>{rw.type === "product" ? "Nilai modal barang (Rp)" : "Nominal (Rp)"}</Label><Input type="number" value={rw.amount} onChange={(e) => setRw({ ...rw, amount: e.target.value })} /></div>
            <div><Label>Poin dipakai (punya {rewardFor?.points ?? 0})</Label><Input type="number" value={rw.points} onChange={(e) => setRw({ ...rw, points: e.target.value })} /></div>
            <div><Label>Keterangan</Label><Input value={rw.description} onChange={(e) => setRw({ ...rw, description: e.target.value })} placeholder="mis. Reward akhir tahun" /></div>
            <p className="text-xs text-muted-foreground">Reward mengurangi keuntungan sebagai biaya loyalitas. Voucher/uang juga dicatat sebagai uang keluar di Pembukuan. Untuk produk bonus, kurangi stok barang secara manual.</p>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setRewardFor(null)}>Batal</Button><Button onClick={giveReward} disabled={saving}>{saving ? "Menyimpan..." : "Berikan"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
