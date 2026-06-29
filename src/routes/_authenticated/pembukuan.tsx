import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, TrendingUp, TrendingDown, Wallet, Download } from "lucide-react";
import { formatRupiah } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/pembukuan")({
  component: PembukuanPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">Gagal memuat pembukuan: {String(error)}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Halaman tidak ditemukan.</div>,
});

type Entry = {
  id: string;
  date: string; // ISO
  kind: "in" | "out";
  source: "Penjualan" | "PO";
  description: string;
  ref?: string;
  debit: number; // uang masuk
  kredit: number; // uang keluar
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

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: tid } = await supabase.rpc("current_tenant_id");
      const tenantId = tid as string | null;
      if (!tenantId) {
        setEntries([]);
        setLoading(false);
        return;
      }

      const [txRes, poRes] = await Promise.all([
        supabase
          .from("transactions")
          .select("id, total, created_at, payment_method, customer_name")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(5000),
        supabase
          .from("purchase_orders")
          .select("id, total, supplier, status, received_at, created_at")
          .eq("tenant_id", tenantId)
          .eq("status", "received")
          .order("received_at", { ascending: false })
          .limit(2000),
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
      list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setEntries(list);
      setLoading(false);
    })();
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

  // running balance computed from oldest -> newest
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">Pembukuan</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Catatan debit/kredit otomatis. Uang masuk dari penjualan, uang keluar dari PO yang sudah diterima (ACC).
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
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-muted-foreground">
                    Memuat...
                  </td>
                </tr>
              )}
              {!loading && withBalance.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-muted-foreground">
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
                    <Badge variant={e.kind === "in" ? "secondary" : "outline"}>{e.source}</Badge>
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
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </div>
  );
}
