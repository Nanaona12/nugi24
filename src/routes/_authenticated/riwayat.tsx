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
import { Receipt, Eye, Trash2, Download, ImageIcon, Printer, Search } from "lucide-react";
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
  customer_name?: string | null;
};


type TxItem = {
  id: string;
  product_code: string;
  product_name: string;
  qty: number;
  unit_price: number;
  is_wholesale: boolean;
  subtotal: number;
  unit_cost?: number | null;
  unit_conversion?: number | null;
};

function itemProfit(it: TxItem) {
  const cost = Number(it.unit_cost || 0) * Number(it.qty || 0) * Number(it.unit_conversion || 1);
  return Number(it.subtotal || 0) - cost;
}

function RiwayatPage() {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [selected, setSelected] = useState<Tx | null>(null);
  const [items, setItems] = useState<TxItem[]>([]);
  const [storeName, setStoreName] = useState<string>("Toko");
  const [receiptImg, setReceiptImg] = useState<string | null>(null);
  const [buildingImg, setBuildingImg] = useState(false);

  const [isAdmin, setIsAdmin] = useState(false);
  const [txProfits, setTxProfits] = useState<Record<string, number>>({});

  const [confirmDelOpen, setConfirmDelOpen] = useState(false);
  const [delTarget, setDelTarget] = useState<Tx | null>(null);
  const [delPassword, setDelPassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [search, setSearch] = useState("");
  const [matches, setMatches] = useState<Record<string, { name: string; qty: number; subtotal: number }[]> | null>(null);
  const [searching, setSearching] = useState(false);

  const load = async () => {
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) { toast.error(error.message); return; }
    const rows = (data || []) as Tx[];
    const phones = Array.from(new Set(
      rows.map((r) => (r.customer_phone || "").replace(/\D/g, "")).filter((p) => p.length > 0)
    ));
    if (phones.length > 0) {
      const { data: custs } = await supabase.from("customers").select("name, phone");
      const map = new Map<string, string>();
      (custs || []).forEach((c: any) => {
        const norm = String(c.phone || "").replace(/\D/g, "");
        if (norm) map.set(norm, c.name);
      });
      rows.forEach((r) => {
        const norm = (r.customer_phone || "").replace(/\D/g, "");
        if (norm && map.has(norm)) r.customer_name = map.get(norm) || null;
      });
    }
    setTxs(rows);
  };


  const loadProfits = async (rows: Tx[], admin: boolean) => {
    if (!admin || rows.length === 0) return;
    const ids = rows.map((r) => r.id);
    const { data } = await supabase
      .from("transaction_items")
      .select("transaction_id, qty, unit_conversion, unit_cost, subtotal")
      .in("transaction_id", ids);
    const map: Record<string, number> = {};
    for (const it of (data || []) as any[]) {
      const p = Number(it.subtotal || 0) - Number(it.unit_cost || 0) * Number(it.qty || 0) * Number(it.unit_conversion || 1);
      map[it.transaction_id] = (map[it.transaction_id] || 0) + p;
    }
    setTxProfits(map);
  };



  useEffect(() => {
    (async () => {
      const { data: cashier } = await supabase.rpc("is_cashier_session");
      const admin = !cashier;
      setIsAdmin(admin);
      await load();
      const { data } = await supabase.rpc("current_tenant_info");
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.name) setStoreName(row.name as string);
    })();
  }, []);

  useEffect(() => {
    loadProfits(txs, isAdmin);
  }, [txs, isAdmin]);

  // Cari struk berdasarkan nama/kode barang (30 hari terakhir)
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2 || txs.length === 0) { setMatches(null); setSearching(false); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const ids = txs.map((r) => r.id);
      const { data } = await supabase
        .from("transaction_items")
        .select("transaction_id, product_name, product_code, qty, subtotal")
        .in("transaction_id", ids)
        .or(`product_name.ilike.%${q}%,product_code.ilike.%${q}%`);
      if (cancelled) return;
      const map: Record<string, { name: string; qty: number; subtotal: number }[]> = {};
      for (const it of (data || []) as any[]) {
        (map[it.transaction_id] = map[it.transaction_id] || []).push({
          name: it.product_name, qty: Number(it.qty || 0), subtotal: Number(it.subtotal || 0),
        });
      }
      setMatches(map);
      setSearching(false);
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [search, txs]);




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
        customerName: tx.customer_name || null,
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

  const restoreStockForTx = async (txId: string) => {
    const { data: its } = await supabase
      .from("transaction_items")
      .select("product_id, qty, unit_conversion")
      .eq("transaction_id", txId);
    for (const it of (its || []) as any[]) {
      if (!it.product_id) continue;
      const add = Number(it.qty || 0) * Number(it.unit_conversion || 1);
      if (add <= 0) continue;
      const { data: prod } = await supabase.from("products").select("stock").eq("id", it.product_id).maybeSingle();
      if (!prod) continue;
      await supabase.from("products").update({ stock: Number(prod.stock || 0) + add }).eq("id", it.product_id);
    }
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
    await restoreStockForTx(tx.id);
    const { error: e1 } = await supabase.from("transaction_items").delete().eq("transaction_id", tx.id);
    if (e1) { setDeleting(false); return toast.error(e1.message); }
    const { error: e2 } = await supabase.from("transactions").delete().eq("id", tx.id);
    setDeleting(false);
    if (e2) return toast.error(e2.message);
    toast.success("Transaksi dihapus, stok dikembalikan");
    setConfirmDelOpen(false);
    setDelTarget(null);
    setDelPassword("");
    if (selected?.id === tx.id) setSelected(null);
    load();
  };






  const todayTotal = txs
    .filter((t) => new Date(t.created_at).toDateString() === new Date().toDateString())
    .reduce((s, t) => s + Number(t.total), 0);

  const visibleTxs = matches ? txs.filter((t) => matches[t.id]?.length) : txs;
  const matchTotal = matches
    ? Object.values(matches).flat().reduce((s, m) => s + m.subtotal, 0)
    : 0;
  const matchQty = matches
    ? Object.values(matches).flat().reduce((s, m) => s + m.qty, 0)
    : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Total Hari Ini" value={formatRupiah(todayTotal)} />
        <Stat label="Transaksi Hari Ini" value={String(txs.filter((t) => new Date(t.created_at).toDateString() === new Date().toDateString()).length)} />
        <Stat label="Total Transaksi (30 hari)" value={String(txs.length)} />
      </div>

      <Card className="space-y-2 p-3">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari barang terjual di struk mana… (mis. Djarum)"
            className="h-9"
          />
          {search && (
            <Button size="sm" variant="ghost" onClick={() => setSearch("")}>Reset</Button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Riwayat yang ditampilkan hanya 30 hari terakhir agar aplikasi tetap ringan.
          {searching && " Mencari…"}
          {matches && !searching && ` Ditemukan di ${visibleTxs.length} struk · ${matchQty} pcs · ${formatRupiah(matchTotal)}`}
        </p>
      </Card>

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
                {isAdmin && <th className="p-3 text-right">Untung</th>}
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {visibleTxs.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="p-12 text-center text-muted-foreground">
                    <Receipt className="mx-auto mb-3 h-12 w-12 opacity-30" />
                    {matches ? "Barang tidak ditemukan di 30 hari terakhir" : "Belum ada transaksi"}
                  </td>
                </tr>
              ) : (
                visibleTxs.map((t) => (

                  <tr key={t.id} className="border-t hover:bg-muted/40">
                    <td className="p-3">{new Date(t.created_at).toLocaleString("id-ID")}</td>
                    <td className="p-3 font-mono text-xs">#{t.id.slice(0, 8)}</td>
                    <td className="p-3 text-right">{t.item_count}</td>
                    <td className="p-3 text-right font-semibold">{formatRupiah(Number(t.total))}</td>
                    <td className="p-3 text-right">{formatRupiah(Number(t.paid))}</td>
                    <td className="p-3 text-right">{formatRupiah(Number(t.change_amount))}</td>
                    {isAdmin && (
                      <td className={`p-3 text-right font-semibold ${(txProfits[t.id] ?? 0) >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                        {txProfits[t.id] === undefined ? "-" : formatRupiah(txProfits[t.id])}
                      </td>
                    )}
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
                {(selected.customer_name || selected.customer_phone) && (
                  <div className="mt-1 text-foreground">
                    Pelanggan: <span className="font-medium">{selected.customer_name || "-"}</span>
                    {selected.customer_phone && <span className="ml-1 text-muted-foreground">({selected.customer_phone})</span>}
                  </div>
                )}
              </div>
              <ul className="divide-y rounded border">
                {items.map((it) => {
                  const profit = itemProfit(it);
                  return (
                    <li key={it.id} className="flex justify-between gap-2 p-2">
                      <div>
                        <div className="font-medium">{it.product_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {it.qty} × {formatRupiah(Number(it.unit_price))}
                          {it.is_wholesale && <Badge variant="secondary" className="ml-2 text-[10px]">grosir</Badge>}
                        </div>
                        {isAdmin && (
                          <div className="text-xs text-muted-foreground">
                            Modal: {formatRupiah(Number(it.unit_cost || 0) * Number(it.qty || 0) * Number(it.unit_conversion || 1))}
                            {" · "}
                            <span className={profit >= 0 ? "text-emerald-600" : "text-destructive"}>
                              Untung: {formatRupiah(profit)}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="font-semibold">{formatRupiah(Number(it.subtotal))}</div>
                    </li>
                  );
                })}
              </ul>
              <div className="space-y-1 border-t pt-2">
                <Row label="Total" value={formatRupiah(Number(selected.total))} bold />
                <Row label="Dibayar" value={formatRupiah(Number(selected.paid))} />
                <Row label="Kembali" value={formatRupiah(Number(selected.change_amount))} />
                {isAdmin && (() => {
                  const totalProfit = items.reduce((s, it) => s + itemProfit(it), 0);
                  return (
                    <div className={`flex justify-between font-semibold ${totalProfit >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                      <span>Keuntungan</span><span>{formatRupiah(totalProfit)}</span>
                    </div>
                  );
                })()}
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
                          customerName: tx.customer_name || null,
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
