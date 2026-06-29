import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BookOpen, TrendingUp, TrendingDown, Wallet, Download, Plus, Trash2 } from "lucide-react";
import { formatRupiah } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/pembukuan")({
  component: PembukuanPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">Gagal memuat pembukuan: {String(error)}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Halaman tidak ditemukan.</div>,
});

type Entry = {
  id: string;
  date: string;
  kind: "in" | "out";
  source: "Penjualan" | "PO" | "Manual";
  description: string;
  ref?: string;
  debit: number;
  kredit: number;
  manualId?: string;
};

function todayStr(off = 0) {
  const d = new Date();
  d.setDate(d.getDate() + off);
  return d.toISOString().slice(0, 10);
}

function PembukuanPage() {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [fromDate, setFromDate] = useState(todayStr(-30));
  const [toDate, setToDate] = useState(todayStr(0));
  const [filterKind, setFilterKind] = useState<"all" | "in" | "out">("all");
  const [q, setQ] = useState("");
  const [tenantId, setTenantId] = useState<string | null>(null);

  // Add dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    kind: "in" as "in" | "out",
    entry_date: todayStr(0),
    description: "",
    ref: "",
    amount: "",
  });
  const [saving, setSaving] = useState(false);

  // Delete confirmation + password
  const [pendingDelete, setPendingDelete] = useState<Entry | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: tid } = await supabase.rpc("current_tenant_id");
    const tenant = tid as string | null;
    setTenantId(tenant);
    if (!tenant) {
      setEntries([]);
      setLoading(false);
      return;
    }

    const [txRes, poRes, bkRes] = await Promise.all([
      supabase
        .from("transactions")
        .select("id, total, created_at, payment_method, customer_name")
        .eq("tenant_id", tenant)
        .order("created_at", { ascending: false })
        .limit(5000),
      supabase
        .from("purchase_orders")
        .select("id, total, supplier, status, received_at, created_at")
        .eq("tenant_id", tenant)
        .eq("status", "received")
        .order("received_at", { ascending: false })
        .limit(2000),
      supabase
        .from("bookkeeping_entries" as any)
        .select("id, entry_date, kind, description, ref, amount")
        .eq("tenant_id", tenant)
        .order("entry_date", { ascending: false })
        .limit(5000),
    ]);

    const list: Entry[] = [];
    for (const t of (txRes.data || []) as any[]) {
      list.push({
        id: "t-" + t.id,
        date: t.created_at,
        kind: "in",
        source: "Penjualan",
        description: `Penjualan${t.customer_name ? " — " + t.customer_name : ""} (${(t.payment_method || "cash").toUpperCase()})`,
        ref: String(t.id).slice(0, 8).toUpperCase(),
        debit: Number(t.total) || 0,
        kredit: 0,
      });
    }
    for (const p of (poRes.data || []) as any[]) {
      list.push({
        id: "p-" + p.id,
        date: p.received_at || p.created_at,
        kind: "out",
        source: "PO",
        description: `PO Diterima${p.supplier ? " — " + p.supplier : ""}`,
        ref: String(p.id).slice(0, 8).toUpperCase(),
        debit: 0,
        kredit: Number(p.total) || 0,
      });
    }
    for (const b of (bkRes.data || []) as any[]) {
      const amt = Number(b.amount) || 0;
      list.push({
        id: "b-" + b.id,
        manualId: b.id,
        date: b.entry_date,
        kind: b.kind,
        source: "Manual",
        description: b.description,
        ref: b.ref || undefined,
        debit: b.kind === "in" ? amt : 0,
        kredit: b.kind === "out" ? amt : 0,
      });
    }
    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setEntries(list);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const from = fromDate ? new Date(fromDate + "T00:00:00") : null;
    const to = toDate ? new Date(toDate + "T23:59:59") : null;
    const qq = q.trim().toLowerCase();
    return entries.filter((e) => {
      const d = new Date(e.date);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (filterKind !== "all" && e.kind !== filterKind) return false;
      if (qq && !`${e.description} ${e.ref ?? ""}`.toLowerCase().includes(qq)) return false;
      return true;
    });
  }, [entries, fromDate, toDate, filterKind, q]);

  const withBalance = useMemo(() => {
    const asc = [...filtered].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let bal = 0;
    const map = new Map<string, number>();
    for (const e of asc) {
      bal += e.debit - e.kredit;
      map.set(e.id, bal);
    }
    return filtered.map((e) => ({ ...e, balance: map.get(e.id) ?? 0 }));
  }, [filtered]);

  const totals = useMemo(() => {
    let debit = 0, kredit = 0;
    for (const e of filtered) {
      debit += e.debit;
      kredit += e.kredit;
    }
    return { debit, kredit, saldo: debit - kredit };
  }, [filtered]);

  const exportCsv = () => {
    const header = ["Tanggal", "Sumber", "Keterangan", "Ref", "Debit", "Kredit", "Saldo"];
    const rows = withBalance
      .slice()
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((e) => [
        new Date(e.date).toLocaleString("id-ID"),
        e.source,
        e.description.replace(/"/g, '""'),
        e.ref ?? "",
        e.debit,
        e.kredit,
        e.balance,
      ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pembukuan_${fromDate}_${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const submitAdd = async () => {
    if (!tenantId) {
      toast.error("Toko belum terhubung.");
      return;
    }
    const amt = Number(addForm.amount);
    if (!addForm.description.trim() || !Number.isFinite(amt) || amt <= 0) {
      toast.error("Lengkapi keterangan dan nominal (> 0).");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("bookkeeping_entries" as any).insert({
      tenant_id: tenantId,
      entry_date: new Date(addForm.entry_date + "T" + new Date().toTimeString().slice(0, 8)).toISOString(),
      kind: addForm.kind,
      description: addForm.description.trim(),
      ref: addForm.ref.trim() || null,
      amount: amt,
    });
    setSaving(false);
    if (error) {
      toast.error("Gagal menyimpan: " + error.message);
      return;
    }
    toast.success("Catatan ditambahkan");
    setAddOpen(false);
    setAddForm({ kind: "in", entry_date: todayStr(0), description: "", ref: "", amount: "" });
    load();
  };

  const askDelete = (e: Entry) => {
    if (!e.manualId) {
      toast.error("Hanya catatan manual yang bisa dihapus dari sini.");
      return;
    }
    setPendingDelete(e);
  };

  const confirmDeleteOpenPw = () => {
    setPwOpen(true);
  };

  const doDelete = async () => {
    if (!pendingDelete?.manualId) return;
    setDeleting(true);
    // verify password via supabase re-auth
    const { data: userRes } = await supabase.auth.getUser();
    const email = userRes.user?.email;
    if (!email) {
      setDeleting(false);
      toast.error("Sesi tidak valid.");
      return;
    }
    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });
    if (authErr) {
      setDeleting(false);
      toast.error("Password salah.");
      return;
    }
    const { error } = await supabase
      .from("bookkeeping_entries" as any)
      .delete()
      .eq("id", pendingDelete.manualId);
    setDeleting(false);
    if (error) {
      toast.error("Gagal hapus: " + error.message);
      return;
    }
    toast.success("Catatan dihapus");
    setPassword("");
    setPwOpen(false);
    setPendingDelete(null);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Pembukuan</h1>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> Tambah Catatan
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Catatan debit/kredit otomatis dari penjualan & PO yang diterima, plus catatan manual.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingUp className="h-4 w-4 text-emerald-600" /> Total Debit (Masuk)
          </div>
          <div className="mt-1 text-xl font-bold text-emerald-600 tabular-nums">{formatRupiah(totals.debit)}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingDown className="h-4 w-4 text-destructive" /> Total Kredit (Keluar)
          </div>
          <div className="mt-1 text-xl font-bold text-destructive tabular-nums">{formatRupiah(totals.kredit)}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Wallet className="h-4 w-4 text-primary" /> Saldo Bersih
          </div>
          <div className={`mt-1 text-xl font-bold tabular-nums ${totals.saldo >= 0 ? "text-primary" : "text-destructive"}`}>
            {formatRupiah(totals.saldo)}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <Label className="text-xs">Dari</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Sampai</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Jenis</Label>
            <div className="mt-1 flex gap-1">
              {(["all", "in", "out"] as const).map((k) => (
                <Button
                  key={k}
                  size="sm"
                  variant={filterKind === k ? "default" : "outline"}
                  onClick={() => setFilterKind(k)}
                >
                  {k === "all" ? "Semua" : k === "in" ? "Masuk" : "Keluar"}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs">Cari</Label>
            <Input placeholder="Keterangan / ref…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={withBalance.length === 0}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2">Tanggal</th>
                <th className="p-2">Sumber</th>
                <th className="p-2">Keterangan</th>
                <th className="p-2">Ref</th>
                <th className="p-2 text-right">Debit</th>
                <th className="p-2 text-right">Kredit</th>
                <th className="p-2 text-right">Saldo</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-muted-foreground">Memuat...</td>
                </tr>
              )}
              {!loading && withBalance.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-muted-foreground">
                    Tidak ada catatan pada rentang ini.
                  </td>
                </tr>
              )}
              {withBalance.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="p-2 whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(e.date).toLocaleString("id-ID", {
                      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                  </td>
                  <td className="p-2">
                    <Badge variant={e.source === "Manual" ? "default" : e.kind === "in" ? "secondary" : "outline"}>
                      {e.source}
                    </Badge>
                  </td>
                  <td className="p-2">{e.description}</td>
                  <td className="p-2 font-mono text-xs text-muted-foreground">{e.ref}</td>
                  <td className="p-2 text-right tabular-nums text-emerald-600">
                    {e.debit ? formatRupiah(e.debit) : "—"}
                  </td>
                  <td className="p-2 text-right tabular-nums text-destructive">
                    {e.kredit ? formatRupiah(e.kredit) : "—"}
                  </td>
                  <td className={`p-2 text-right font-semibold tabular-nums ${e.balance >= 0 ? "" : "text-destructive"}`}>
                    {formatRupiah(e.balance)}
                  </td>
                  <td className="p-2 text-right">
                    {e.manualId ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => askDelete(e)}
                        title="Hapus catatan"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
            {withBalance.length > 0 && (
              <tfoot className="bg-muted/40 font-semibold">
                <tr>
                  <td className="p-2" colSpan={4}>Total ({withBalance.length} catatan)</td>
                  <td className="p-2 text-right tabular-nums text-emerald-600">{formatRupiah(totals.debit)}</td>
                  <td className="p-2 text-right tabular-nums text-destructive">{formatRupiah(totals.kredit)}</td>
                  <td className={`p-2 text-right tabular-nums ${totals.saldo >= 0 ? "text-primary" : "text-destructive"}`}>
                    {formatRupiah(totals.saldo)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah Catatan Pembukuan</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Jenis</Label>
              <div className="mt-1 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={addForm.kind === "in" ? "default" : "outline"}
                  onClick={() => setAddForm((f) => ({ ...f, kind: "in" }))}
                >
                  <TrendingUp className="h-4 w-4" /> Masuk (Debit)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={addForm.kind === "out" ? "default" : "outline"}
                  onClick={() => setAddForm((f) => ({ ...f, kind: "out" }))}
                >
                  <TrendingDown className="h-4 w-4" /> Keluar (Kredit)
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-xs">Tanggal</Label>
              <Input
                type="date"
                value={addForm.entry_date}
                onChange={(e) => setAddForm((f) => ({ ...f, entry_date: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Keterangan</Label>
              <Input
                placeholder="cth: Setor modal, Bayar listrik, dll"
                value={addForm.description}
                onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Referensi (opsional)</Label>
              <Input
                placeholder="cth: No. nota, kwitansi"
                value={addForm.ref}
                onChange={(e) => setAddForm((f) => ({ ...f, ref: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Nominal (Rp)</Label>
              <Input
                type="number"
                min={0}
                value={addForm.amount}
                onChange={(e) => setAddForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>Batal</Button>
            <Button onClick={submitAdd} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!pendingDelete && !pwOpen} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus catatan ini?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.description} — {formatRupiah((pendingDelete?.debit || 0) + (pendingDelete?.kredit || 0))}.
              Tindakan ini memerlukan password toko.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteOpenPw}>Ya, hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Password verify */}
      <Dialog open={pwOpen} onOpenChange={(o) => { if (!o) { setPwOpen(false); setPassword(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verifikasi Password Toko</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Masukkan password akun tenant Anda</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter" && password) doDelete(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPwOpen(false); setPassword(""); }} disabled={deleting}>
              Batal
            </Button>
            <Button variant="destructive" onClick={doDelete} disabled={deleting || !password}>
              {deleting ? "Memverifikasi..." : "Hapus"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
