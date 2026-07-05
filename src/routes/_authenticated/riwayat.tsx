import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { formatRupiah } from "@/lib/format";
import { Receipt, Eye, Trash2, Download, ImageIcon, Printer } from "lucide-react";
import { renderReceiptPng, type ReceiptItem } from "@/lib/receipt-image";
import { printReceipt } from "@/lib/printer";
import { loadPrinterSettings } from "@/lib/printer-settings";



export const Route = createFileRoute("/_authenticated/riwayat")({
  component: RiwayatPage,
});

type Tx = {
  id: string;
  total: number;
  paid: number;
  change_amount: number;
  item_count: number;
  created_at: string;
  payment_method?: string;
  qris_amount?: number;
  customer_phone?: string | null;
};

type TxItem = {
  id: string;
  product_code: string;
  product_name: string;
  qty: number;
  unit_price: number;
  is_wholesale: boolean;
  subtotal: number;
};

function RiwayatPage() {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [selected, setSelected] = useState<Tx | null>(null);
  const [items, setItems] = useState<TxItem[]>([]);
  const [storeName, setStoreName] = useState<string>("Toko");
  const [receiptImg, setReceiptImg] = useState<string | null>(null);
  const [buildingImg, setBuildingImg] = useState(false);


  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [clearPassword, setClearPassword] = useState("");
  const [clearing, setClearing] = useState(false);

  const [confirmDelOpen, setConfirmDelOpen] = useState(false);
  const [delTarget, setDelTarget] = useState<Tx | null>(null);
  const [delPassword, setDelPassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    else setTxs((data || []) as Tx[]);
  };

  useEffect(() => {
    load();
    (async () => {
      const { data } = await supabase.rpc("current_tenant_info");
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.name) setStoreName(row.name as string);
    })();
  }, []);

  const openDetail = async (tx: Tx) => {
    setSelected(tx);
    setReceiptImg(null);
    const { data } = await supabase.from("transaction_items").select("*").eq("transaction_id", tx.id);
    setItems((data || []) as TxItem[]);
  };

  const buildReceiptImage = async (tx: Tx, its: TxItem[]) => {
    setBuildingImg(true);
    try {
      const paymentMethod = (tx.payment_method || "cash").toLowerCase();
      const qrisPart = Number(tx.qris_amount || 0);
      const cashPart = Math.max(0, Number(tx.paid || 0) - qrisPart);
      const imgItems: ReceiptItem[] = its.map((it) => ({
        name: it.product_name,
        qty: Number(it.qty),
        unit: "",
        isWholesale: !!it.is_wholesale,
        detail: `${it.qty} × ${formatRupiah(Number(it.unit_price))}`,
        subtotal: Number(it.subtotal),
      }));
      const { dataUrl } = renderReceiptPng({
        storeName: storeName || "Toko",
        storeNote: "Terima kasih atas kunjungan Anda",
        txId: tx.id,
        at: new Date(tx.created_at),
        items: imgItems,
        total: Number(tx.total),
        paid: Number(tx.paid),
        change: Number(tx.change_amount),
        paymentMethod,
        cashPart,
        qrisPart,
        customerName: null,
        customerPhone: tx.customer_phone || null,
      });
      setReceiptImg(dataUrl);
    } catch (e: any) {
      toast.error("Gagal membuat gambar struk");
    } finally {
      setBuildingImg(false);
    }
  };

  const downloadReceipt = (tx: Tx) => {
    if (!receiptImg) return;
    const a = document.createElement("a");
    a.href = receiptImg;
    a.download = `struk-${tx.id.slice(0, 8)}.png`;
    a.click();
  };


  const askDelete = (tx: Tx, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setDelTarget(tx);
    setDelPassword("");
    setConfirmDelOpen(true);
  };

  const confirmDelete = async () => {
    if (!delTarget) return;
    if (!delPassword) { toast.error("Masukkan password admin/tenant"); return; }
    setDeleting(true);
    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email;
    if (!email) { setDeleting(false); toast.error("Sesi tidak ditemukan. Hanya admin/tenant yang boleh menghapus."); return; }
    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password: delPassword });
    if (authErr) { setDeleting(false); toast.error("Password salah"); return; }
    const tx = delTarget;
    const { error: e1 } = await supabase.from("transaction_items").delete().eq("transaction_id", tx.id);
    if (e1) { setDeleting(false); return toast.error(e1.message); }
    const { error: e2 } = await supabase.from("transactions").delete().eq("id", tx.id);
    setDeleting(false);
    if (e2) return toast.error(e2.message);
    toast.success("Transaksi dihapus");
    setConfirmDelOpen(false);
    setDelTarget(null);
    setDelPassword("");
    if (selected?.id === tx.id) setSelected(null);
    load();
  };

  const clearAll = async () => {
    if (!clearPassword) { toast.error("Masukkan password untuk konfirmasi"); return; }
    setClearing(true);
    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email;
    if (!email) { setClearing(false); toast.error("Sesi tidak ditemukan"); return; }
    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password: clearPassword });
    if (authErr) { setClearing(false); toast.error("Password salah"); return; }
    const { error: e1 } = await supabase.from("transaction_items").delete().not("id", "is", null);
    if (e1) { setClearing(false); return toast.error(e1.message); }
    const { error: e2 } = await supabase.from("transactions").delete().not("id", "is", null);
    setClearing(false);
    if (e2) return toast.error(e2.message);
    setConfirmClearOpen(false);
    setClearPassword("");
    toast.success("Riwayat dibersihkan");
    setSelected(null);
    load();
  };


  const todayTotal = txs
    .filter((t) => new Date(t.created_at).toDateString() === new Date().toDateString())
    .reduce((s, t) => s + Number(t.total), 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Total Hari Ini" value={formatRupiah(todayTotal)} />
        <Stat label="Transaksi Hari Ini" value={String(txs.filter((t) => new Date(t.created_at).toDateString() === new Date().toDateString()).length)} />
        <Stat label="Total Transaksi" value={String(txs.length)} />
      </div>
      {txs.length > 0 && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setConfirmClearOpen(true)} className="text-destructive hover:text-destructive">
            <Trash2 className="mr-2 h-4 w-4" /> Hapus Semua Riwayat
          </Button>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Waktu</th>
                <th className="p-3">No.</th>
                <th className="p-3 text-right">Item</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3 text-right">Dibayar</th>
                <th className="p-3 text-right">Kembali</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {txs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-muted-foreground">
                    <Receipt className="mx-auto mb-3 h-12 w-12 opacity-30" />
                    Belum ada transaksi
                  </td>
                </tr>
              ) : (
                txs.map((t) => (
                  <tr key={t.id} className="border-t hover:bg-muted/40">
                    <td className="p-3">{new Date(t.created_at).toLocaleString("id-ID")}</td>
                    <td className="p-3 font-mono text-xs">#{t.id.slice(0, 8)}</td>
                    <td className="p-3 text-right">{t.item_count}</td>
                    <td className="p-3 text-right font-semibold">{formatRupiah(Number(t.total))}</td>
                    <td className="p-3 text-right">{formatRupiah(Number(t.paid))}</td>
                    <td className="p-3 text-right">{formatRupiah(Number(t.change_amount))}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openDetail(t)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={(e) => askDelete(t, e)} className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>

                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) { setSelected(null); setReceiptImg(null); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detail Transaksi #{selected?.id.slice(0, 8)}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="text-xs text-muted-foreground">
                {new Date(selected.created_at).toLocaleString("id-ID")}
              </div>
              <ul className="divide-y rounded border">
                {items.map((it) => (
                  <li key={it.id} className="flex justify-between gap-2 p-2">
                    <div>
                      <div className="font-medium">{it.product_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {it.qty} × {formatRupiah(Number(it.unit_price))}
                        {it.is_wholesale && <Badge variant="secondary" className="ml-2 text-[10px]">grosir</Badge>}
                      </div>
                    </div>
                    <div className="font-semibold">{formatRupiah(Number(it.subtotal))}</div>
                  </li>
                ))}
              </ul>
              <div className="space-y-1 border-t pt-2">
                <Row label="Total" value={formatRupiah(Number(selected.total))} bold />
                <Row label="Dibayar" value={formatRupiah(Number(selected.paid))} />
                <Row label="Kembali" value={formatRupiah(Number(selected.change_amount))} />
              </div>

              <div className="space-y-2 border-t pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => buildReceiptImage(selected, items)}
                    disabled={buildingImg || items.length === 0}
                  >
                    <ImageIcon className="mr-2 h-4 w-4" />
                    {receiptImg ? "Buat Ulang Gambar Struk" : "Lihat Gambar Struk"}
                  </Button>
                  {receiptImg && (
                    <Button size="sm" variant="secondary" onClick={() => downloadReceipt(selected)}>
                      <Download className="mr-2 h-4 w-4" /> Unduh PNG
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        const tx = selected;
                        const paymentMethod = (tx.payment_method || "cash").toLowerCase();
                        const qrisPart = Number(tx.qris_amount || 0);
                        const cashPart = Math.max(0, Number(tx.paid || 0) - qrisPart);
                        await printReceipt({
                          storeName: storeName || "Toko",
                          storeNote: "Terima kasih atas kunjungan Anda",
                          txId: tx.id,
                          at: new Date(tx.created_at),
                          items: items.map((it) => ({
                            name: it.product_name,
                            qty: Number(it.qty),
                            unit: "",
                            isWholesale: !!it.is_wholesale,
                            detail: `${it.qty} × ${formatRupiah(Number(it.unit_price))}`,
                            subtotal: Number(it.subtotal),
                          })),
                          total: Number(tx.total),
                          paid: Number(tx.paid),
                          change: Number(tx.change_amount),
                          paymentMethod,
                          cashPart,
                          qrisPart,
                          customerName: null,
                          customerPhone: tx.customer_phone || null,
                        }, loadPrinterSettings());
                        toast.success("Struk dikirim ke printer");
                      } catch (e: any) {
                        toast.error(e?.message || "Gagal cetak");
                      }
                    }}
                    disabled={items.length === 0}
                  >
                    <Printer className="mr-2 h-4 w-4" /> Cetak Struk
                  </Button>
                </div>
                {receiptImg && (
                  <div className="rounded border bg-muted/30 p-2">
                    <img
                      src={receiptImg}
                      alt={`Struk #${selected.id.slice(0, 8)}`}
                      className="mx-auto max-h-[60vh] w-auto rounded bg-white shadow"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>



      <AlertDialog open={confirmClearOpen} onOpenChange={(o) => { setConfirmClearOpen(o); if (!o) setClearPassword(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus SEMUA riwayat transaksi?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini tidak bisa dibatalkan. Masukkan password akun Anda untuk konfirmasi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Password</label>
            <Input
              type="password"
              autoComplete="current-password"
              value={clearPassword}
              onChange={(e) => setClearPassword(e.target.value)}
              placeholder="Password akun Anda"
              disabled={clearing}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); clearAll(); }}
              disabled={clearing || !clearPassword}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {clearing ? "Menghapus..." : "Ya, Hapus Semua"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelOpen} onOpenChange={(o) => { setConfirmDelOpen(o); if (!o) { setDelPassword(""); setDelTarget(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus transaksi #{delTarget?.id.slice(0, 8)}?</AlertDialogTitle>
            <AlertDialogDescription>
              Penghapusan riwayat transaksi wajib sepengetahuan admin/tenant.
              Masukkan password akun admin/tenant untuk konfirmasi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Password admin/tenant</label>
            <Input
              type="password"
              autoComplete="current-password"
              value={delPassword}
              onChange={(e) => setDelPassword(e.target.value)}
              placeholder="Password akun admin/tenant"
              disabled={deleting}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
              disabled={deleting || !delPassword}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Menghapus..." : "Ya, Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold text-primary">{value}</div>
    </Card>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : "text-muted-foreground"}`}>
      <span>{label}</span><span className={bold ? "text-foreground" : ""}>{value}</span>
    </div>
  );
}
