import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatRupiah } from "@/lib/format";
import { Loader2, Search, Undo2 } from "lucide-react";

type Tx = { id: string; total: number; created_at: string; item_count: number; tenant_id: string };
type TxItem = {
  id: string; product_id: string | null; product_code: string; product_name: string;
  qty: number; unit_price: number; subtotal: number; unit_conversion: number | null;
  unit_name: string | null;
};

export function RefundDialog({ open, onOpenChange, onDone, cashierId }: { open: boolean; onOpenChange: (o: boolean) => void; onDone?: () => void; cashierId?: string | null }) {
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [tx, setTx] = useState<Tx | null>(null);
  const [items, setItems] = useState<TxItem[]>([]);
  const [refundQty, setRefundQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) { setSearch(""); setTx(null); setItems([]); setRefundQty({}); setReason(""); }
  }, [open]);

  const findTx = async () => {
    const q = search.trim().replace(/^#/, "");
    if (!q) { toast.error("Masukkan nomor struk"); return; }
    setLoading(true);
    try {
      const isFullUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q);
      let row: any = null;
      if (isFullUuid) {
        const { data, error } = await supabase.from("transactions").select("*").eq("id", q).limit(1);
        if (error) throw error;
        row = data?.[0];
      } else {
        const { data, error } = await supabase.from("transactions").select("*").order("created_at", { ascending: false }).limit(500);
        if (error) throw error;
        row = (data || []).find((t: any) => String(t.id).toLowerCase().startsWith(q.toLowerCase()));
      }
      if (!row) { toast.error("Struk tidak ditemukan"); return; }
      const data = [row];
      const t = data[0] as Tx;
      setTx(t);
      const { data: its, error: e2 } = await supabase.from("transaction_items").select("*").eq("transaction_id", t.id);
      if (e2) throw e2;
      setItems((its || []) as TxItem[]);
      setRefundQty({});
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  const total = items.reduce((s, it) => {
    const q = refundQty[it.id] || 0;
    if (!q) return s;
    return s + (Number(it.unit_price) * q);
  }, 0);

  const submit = async () => {
    if (!tx) return;
    const chosen = items.filter((it) => (refundQty[it.id] || 0) > 0);
    if (chosen.length === 0) { toast.error("Pilih barang yang akan direfund"); return; }
    setSaving(true);
    try {
      if (!cashierId) throw new Error("Pilih kasir aktif terlebih dahulu");
      if (!tx.tenant_id) throw new Error("Tenant transaksi tidak ditemukan");
      const itemCount = chosen.reduce((s, it) => s + (refundQty[it.id] || 0), 0);
      const { data: rf, error } = await supabase.from("refunds").insert({
        tenant_id: tx.tenant_id,
        transaction_id: tx.id, cashier_id: cashierId, reason: reason || null, total, item_count: itemCount,
      }).select("id").single();
      if (error) throw error;
      const rows = chosen.map((it) => {
        const q = refundQty[it.id] || 0;
        return {
          tenant_id: tx.tenant_id,
          refund_id: rf!.id,
          product_id: it.product_id,
          product_code: it.product_code,
          product_name: it.product_name,
          qty: q,
          unit_price: Number(it.unit_price),
          unit_conversion: it.unit_conversion ?? 1,
          subtotal: Number(it.unit_price) * q,
        };
      });
      const { error: e2 } = await supabase.from("refund_items").insert(rows);
      if (e2) throw e2;
      toast.success(`Refund ${formatRupiah(total)} berhasil. Stok dikembalikan.`);
      onOpenChange(false);
      onDone?.();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Undo2 className="h-5 w-5" /> Refund Barang</DialogTitle>
          <DialogDescription>Cari transaksi berdasarkan nomor struk lalu pilih item & jumlah yang dikembalikan.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            placeholder="Nomor struk (mis. 7a3b1f9c atau lengkap)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") findTx(); }}
            autoFocus
          />
          <Button onClick={findTx} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>

        {tx && (
          <Card className="p-3 text-sm">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="font-semibold">#{tx.id.slice(0, 8)}</div>
                <div className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString("id-ID")}</div>
              </div>
              <Badge variant="secondary">Total {formatRupiah(Number(tx.total))}</Badge>
            </div>
            <ul className="divide-y rounded border">
              {items.map((it) => {
                const q = refundQty[it.id] || 0;
                return (
                  <li key={it.id} className="flex items-center justify-between gap-2 p-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{it.product_name}</div>
                      <div className="text-xs text-muted-foreground">
                        Beli {it.qty} × {formatRupiah(Number(it.unit_price))}
                        {it.unit_name ? ` • ${it.unit_name}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="outline" onClick={() => setRefundQty({ ...refundQty, [it.id]: Math.max(0, q - 1) })}>−</Button>
                      <Input
                        className="w-14 text-center"
                        value={String(q)}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(it.qty, parseInt(e.target.value.replace(/\D/g, "") || "0", 10)));
                          setRefundQty({ ...refundQty, [it.id]: v });
                        }}
                      />
                      <Button size="sm" variant="outline" onClick={() => setRefundQty({ ...refundQty, [it.id]: Math.min(it.qty, q + 1) })}>+</Button>
                      <span className="ml-1 text-xs text-muted-foreground">/{it.qty}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="mt-2">
              <Label className="text-xs">Alasan (opsional)</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Rusak, salah ambil, dll" />
            </div>
            <div className="mt-2 flex items-center justify-between border-t pt-2 font-semibold">
              <span>Total Refund</span><span className="text-destructive">{formatRupiah(total)}</span>
            </div>
          </Card>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Tutup</Button>
          <Button onClick={submit} disabled={saving || !tx || total <= 0} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Proses Refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
