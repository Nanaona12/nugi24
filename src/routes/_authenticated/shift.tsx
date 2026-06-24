import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { listShifts } from "@/lib/cashier.functions";
import { formatRupiah } from "@/lib/format";
import { Loader2, Receipt as ReceiptIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/shift")({
  component: ShiftHistoryPage,
});

type ShiftRow = {
  id: string;
  cashier_id: string;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  expected_cash: number;
  actual_cash: number;
  difference: number;
  total_sales: number;
  total_cash: number;
  total_qris: number;
  total_other: number;
  total_transactions: number;
  total_expenses: number;
  notes: string | null;
  status: string;
  cashiers: { name: string } | null;
};

function ShiftHistoryPage() {
  const [rows, setRows] = useState<ShiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const listFn = useServerFn(listShifts);

  useEffect(() => {
    (async () => {
      try { setRows(((await listFn()) as ShiftRow[]) || []); }
      catch (e: any) { toast.error(e.message); }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Riwayat Shift Kasir</h1>
        <p className="text-xs text-muted-foreground">200 shift terakhir. Klik shift untuk lihat rincian (segera hadir).</p>
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Kasir</th>
                <th className="p-3">Buka</th>
                <th className="p-3">Tutup</th>
                <th className="p-3 text-right">Trx</th>
                <th className="p-3 text-right">Penjualan</th>
                <th className="p-3 text-right">Tunai</th>
                <th className="p-3 text-right">QRIS</th>
                <th className="p-3 text-right">Pengeluaran</th>
                <th className="p-3 text-right">Selisih Kas</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="p-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={10} className="p-12 text-center text-muted-foreground">
                  <ReceiptIcon className="mx-auto mb-3 h-10 w-10 opacity-40" />
                  Belum ada shift tercatat.
                </td></tr>
              ) : rows.map((s) => {
                const diff = Number(s.difference) || 0;
                const diffLabel = s.status === "open" ? "—" : diff === 0 ? "Pas" : diff > 0 ? `+${formatRupiah(diff)}` : `-${formatRupiah(Math.abs(diff))}`;
                const diffTone = s.status !== "closed" ? "" : diff === 0 ? "" : diff > 0 ? "text-success" : "text-destructive";
                return (
                  <tr key={s.id} className="border-t hover:bg-muted/40">
                    <td className="p-3 font-medium">{s.cashiers?.name ?? "—"}</td>
                    <td className="p-3 text-xs">{new Date(s.opened_at).toLocaleString("id-ID")}</td>
                    <td className="p-3 text-xs">{s.closed_at ? new Date(s.closed_at).toLocaleString("id-ID") : "—"}</td>
                    <td className="p-3 text-right">{s.total_transactions}</td>
                    <td className="p-3 text-right">{formatRupiah(Number(s.total_sales) || 0)}</td>
                    <td className="p-3 text-right">{formatRupiah(Number(s.total_cash) || 0)}</td>
                    <td className="p-3 text-right">{formatRupiah(Number(s.total_qris) || 0)}</td>
                    <td className="p-3 text-right">{formatRupiah(Number(s.total_expenses) || 0)}</td>
                    <td className={`p-3 text-right font-medium ${diffTone}`}>{diffLabel}</td>
                    <td className="p-3">
                      <Badge variant={s.status === "open" ? "default" : "secondary"}>
                        {s.status === "open" ? "Berjalan" : "Ditutup"}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
