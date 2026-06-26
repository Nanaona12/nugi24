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
import { Plus, Pencil, KeyRound, Trash2, UserCircle2, Loader2, Power, Wallet, TrendingUp, Megaphone, Printer, CalendarRange } from "lucide-react";
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

  // Cutoff & payday settings (persisted locally)
  const [cutoffDay, setCutoffDay] = useState<number>(() => parseInt(localStorage.getItem("salary_cutoff_day") || "14", 10));
  const [paydayDay, setPaydayDay] = useState<number>(() => parseInt(localStorage.getItem("salary_payday") || "25", 10));
  useEffect(() => { localStorage.setItem("salary_cutoff_day", String(cutoffDay)); }, [cutoffDay]);
  useEffect(() => { localStorage.setItem("salary_payday", String(paydayDay)); }, [paydayDay]);

  type Perf = { cashier_id: string; revenue: number; profit: number; shifts: number; tx_count: number };
  const [perf, setPerf] = useState<Record<string, Perf>>({});
  const [perfLoading, setPerfLoading] = useState(false);
  // Period anchor = payday month (e.g. 2026-06 → period 15 May .. 14 Jun, paid 25 Jun)
  const [month, setMonth] = useState<string>(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const periodRange = (() => {
    const [y, m] = month.split("-").map((n) => parseInt(n, 10));
    // end = cutoffDay of selected month (inclusive day → exclusive next day)
    const end = new Date(y, m - 1, cutoffDay + 1);
    const start = new Date(y, m - 2, cutoffDay + 1); // previous month cutoff+1
    const payday = new Date(y, m - 1, paydayDay);
    return { start, end, payday };
  })();

  const fmtDate = (d: Date) => d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

  const loadPerformance = async () => {
    setPerfLoading(true);
    try {
      const { start, end } = periodRange;
      // Pull shifts in period → they hold the real cashier_id (cashiers.id)
      const { data: shifts } = await supabase
        .from("cashier_shifts")
        .select("id,cashier_id,opened_at")
        .gte("opened_at", start.toISOString())
        .lt("opened_at", end.toISOString());
      const shiftList = (shifts || []) as { id: string; cashier_id: string; opened_at: string }[];
      const shiftMap = new Map(shiftList.map((s) => [s.id, s.cashier_id]));
      const shiftIds = shiftList.map((s) => s.id);

      let txList: { id: string; shift_id: string | null; total: number }[] = [];
      if (shiftIds.length) {
        const { data: txs } = await supabase
          .from("transactions")
          .select("id,shift_id,total")
          .in("shift_id", shiftIds);
        txList = (txs || []) as any;
      }
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
      const ensure = (cid: string) => (map[cid] = map[cid] || { cashier_id: cid, revenue: 0, profit: 0, shifts: 0, tx_count: 0 });
      for (const it of itemsRes) {
        const t = txMap.get(it.transaction_id); if (!t || !t.shift_id) continue;
        const cid = shiftMap.get(t.shift_id); if (!cid) continue;
        const conv = Number(it.unit_conversion || 1);
        const rev = Number(it.unit_price) * Number(it.qty);
        const cost = Number(it.unit_cost || 0) * Number(it.qty) * conv;
        const p = ensure(cid);
        p.revenue += rev;
        p.profit += rev - cost;
      }
      for (const t of txList) {
        if (!t.shift_id) continue;
        const cid = shiftMap.get(t.shift_id); if (!cid) continue;
        const p = ensure(cid);
        p.tx_count += 1;
      }
      for (const s of shiftList) {
        if (!shiftSet[s.cashier_id]) shiftSet[s.cashier_id] = new Set();
        shiftSet[s.cashier_id].add(s.id);
        ensure(s.cashier_id);
      }
      Object.keys(map).forEach((k) => { map[k].shifts = shiftSet[k]?.size || 0; });
      setPerf(map);
    } catch (e: any) { toast.error(e.message); }
    finally { setPerfLoading(false); }
  };

  useEffect(() => { loadPerformance(); }, [month, cutoffDay]);


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
            <p className="text-xs text-muted-foreground">Periode gaji mengikuti tanggal cut-off. Bonus = % keuntungan yang dihasilkan tiap kasir selama periode. Cetak struk tanda terima saat membayar.</p>
          </div>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 w-44" />
        </div>

        <div className="mb-3 grid gap-3 sm:grid-cols-5">
          <div>
            <Label className="text-xs">Gaji Pokok / bulan</Label>
            <Input inputMode="numeric" value={formatRupiah(baseSalary)} onChange={(e) => setBaseSalary(parseNumber(e.target.value))} />
          </div>
          <div>
            <Label className="text-xs">Bonus Keuntungan (%)</Label>
            <Input inputMode="decimal" value={String(profitPct)} onChange={(e) => setProfitPct(parseFloat(e.target.value.replace(",", ".")) || 0)} />
          </div>
          <div>
            <Label className="text-xs flex items-center gap-1"><Megaphone className="h-3 w-3" /> Bonus Referral</Label>
            <Input inputMode="numeric" value={formatRupiah(referralBonus)} onChange={(e) => setReferralBonus(parseNumber(e.target.value))} />
          </div>
          <div>
            <Label className="text-xs">Cut-off (tanggal)</Label>
            <Input type="number" min={1} max={28} value={cutoffDay} onChange={(e) => setCutoffDay(Math.min(28, Math.max(1, parseInt(e.target.value) || 14)))} />
          </div>
          <div>
            <Label className="text-xs">Tanggal Gajian</Label>
            <Input type="number" min={1} max={31} value={paydayDay} onChange={(e) => setPaydayDay(Math.min(31, Math.max(1, parseInt(e.target.value) || 25)))} />
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs">
          <CalendarRange className="h-4 w-4 text-primary" />
          <span>Periode kerja: <b>{fmtDate(periodRange.start)}</b> s/d <b>{fmtDate(new Date(periodRange.end.getTime() - 86400000))}</b></span>
          <span className="ml-auto">Tanggal bayar: <b>{fmtDate(periodRange.payday)}</b></span>
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
                <th className="p-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {perfLoading ? (
                <tr><td colSpan={8} className="p-6 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Belum ada kasir.</td></tr>
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
                    <td className="p-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => printPayslip(c, p, bonus, total)} title="Cetak struk gaji">
                        <Printer className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Data diambil dari shift kasir yang dibuka pada periode di atas. Jika kosong, pastikan kasir login & buka shift di halaman Kasir.
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
