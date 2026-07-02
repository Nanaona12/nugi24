import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatRupiah } from "@/lib/format";
import { PackageCheck, Loader2 } from "lucide-react";

type POItem = {
  id: string;
  product_id: string | null;
  product_code: string;
  product_name: string;
  qty: number;
  unit_cost: number;
  sell_price?: number | null;
  qty_received?: number | null;
  unit_name?: string | null;
  unit_conversion?: number | null;
};




export function ReceivingDialog({
  open, onOpenChange, poId, poSupplier, onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  poId: string | null;
  poSupplier?: string;
  onDone?: () => void;
}) {
  const [items, setItems] = useState<POItem[]>([]);
  const [recv, setRecv] = useState<Record<string, { qty: string; exp: string }>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !poId) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("purchase_order_items")
        .select("id,product_id,product_code,product_name,qty,unit_cost,sell_price,qty_received")
        .eq("po_id", poId);

      setLoading(false);
      if (error) { toast.error(error.message); return; }
      const list = (data || []) as POItem[];
      setItems(list);
      const map: Record<string, { qty: string; exp: string }> = {};
      for (const it of list) {
        const remaining = Math.max(0, (it.qty || 0) - (it.qty_received || 0));
        map[it.id] = { qty: String(remaining), exp: "" };
      }
      setRecv(map);
    })();
  }, [open, poId]);

  const submit = async () => {
    if (!poId) return;
    setSaving(true);
    try {
      let totalNew = 0;
      let allReceived = true;
      for (const it of items) {
        const r = recv[it.id];
        const addQty = Math.max(0, parseInt(r?.qty || "0", 10));
        if (addQty <= 0) {
          const already = it.qty_received || 0;
          if (already < it.qty) allReceived = false;
          continue;
        }
        const newReceived = (it.qty_received || 0) + addQty;
        await supabase.from("purchase_order_items").update({ qty_received: newReceived }).eq("id", it.id);
        // Increment stock
        if (it.product_id) {
          const { data: p } = await supabase.from("products").select("stock").eq("id", it.product_id).single();
          const upd: { stock: number; cost_price?: number; price?: number } = { stock: (p?.stock || 0) + addQty };
          if (it.unit_cost && it.unit_cost > 0) upd.cost_price = it.unit_cost;
          if (it.sell_price && it.sell_price > 0) upd.price = it.sell_price;
          await supabase.from("products").update(upd).eq("id", it.product_id);

          // Batch if exp date set
          if (r.exp) {
            const { data: tid } = await (supabase as any).rpc("current_tenant_id");
            if (tid) {
              await (supabase as any).from("product_batches").insert({
                product_id: it.product_id,
                qty: addQty,
                expiry_date: r.exp,
                source: "po",
                po_id: poId,
                note: `Penerimaan PO ${poSupplier || ""}`.trim(),
                tenant_id: tid,
              });
            }
          }
        }
        totalNew += addQty;
        if (newReceived < it.qty) allReceived = false;
      }
      const status = allReceived ? "received" : "partial";
      await supabase.from("purchase_orders").update({
        received_status: status,
        received_at: new Date().toISOString(),
        ...(allReceived ? { status: "received" } : {}),
      }).eq("id", poId);
      toast.success(`${totalNew} pcs diterima. ${allReceived ? "PO selesai." : "Penerimaan sebagian."}`);
      onOpenChange(false);
      onDone?.();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><PackageCheck className="h-5 w-5" /> Terima Barang</DialogTitle>
          <DialogDescription>
            Catat jumlah barang yang benar-benar diterima dari supplier. Bisa parsial (kurang dari pesanan). Tanggal kedaluwarsa opsional, akan otomatis tercatat sebagai batch FEFO.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2">Barang</th>
                  <th className="p-2 text-right">Pesan / Sudah</th>
                  <th className="p-2 w-24">Terima</th>
                  <th className="p-2 w-40">Exp Date (opsional)</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const already = it.qty_received || 0;
                  return (
                    <tr key={it.id} className="border-t">
                      <td className="p-2">
                        <div className="font-medium">{it.product_name}</div>
                        <div className="text-xs text-muted-foreground">{it.product_code} • {formatRupiah(Number(it.unit_cost))}</div>
                      </td>
                      <td className="p-2 text-right text-xs">{it.qty} / <span className="text-primary">{already}</span></td>
                      <td className="p-2">
                        <Input
                          inputMode="numeric"
                          value={recv[it.id]?.qty ?? ""}
                          onChange={(e) => setRecv({ ...recv, [it.id]: { ...recv[it.id], qty: e.target.value.replace(/\D/g, "") } })}
                          className="h-8 text-center"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="date"
                          value={recv[it.id]?.exp ?? ""}
                          onChange={(e) => setRecv({ ...recv, [it.id]: { ...recv[it.id], exp: e.target.value } })}
                          className="h-8"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Batal</Button>
          <Button onClick={submit} disabled={saving || loading}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Simpan Penerimaan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
