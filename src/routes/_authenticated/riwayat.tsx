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
import { Receipt, Eye, Trash2 } from "lucide-react";


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

  const load = async () => {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    else setTxs((data || []) as Tx[]);
  };

  useEffect(() => { load(); }, []);

  const openDetail = async (tx: Tx) => {
    setSelected(tx);
    const { data } = await supabase.from("transaction_items").select("*").eq("transaction_id", tx.id);
    setItems((data || []) as TxItem[]);
  };

  const removeTx = async (tx: Tx, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm(`Hapus transaksi #${tx.id.slice(0, 8)}?`)) return;
    const { error: e1 } = await supabase.from("transaction_items").delete().eq("transaction_id", tx.id);
    if (e1) return toast.error(e1.message);
    const { error: e2 } = await supabase.from("transactions").delete().eq("id", tx.id);
    if (e2) return toast.error(e2.message);
    toast.success("Transaksi dihapus");
    if (selected?.id === tx.id) setSelected(null);
    load();
  };

  const clearAll = async () => {
    if (!confirm("Hapus SEMUA riwayat transaksi? Tindakan ini tidak bisa dibatalkan.")) return;
    const { error: e1 } = await supabase.from("transaction_items").delete().not("id", "is", null);
    if (e1) return toast.error(e1.message);
    const { error: e2 } = await supabase.from("transactions").delete().not("id", "is", null);
    if (e2) return toast.error(e2.message);
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
          <Button variant="outline" size="sm" onClick={clearAll} className="text-destructive hover:text-destructive">
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
                        <Button size="icon" variant="ghost" onClick={(e) => removeTx(t, e)} className="text-destructive hover:text-destructive">
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

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
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
            </div>
          )}
        </DialogContent>
      </Dialog>
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
