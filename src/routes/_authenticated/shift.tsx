import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { listShifts, reviseShiftClosing } from "@/lib/cashier.functions";
import { formatRupiah } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Receipt as ReceiptIcon, FileText, FileDown, PencilLine } from "lucide-react";

export const Route = createFileRoute("/_authenticated/shift")({
  component: ShiftHistoryPage,
});


function parseRevisions(notes: string | null): { at: string | null; text: string }[] {
  return (notes || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("Revisi closing"))
    .map((l) => {
      const m = l.match(/^Revisi closing\s*\[([^\]]+)\]:\s*(.*)$/);
      if (m) return { at: m[1], text: m[2] };
      return { at: null, text: l.replace(/^Revisi closing:\s*/, "") };
    });
}

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
  const [storeName, setStoreName] = useState<string>("Toko");
  const listFn = useServerFn(listShifts);
  const reviseFn = useServerFn(reviseShiftClosing);
  const [reviseShift, setReviseShift] = useState<ShiftRow | null>(null);
  const [reviseCash, setReviseCash] = useState("");
  const [reviseNote, setReviseNote] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    try { setRows(((await listFn()) as ShiftRow[]) || []); }
    catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    reload();
    (async () => {
      const { data } = await supabase.rpc("current_tenant_info");
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.name) setStoreName(row.name as string);
    })();
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) return;
      const { data: t } = await supabase
        .from("tenants")
        .select("id")
        .eq("owner_user_id", u.user.id)
        .maybeSingle();
      setIsAdmin(!!t);
    })();
  }, []);

  const openRevise = (s: ShiftRow) => {
    setReviseShift(s);
    setReviseCash(String(Number(s.actual_cash) || 0));
    setReviseNote("");
  };

  const submitRevise = async () => {
    if (!reviseShift) return;
    const val = Number(String(reviseCash).replace(/[^\d]/g, ""));
    if (!Number.isFinite(val) || val < 0) { toast.error("Nominal tidak valid"); return; }
    setSaving(true);
    try {
      const res: any = await reviseFn({ data: { shift_id: reviseShift.id, actual_cash: val, note: reviseNote } });
      const delta = Number(res?.delta) || 0;
      toast.success(delta === 0 ? "Tidak ada perubahan" : delta > 0 ? `Uang bertambah ${formatRupiah(delta)}` : `Uang berkurang ${formatRupiah(Math.abs(delta))}`);
      setReviseShift(null);
      await reload();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };


  const esc = (s: string) => (s || "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] || c));

  const openPdf = async (s: ShiftRow) => {
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) { toast.error("Pop-up diblokir browser"); return; }
    let expenses: { label: string; amount: number; created_at: string }[] = [];
    const { data } = await supabase
      .from("shift_expenses")
      .select("label, amount, created_at")
      .eq("shift_id", s.id)
      .order("created_at", { ascending: true });
    expenses = (data as any[]) || [];

    const diff = Number(s.difference) || 0;
    const sign = s.status !== "closed" ? "—" : diff === 0 ? "Pas (0)" : diff > 0 ? `Lebih ${formatRupiah(diff)}` : `Kurang ${formatRupiah(Math.abs(diff))}`;
    const diffColor = diff === 0 ? "#111" : diff > 0 ? "#15803d" : "#b91c1c";
    const openedAt = new Date(s.opened_at).toLocaleString("id-ID");
    const closedAt = s.closed_at ? new Date(s.closed_at).toLocaleString("id-ID") : "Masih berjalan";
    const expensesRows = expenses.length
      ? expenses.map((e, i) => `<tr>
          <td>${i + 1}</td>
          <td>${esc(e.label || "")}</td>
          <td>${new Date(e.created_at).toLocaleString("id-ID")}</td>
          <td class="r">${formatRupiah(Number(e.amount))}</td>
        </tr>`).join("")
      : `<tr><td colspan="4" class="c muted">Tidak ada pengeluaran shift</td></tr>`;

    const revisions = parseRevisions(s.notes);
    const otherNotes = (s.notes || "")
      .split("\n")
      .filter((l) => !l.trim().startsWith("Revisi closing"))
      .join("\n")
      .trim();
    const revisionSection = revisions.length
      ? `<h2>Riwayat Revisi Closing</h2>
<table>
  <thead><tr><th style="width:32px">#</th><th style="width:200px">Waktu Revisi</th><th>Keterangan</th></tr></thead>
  <tbody>${revisions.map((r, i) => `<tr><td>${i + 1}</td><td>${r.at ? new Date(r.at).toLocaleString("id-ID") : "—"}</td><td>${esc(r.text)}</td></tr>`).join("")}</tbody>
</table>`
      : "";

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Laporan Shift - ${esc(s.cashiers?.name || "")}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, Arial, sans-serif; color:#111; margin:0; padding: 24px; }
  .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #111; padding-bottom:10px; margin-bottom:16px; }
  .head h1 { margin:0 0 4px; font-size: 20px; }
  .head .sub { font-size: 12px; color:#555; }
  .head .rt { text-align:right; font-size: 12px; color:#333; }
  h2 { font-size: 13px; margin: 18px 0 6px; text-transform: uppercase; letter-spacing: .05em; color:#333; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  .grid { display:grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; font-size: 13px; }
  .grid .row { display:flex; justify-content:space-between; padding: 2px 0; }
  .grid .row.b { font-weight: 700; }
  table { width:100%; border-collapse: collapse; font-size: 12px; margin-top: 4px; }
  th, td { border:1px solid #ccc; padding: 6px 8px; text-align:left; }
  th { background:#f3f4f6; }
  td.r, th.r { text-align:right; }
  td.c { text-align:center; }
  .muted { color:#666; }
  .totalbox { margin-top: 14px; border:2px solid #111; padding: 12px; display:grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; font-size: 14px; }
  .totalbox .row { display:flex; justify-content:space-between; }
  .totalbox .big { font-size: 18px; font-weight: 800; }
  .notes { margin-top: 12px; padding: 10px; border:1px dashed #999; font-size: 12px; white-space: pre-wrap; }
  .foot { margin-top: 24px; text-align:center; font-size: 11px; color:#777; }
  @media print { body { padding: 0; } .noprint { display:none; } }
  .toolbar { position:fixed; top:8px; right:8px; }
  .toolbar button { padding:6px 12px; font-size:12px; cursor:pointer; }
</style></head><body>
<div class="toolbar noprint"><button onclick="window.print()">Cetak / Simpan PDF</button></div>
<div class="head">
  <div>
    <h1>${esc(storeName || "Toko")}</h1>
    <div class="sub">Laporan Shift Kasir</div>
  </div>
  <div class="rt">
    <div><b>Dicetak:</b> ${new Date().toLocaleString("id-ID")}</div>
    <div>Shift ID: ${String(s.id).slice(0, 8).toUpperCase()}</div>
    <div>Status: ${s.status === "open" ? "Berjalan" : "Ditutup"}</div>
  </div>
</div>

<h2>Informasi Shift</h2>
<div class="grid">
  <div class="row"><span>Kasir</span><span>${esc(s.cashiers?.name || "—")}</span></div>
  <div class="row"><span>Total Transaksi</span><span>${s.total_transactions}</span></div>
  <div class="row"><span>Waktu Buka</span><span>${openedAt}</span></div>
  <div class="row"><span>Waktu Tutup</span><span>${closedAt}</span></div>
</div>

<h2>Ringkasan Penjualan</h2>
<div class="grid">
  <div class="row"><span>Penjualan Tunai</span><span>${formatRupiah(Number(s.total_cash) || 0)}</span></div>
  <div class="row"><span>Penjualan QRIS</span><span>${formatRupiah(Number(s.total_qris) || 0)}</span></div>
  ${s.total_other ? `<div class="row"><span>Penjualan Lainnya</span><span>${formatRupiah(Number(s.total_other))}</span></div>` : ""}
  <div class="row b"><span>Total Penjualan</span><span>${formatRupiah(Number(s.total_sales) || 0)}</span></div>
</div>

<h2>Rincian Pengeluaran Shift</h2>
<table>
  <thead><tr><th style="width:32px">#</th><th>Keterangan</th><th style="width:180px">Waktu</th><th class="r" style="width:140px">Nominal</th></tr></thead>
  <tbody>${expensesRows}</tbody>
  <tfoot><tr><th colspan="3" class="r">Total Pengeluaran</th><th class="r">${formatRupiah(Number(s.total_expenses) || 0)}</th></tr></tfoot>
</table>

<div class="totalbox">
  <div class="row"><span>Saldo Awal Kas</span><span>${formatRupiah(Number(s.opening_cash) || 0)}</span></div>
  <div class="row"><span>Penjualan Tunai</span><span>+ ${formatRupiah(Number(s.total_cash) || 0)}</span></div>
  <div class="row"><span>Pengeluaran Shift</span><span>- ${formatRupiah(Number(s.total_expenses) || 0)}</span></div>
  <div class="row b"><span>Kas Seharusnya</span><span>${formatRupiah(Number(s.expected_cash) || 0)}</span></div>
  <div class="row"><span>Fisik Kas</span><span>${s.status === "closed" ? formatRupiah(Number(s.actual_cash) || 0) : "—"}</span></div>
  <div class="row big" style="grid-column: 1 / -1; border-top:1px solid #111; margin-top:6px; padding-top:6px;">
    <span>SELISIH</span><span style="color:${diffColor}">${sign}</span>
  </div>
</div>

${revisionSection}

${otherNotes ? `<div class="notes"><b>Catatan:</b>\n${esc(otherNotes)}</div>` : ""}

<div class="foot">Dokumen ini dihasilkan otomatis dari sistem kasir ${esc(storeName || "")}.</div>
<script>window.onload = () => { setTimeout(() => window.print(), 300); };</script>
</body></html>`;
    w.document.write(html);
    w.document.close();
  };

  const openAllPdf = () => {
    const w = window.open("", "_blank", "width=1000,height=1000");
    if (!w) { toast.error("Pop-up diblokir browser"); return; }
    const bodyRows = rows.map((s) => {
      const diff = Number(s.difference) || 0;
      const diffLabel = s.status === "open" ? "—" : diff === 0 ? "Pas" : diff > 0 ? `+${formatRupiah(diff)}` : `-${formatRupiah(Math.abs(diff))}`;
      return `<tr>
        <td>${esc(s.cashiers?.name || "—")}</td>
        <td>${new Date(s.opened_at).toLocaleString("id-ID")}</td>
        <td>${s.closed_at ? new Date(s.closed_at).toLocaleString("id-ID") : "—"}</td>
        <td class="r">${s.total_transactions}</td>
        <td class="r">${formatRupiah(Number(s.total_sales) || 0)}</td>
        <td class="r">${formatRupiah(Number(s.total_cash) || 0)}</td>
        <td class="r">${formatRupiah(Number(s.total_qris) || 0)}</td>
        <td class="r">${formatRupiah(Number(s.total_expenses) || 0)}</td>
        <td class="r">${diffLabel}</td>
        <td>${s.status === "open" ? "Berjalan" : "Ditutup"}</td>
      </tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Riwayat Shift Kasir - ${esc(storeName)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: ui-sans-serif, system-ui, Arial, sans-serif; color:#111; padding: 16px; }
  h1 { margin:0 0 4px; font-size: 18px; }
  .sub { font-size: 12px; color:#555; margin-bottom: 12px; }
  table { width:100%; border-collapse: collapse; font-size: 11px; }
  th, td { border:1px solid #ccc; padding: 5px 6px; text-align:left; }
  th { background:#f3f4f6; }
  td.r, th.r { text-align:right; }
  @media print { body { padding: 0; } .noprint { display:none; } }
  .toolbar { position:fixed; top:8px; right:8px; }
  .toolbar button { padding:6px 12px; font-size:12px; cursor:pointer; }
</style></head><body>
<div class="toolbar noprint"><button onclick="window.print()">Cetak / Simpan PDF</button></div>
<h1>${esc(storeName)} — Riwayat Shift Kasir</h1>
<div class="sub">Dicetak: ${new Date().toLocaleString("id-ID")} · Total ${rows.length} shift</div>
<table>
  <thead><tr>
    <th>Kasir</th><th>Buka</th><th>Tutup</th>
    <th class="r">Trx</th><th class="r">Penjualan</th><th class="r">Tunai</th><th class="r">QRIS</th>
    <th class="r">Pengeluaran</th><th class="r">Selisih Kas</th><th>Status</th>
  </tr></thead>
  <tbody>${bodyRows || `<tr><td colspan="10" style="text-align:center;color:#666">Tidak ada data</td></tr>`}</tbody>
</table>
<script>window.onload = () => { setTimeout(() => window.print(), 300); };</script>
</body></html>`;
    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Riwayat Shift Kasir</h1>
          <p className="text-xs text-muted-foreground">200 shift terakhir. Unduh PDF per shift atau rekap semua.</p>
        </div>
        <Button variant="outline" size="sm" onClick={openAllPdf} disabled={loading || rows.length === 0}>
          <FileDown className="mr-2 h-4 w-4" /> Unduh PDF Semua
        </Button>
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
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} className="p-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={11} className="p-12 text-center text-muted-foreground">
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
                      {(() => {
                        const revs = parseRevisions(s.notes);
                        const last = revs[revs.length - 1];
                        if (!last) return null;
                        return (
                          <div className="mt-1 text-[10px] text-muted-foreground">
                            Direvisi {last.at ? new Date(last.at).toLocaleString("id-ID") : ""}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="p-3">
                      <div className="flex justify-end gap-2">
                        {s.status === "closed" && isAdmin && (
                          <Button size="sm" variant="secondary" onClick={() => openRevise(s)}>
                            <PencilLine className="mr-1 h-4 w-4" /> Revisi Closing
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => openPdf(s)}>
                          <FileText className="mr-1 h-4 w-4" /> PDF
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!reviseShift} onOpenChange={(o) => !o && setReviseShift(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revisi Closing Shift</DialogTitle>
            <DialogDescription>
              Perbaiki jumlah uang fisik bila setelah closing ternyata ada uang yang ketemu atau kurang.
              Selisih otomatis dicatat di pembukuan dan memperbaiki keuntungan.
            </DialogDescription>
          </DialogHeader>
          {reviseShift && (
            <div className="space-y-3 text-sm">
              <div className="rounded-md bg-muted p-3 space-y-1">
                <div className="flex justify-between"><span>Kas seharusnya</span><span>{formatRupiah(Number(reviseShift.expected_cash) || 0)}</span></div>
                <div className="flex justify-between"><span>Fisik kas tercatat</span><span>{formatRupiah(Number(reviseShift.actual_cash) || 0)}</span></div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="revise-cash">Fisik kas yang benar</Label>
                <Input
                  id="revise-cash"
                  inputMode="numeric"
                  value={reviseCash}
                  onChange={(e) => setReviseCash(e.target.value.replace(/[^\d]/g, ""))}
                />
                {(() => {
                  const val = Number(reviseCash || 0);
                  const d = val - (Number(reviseShift.actual_cash) || 0);
                  if (!d) return null;
                  return (
                    <p className={`text-xs ${d > 0 ? "text-success" : "text-destructive"}`}>
                      {d > 0 ? `Uang bertambah ${formatRupiah(d)}` : `Uang berkurang ${formatRupiah(Math.abs(d))}`}
                    </p>
                  );
                })()}
              </div>
              <div className="space-y-1">
                <Label htmlFor="revise-note">Catatan (opsional)</Label>
                <Input id="revise-note" value={reviseNote} onChange={(e) => setReviseNote(e.target.value)} placeholder="mis. uang ketemu di laci" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviseShift(null)} disabled={saving}>Batal</Button>
            <Button onClick={submitRevise} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Simpan Revisi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

  );
}
