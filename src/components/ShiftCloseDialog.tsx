import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Plus, Printer, Trash2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { addShiftExpense, closeShift, deleteShiftExpense, getShiftSummary } from "@/lib/cashier.functions";
import { formatRupiah, parseNumber } from "@/lib/format";
import type { ActiveShift } from "@/components/CashierLock";

type Summary = {
  shift: any;
  cashier_name: string;
  totals: {
    total_sales: number; total_cash: number; total_qris: number; total_other: number;
    total_transactions: number; total_expenses: number; expected_cash: number; opening_cash: number;
  };
  expenses: { id: string; label: string; amount: number; created_at: string }[];
};

type Props = {
  open: boolean;
  shift: ActiveShift;
  storeName: string;
  onClose: () => void;
  /** Called after shift successfully closed. */
  onClosed: () => void;
};

export function ShiftCloseDialog({ open, shift, storeName, onClose, onClosed }: Props) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [actualCash, setActualCash] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [newExpLabel, setNewExpLabel] = useState("");
  const [newExpAmount, setNewExpAmount] = useState("");
  const [addingExp, setAddingExp] = useState(false);
  const [closed, setClosed] = useState<null | Summary["totals"]>(null);

  const summaryFn = useServerFn(getShiftSummary);
  const addExpFn = useServerFn(addShiftExpense);
  const delExpFn = useServerFn(deleteShiftExpense);
  const closeFn = useServerFn(closeShift);

  const reload = async () => {
    setLoading(true);
    try {
      const s = (await summaryFn({ data: { shift_id: shift.shift_id } })) as Summary;
      setSummary(s);
    } catch (e: any) {
      toast.error(e.message);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (open) { setActualCash(""); setNotes(""); setClosed(null); reload(); }
  }, [open, shift.shift_id]);

  const addExpense = async () => {
    if (!newExpLabel.trim()) { toast.error("Label wajib"); return; }
    const amt = parseNumber(newExpAmount);
    if (amt <= 0) { toast.error("Nominal harus > 0"); return; }
    setAddingExp(true);
    try {
      await addExpFn({ data: { shift_id: shift.shift_id, label: newExpLabel.trim(), amount: amt } });
      setNewExpLabel(""); setNewExpAmount("");
      await reload();
    } catch (e: any) { toast.error(e.message); }
    finally { setAddingExp(false); }
  };

  const removeExpense = async (id: string) => {
    try {
      await delExpFn({ data: { id } });
      await reload();
    } catch (e: any) { toast.error(e.message); }
  };

  const doClose = async () => {
    const actual = parseNumber(actualCash);
    if (actual < 0) { toast.error("Fisik kas tidak valid"); return; }
    setSubmitting(true);
    try {
      const res = (await closeFn({ data: { shift_id: shift.shift_id, actual_cash: actual, notes: notes.trim() || undefined } })) as any;
      setClosed(res.totals);
      toast.success("Shift ditutup");
      onClosed();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setSubmitting(false); }
  };

  const printSlip = () => {
    if (!summary || !closed) return;
    const w = window.open("", "_blank", "width=420,height=720");
    if (!w) { toast.error("Pop-up diblokir browser"); return; }
    const sign = closed.difference === 0 ? "Pas" : closed.difference > 0 ? `Lebih ${formatRupiah(closed.difference)}` : `Kurang ${formatRupiah(Math.abs(closed.difference))}`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Closing Shift</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 360px; margin: 12px auto; padding: 0 12px; color: #111; }
  h2 { text-align:center; margin: 4px 0; }
  .sub { text-align:center; font-size: 12px; color:#555; margin-bottom: 8px;}
  hr { border: none; border-top: 1px dashed #888; margin: 8px 0; }
  table { width: 100%; font-size: 13px; }
  td { padding: 2px 0; }
  td.r { text-align: right; }
  .big { font-size: 16px; font-weight: 700; }
  .ok { color: #15803d; } .bad { color: #b91c1c; }
  .note { font-size: 12px; margin-top: 8px; }
</style></head><body>
<h2>${storeName}</h2>
<div class="sub">Struk Closing Shift</div>
<hr/>
<table>
  <tr><td>Kasir</td><td class="r">${summary.cashier_name}</td></tr>
  <tr><td>Buka</td><td class="r">${new Date(summary.shift.opened_at).toLocaleString("id-ID")}</td></tr>
  <tr><td>Tutup</td><td class="r">${new Date().toLocaleString("id-ID")}</td></tr>
</table>
<hr/>
<table>
  <tr><td>Saldo awal kas</td><td class="r">${formatRupiah(closed.opening_cash)}</td></tr>
  <tr><td>Total transaksi</td><td class="r">${closed.total_transactions}</td></tr>
  <tr><td>Penjualan tunai</td><td class="r">${formatRupiah(closed.total_cash)}</td></tr>
  <tr><td>Penjualan QRIS</td><td class="r">${formatRupiah(closed.total_qris)}</td></tr>
  ${closed.total_other ? `<tr><td>Penjualan lainnya</td><td class="r">${formatRupiah(closed.total_other)}</td></tr>` : ""}
  <tr><td><b>Total penjualan</b></td><td class="r"><b>${formatRupiah(closed.total_sales)}</b></td></tr>
  <tr><td>Pengeluaran shift</td><td class="r">- ${formatRupiah(closed.total_expenses)}</td></tr>
</table>
${summary.expenses.length ? `<hr/><div style="font-size:12px;"><b>Rincian pengeluaran:</b><br/>${summary.expenses.map((e) => `${e.label} — ${formatRupiah(Number(e.amount))}`).join("<br/>")}</div>` : ""}
<hr/>
<table>
  <tr><td>Kas seharusnya</td><td class="r">${formatRupiah(closed.expected_cash)}</td></tr>
  <tr><td>Fisik kas</td><td class="r">${formatRupiah(closed.actual_cash)}</td></tr>
  <tr><td class="big">Selisih</td><td class="r big ${closed.difference < 0 ? "bad" : closed.difference > 0 ? "ok" : ""}">${sign}</td></tr>
</table>
${notes.trim() ? `<div class="note"><b>Catatan:</b> ${notes.replace(/</g, "&lt;")}</div>` : ""}
<hr/>
<div style="text-align:center;font-size:11px;color:#666;">Terima kasih</div>
<script>window.onload = () => { window.print(); };</script>
</body></html>`;
    w.document.write(html);
    w.document.close();
  };

  const cashExpected = summary ? summary.totals.expected_cash : 0;
  const actual = parseNumber(actualCash);
  const diff = actual - cashExpected;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{closed ? "Shift Ditutup" : "Closing Shift"}</DialogTitle>
          <DialogDescription>
            {closed ? "Shift sudah ditutup. Cetak struk closing atau tutup dialog." : "Periksa ringkasan, catat pengeluaran shift jika ada, lalu input fisik kas."}
          </DialogDescription>
        </DialogHeader>

        {loading || !summary ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Memuat ringkasan...
          </div>
        ) : (
          <>
            <Card className="space-y-1 p-3 text-sm">
              <Row label="Kasir" value={summary.cashier_name} />
              <Row label="Saldo awal kas" value={formatRupiah(summary.totals.opening_cash)} />
              <Row label="Total transaksi" value={String(summary.totals.total_transactions)} />
              <Row label="Penjualan tunai" value={formatRupiah(summary.totals.total_cash)} />
              <Row label="Penjualan QRIS" value={formatRupiah(summary.totals.total_qris)} />
              {summary.totals.total_other > 0 && <Row label="Penjualan lainnya" value={formatRupiah(summary.totals.total_other)} />}
              <Row label="Total penjualan" value={formatRupiah(summary.totals.total_sales)} bold />
              <Row label="Pengeluaran shift" value={`- ${formatRupiah(summary.totals.total_expenses)}`} />
              <div className="mt-2 border-t pt-2">
                <Row label="Kas seharusnya" value={formatRupiah(cashExpected)} bold />
              </div>
            </Card>

            {!closed && (
              <div className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Pengeluaran Shift</Label>
                  <span className="text-[11px] text-muted-foreground">{summary.expenses.length} catatan</span>
                </div>
                {summary.expenses.length > 0 && (
                  <ul className="space-y-1">
                    {summary.expenses.map((e) => (
                      <li key={e.id} className="flex items-center justify-between rounded bg-muted/40 px-2 py-1 text-xs">
                        <span className="truncate">{e.label}</span>
                        <span className="flex items-center gap-2">
                          <span className="font-medium">{formatRupiah(Number(e.amount))}</span>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeExpense(e.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap gap-2">
                  <Input placeholder="Label (mis. beli kresek)" value={newExpLabel} onChange={(e) => setNewExpLabel(e.target.value)} className="h-8 flex-1 min-w-[120px]" />
                  <Input placeholder="Nominal" value={newExpAmount} inputMode="numeric" onChange={(e) => setNewExpAmount(e.target.value)} className="h-8 w-32" />
                  <Button size="sm" onClick={addExpense} disabled={addingExp}>
                    {addingExp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            )}

            {!closed ? (
              <div className="space-y-2 rounded-md border p-3">
                <Label className="text-xs">Fisik Kas Akhir (uang tunai di laci)</Label>
                <Input
                  inputMode="numeric"
                  value={actualCash}
                  onChange={(e) => setActualCash(e.target.value)}
                  placeholder="0"
                  className="text-lg"
                />
                {actualCash !== "" && (
                  <div className={`text-sm font-semibold ${diff === 0 ? "text-foreground" : diff > 0 ? "text-success" : "text-destructive"}`}>
                    Selisih: {diff === 0 ? "Pas" : diff > 0 ? `Lebih ${formatRupiah(diff)}` : `Kurang ${formatRupiah(Math.abs(diff))}`}
                  </div>
                )}
                <Label className="text-xs">Catatan (opsional)</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="mis. ada selisih krn tip karyawan" rows={2} />
              </div>
            ) : (
              <Card className="space-y-1 p-3 text-sm">
                <Row label="Fisik kas" value={formatRupiah(closed.actual_cash)} />
                <Row
                  label="Selisih"
                  value={closed.difference === 0 ? "Pas" : closed.difference > 0 ? `Lebih ${formatRupiah(closed.difference)}` : `Kurang ${formatRupiah(Math.abs(closed.difference))}`}
                  tone={closed.difference === 0 ? "default" : closed.difference > 0 ? "ok" : "bad"}
                  bold
                />
              </Card>
            )}
          </>
        )}

        <DialogFooter>
          {!closed ? (
            <>
              <Button variant="ghost" onClick={onClose} disabled={submitting}>Batal</Button>
              <Button onClick={doClose} disabled={submitting || !summary}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Tutup Shift
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={printSlip}>
                <Printer className="mr-2 h-4 w-4" /> Cetak Struk
              </Button>
              <Button onClick={onClose}>Selesai</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: "ok" | "bad" | "default" }) {
  const toneCls = tone === "ok" ? "text-success" : tone === "bad" ? "text-destructive" : "";
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`${bold ? "font-semibold" : ""} ${toneCls}`}>{value}</span>
    </div>
  );
}
