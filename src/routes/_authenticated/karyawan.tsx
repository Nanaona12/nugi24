import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Pencil, KeyRound, Trash2, UserCircle2, Loader2, Power, Wallet, TrendingUp, Megaphone } from "lucide-react";
import { createCashier, deleteCashier, listCashiers, updateCashier } from "@/lib/cashier.functions";
import { supabase } from "@/integrations/supabase/client";
import { formatRupiah, parseNumber } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/karyawan")({
  component: KaryawanPage,
});

type Cashier = { id: string; name: string; active: boolean; created_at?: string };

function KaryawanPage() {
  const [items, setItems] = useState<Cashier[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<{ id?: string; name: string; pin: string; active: boolean }>({ name: "", pin: "", active: true });
  const [pinOpen, setPinOpen] = useState<null | Cashier>(null);
  const [newPin, setNewPin] = useState("");
  const [saving, setSaving] = useState(false);

  // Salary recommendation settings (persisted locally)
  const [baseSalary, setBaseSalary] = useState<number>(() => parseInt(localStorage.getItem("salary_base") || "1500000", 10));
  const [profitPct, setProfitPct] = useState<number>(() => parseFloat(localStorage.getItem("salary_profit_pct") || "5"));
  const [referralBonus, setReferralBonus] = useState<number>(() => parseInt(localStorage.getItem("salary_referral") || "50000", 10));
  useEffect(() => { localStorage.setItem("salary_base", String(baseSalary)); }, [baseSalary]);
  useEffect(() => { localStorage.setItem("salary_profit_pct", String(profitPct)); }, [profitPct]);
  useEffect(() => { localStorage.setItem("salary_referral", String(referralBonus)); }, [referralBonus]);

  type Perf = { cashier_id: string; revenue: number; profit: number; shifts: number; tx_count: number };
  const [perf, setPerf] = useState<Record<string, Perf>>({});
  const [perfLoading, setPerfLoading] = useState(false);
  const [month, setMonth] = useState<string>(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const loadPerformance = async () => {
    setPerfLoading(true);
    try {
      const [y, m] = month.split("-").map((n) => parseInt(n, 10));
      const start = new Date(y, m - 1, 1).toISOString();
      const end = new Date(y, m, 1).toISOString();
      const { data: txs } = await supabase
        .from("transactions")
        .select("id,cashier_id,shift_id,total,created_at")
        .gte("created_at", start).lt("created_at", end);
      const txList = (txs || []) as { id: string; cashier_id: string | null; shift_id: string | null; total: number }[];
      const txMap = new Map(txList.map((t) => [t.id, t]));
      const ids = txList.map((t) => t.id);
      let itemsRes: { transaction_id: string; qty: number; unit_price: number; unit_cost: number; unit_conversion?: number | null }[] = [];
      if (ids.length) {
        const { data: its } = await supabase
          .from("transaction_items")
          .select("transaction_id,qty,unit_price,unit_cost,unit_conversion")
          .in("transaction_id", ids);
        itemsRes = (its || []) as any;
      }
      const map: Record<string, Perf> = {};
      const shiftSet: Record<string, Set<string>> = {};
      for (const it of itemsRes) {
        const t = txMap.get(it.transaction_id); if (!t || !t.cashier_id) continue;
        const conv = Number(it.unit_conversion || 1);
        const rev = Number(it.unit_price) * Number(it.qty);
        const cost = Number(it.unit_cost || 0) * Number(it.qty) * conv;
        const p = map[t.cashier_id] || { cashier_id: t.cashier_id, revenue: 0, profit: 0, shifts: 0, tx_count: 0 };
        p.revenue += rev;
        p.profit += rev - cost;
        map[t.cashier_id] = p;
      }
      for (const t of txList) {
        if (!t.cashier_id) continue;
        const p = map[t.cashier_id] || { cashier_id: t.cashier_id, revenue: 0, profit: 0, shifts: 0, tx_count: 0 };
        p.tx_count += 1;
        if (t.shift_id) {
          if (!shiftSet[t.cashier_id]) shiftSet[t.cashier_id] = new Set();
          shiftSet[t.cashier_id].add(t.shift_id);
        }
        map[t.cashier_id] = p;
      }
      Object.keys(map).forEach((k) => { map[k].shifts = shiftSet[k]?.size || 0; });
      setPerf(map);
    } catch (e: any) { toast.error(e.message); }
    finally { setPerfLoading(false); }
  };

  useEffect(() => { loadPerformance(); }, [month]);

  const listFn = useServerFn(listCashiers);
  const createFn = useServerFn(createCashier);
  const updateFn = useServerFn(updateCashier);
  const deleteFn = useServerFn(deleteCashier);

  const reload = async () => {
    setLoading(true);
    try { setItems(((await listFn()) as Cashier[]) || []); }
    catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, []);

  const openNew = () => { setForm({ name: "", pin: "", active: true }); setEditOpen(true); };
  const openEdit = (c: Cashier) => { setForm({ id: c.id, name: c.name, pin: "", active: c.active }); setEditOpen(true); };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Nama wajib"); return; }
    setSaving(true);
    try {
      if (form.id) {
        await updateFn({ data: { id: form.id, name: form.name.trim(), active: form.active } });
        toast.success("Tersimpan");
      } else {
        if (!/^\d{4,6}$/.test(form.pin)) { toast.error("PIN harus 4-6 angka"); setSaving(false); return; }
        await createFn({ data: { name: form.name.trim(), pin: form.pin } });
        toast.success("Kasir ditambahkan");
      }
      setEditOpen(false);
      reload();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const resetPin = async () => {
    if (!pinOpen) return;
    if (!/^\d{4,6}$/.test(newPin)) { toast.error("PIN harus 4-6 angka"); return; }
    setSaving(true);
    try {
      await updateFn({ data: { id: pinOpen.id, newPin } });
      toast.success("PIN diubah");
      setPinOpen(null); setNewPin("");
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const toggleActive = async (c: Cashier) => {
    try {
      await updateFn({ data: { id: c.id, active: !c.active } });
      reload();
    } catch (e: any) { toast.error(e.message); }
  };

  const remove = async (c: Cashier) => {
    if (!confirm(`Hapus kasir "${c.name}"? Bila sudah ada riwayat, akun akan dinonaktifkan saja.`)) return;
    try {
      const res = (await deleteFn({ data: { id: c.id } })) as any;
      toast.success(res?.softDeleted ? "Kasir dinonaktifkan (ada riwayat)" : "Kasir dihapus");
      reload();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Karyawan / Kasir</h1>
          <p className="text-xs text-muted-foreground">Buat akun PIN untuk tiap kasir. Kasir login dgn PIN di halaman Kasir tanpa keluar dari akun pemilik.</p>
        </div>
        <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Tambah Kasir</Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Nama</th>
                <th className="p-3">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3} className="p-8 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={3} className="p-12 text-center text-muted-foreground">
                  <UserCircle2 className="mx-auto mb-3 h-10 w-10 opacity-40" />
                  <div>Belum ada akun kasir.</div>
                  <div className="text-xs">Klik "Tambah Kasir" untuk buat akun PIN.</div>
                </td></tr>
              ) : items.map((c) => (
                <tr key={c.id} className="border-t hover:bg-muted/40">
                  <td className="p-3 font-medium">{c.name}</td>
                  <td className="p-3">
                    <Badge variant={c.active ? "default" : "secondary"}>{c.active ? "Aktif" : "Nonaktif"}</Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setPinOpen(c)} title="Reset PIN">
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleActive(c)} title={c.active ? "Nonaktifkan" : "Aktifkan"}>
                        <Power className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(c)} title="Edit nama">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(c)} title="Hapus">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Rekomendasi Gaji */}
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold"><Wallet className="h-4 w-4 text-primary" /> Rekomendasi Gaji & Bonus Kinerja</h2>
            <p className="text-xs text-muted-foreground">Hitung gaji bulanan otomatis: gaji pokok + bonus % dari keuntungan yang dihasilkan kasir di bulan terpilih. Tambah bonus referral bila kasir mengajak pelanggan/promosi toko.</p>
          </div>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 w-44" />
        </div>

        <div className="mb-3 grid gap-3 sm:grid-cols-3">
          <div>
            <Label className="text-xs">Gaji Pokok / bulan</Label>
            <Input inputMode="numeric" value={formatRupiah(baseSalary)} onChange={(e) => setBaseSalary(parseNumber(e.target.value))} />
          </div>
          <div>
            <Label className="text-xs">Bonus dari Keuntungan (%)</Label>
            <Input inputMode="decimal" value={String(profitPct)} onChange={(e) => setProfitPct(parseFloat(e.target.value.replace(",", ".")) || 0)} />
          </div>
          <div>
            <Label className="text-xs flex items-center gap-1"><Megaphone className="h-3 w-3" /> Bonus Referral / pelanggan baru</Label>
            <Input inputMode="numeric" value={formatRupiah(referralBonus)} onChange={(e) => setReferralBonus(parseNumber(e.target.value))} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2">Kasir</th>
                <th className="p-2 text-right">Shift</th>
                <th className="p-2 text-right">Transaksi</th>
                <th className="p-2 text-right">Omzet</th>
                <th className="p-2 text-right">Keuntungan</th>
                <th className="p-2 text-right">Bonus Kinerja</th>
                <th className="p-2 text-right">Total Rekomendasi</th>
              </tr>
            </thead>
            <tbody>
              {perfLoading ? (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Belum ada kasir.</td></tr>
              ) : items.map((c) => {
                const p = perf[c.id] || { revenue: 0, profit: 0, shifts: 0, tx_count: 0 };
                const bonus = Math.max(0, Math.round((p.profit * profitPct) / 100));
                const total = baseSalary + bonus;
                return (
                  <tr key={c.id} className="border-t">
                    <td className="p-2 font-medium">{c.name}</td>
                    <td className="p-2 text-right">{p.shifts}</td>
                    <td className="p-2 text-right">{p.tx_count}</td>
                    <td className="p-2 text-right">{formatRupiah(p.revenue)}</td>
                    <td className="p-2 text-right text-emerald-600">{formatRupiah(p.profit)}</td>
                    <td className="p-2 text-right"><span className="inline-flex items-center gap-1"><TrendingUp className="h-3 w-3 text-primary" />{formatRupiah(bonus)}</span></td>
                    <td className="p-2 text-right font-semibold">{formatRupiah(total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Tips: bagikan target keuntungan ke kasir agar termotivasi mengajak orang/promosi. Bonus referral bisa ditambahkan manual saat menggaji jika kasir berhasil membawa pelanggan baru.
        </p>
      </Card>


      {/* Edit / Tambah */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Kasir" : "Tambah Kasir"}</DialogTitle>
            <DialogDescription>
              {form.id ? "Ubah nama atau status kasir. Untuk ganti PIN gunakan tombol kunci pada baris kasir." : "Buat akun PIN baru untuk kasir."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nama</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nama kasir" autoFocus />
            </div>
            {!form.id && (
              <div>
                <Label className="text-xs">PIN (4-6 angka)</Label>
                <Input
                  inputMode="numeric"
                  maxLength={6}
                  value={form.pin}
                  onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                  placeholder="••••"
                  className="text-center text-xl tracking-[0.4em]"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={saving}>Batal</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset PIN */}
      <Dialog open={pinOpen !== null} onOpenChange={(o) => { if (!o) { setPinOpen(null); setNewPin(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset PIN {pinOpen?.name}</DialogTitle>
            <DialogDescription>Masukkan PIN baru 4-6 angka.</DialogDescription>
          </DialogHeader>
          <Input
            inputMode="numeric"
            maxLength={6}
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="••••"
            className="text-center text-xl tracking-[0.4em]"
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setPinOpen(null); setNewPin(""); }} disabled={saving}>Batal</Button>
            <Button onClick={resetPin} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan PIN</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
