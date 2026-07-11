import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatRupiah } from "@/lib/format";
import { PackageCheck, Loader2, PackagePlus } from "lucide-react";

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
  category?: string | null;
};


type NewProdCfg = {
  create: boolean;
  code: string;
  barcode: string;
  category: string;
  sell_price: string; // per pcs
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
  const [newCfg, setNewCfg] = useState<Record<string, NewProdCfg>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [existingCategories, setExistingCategories] = useState<string[]>([]);


  useEffect(() => {
    if (!open || !poId) return;
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("purchase_order_items")
        .select("id,product_id,product_code,product_name,qty,unit_cost,sell_price,qty_received,unit_name,unit_conversion,category")
        .eq("po_id", poId);

      const { data: catData } = await supabase.from("products").select("category");
      setExistingCategories(Array.from(new Set(((catData as any[]) || []).map((r) => (r.category || "").toString().trim()).filter(Boolean))));



      setLoading(false);
      if (error) { toast.error(error.message); return; }
      const list = (data || []) as POItem[];
      setItems(list);
      const map: Record<string, { qty: string; exp: string }> = {};
      const cfgMap: Record<string, NewProdCfg> = {};
      for (const it of list) {
        const remaining = Math.max(0, (it.qty || 0) - (it.qty_received || 0));
        map[it.id] = { qty: String(remaining), exp: "" };
        if (!it.product_id) {
          const conv = Math.max(1, Number(it.unit_conversion || 1));
          const sellPerPcs = it.sell_price ? Math.round(Number(it.sell_price) / conv) : 0;
          cfgMap[it.id] = {
            create: true,
            code: it.product_code && it.product_code !== "-" ? it.product_code : "",
            barcode: "",
            category: (it.category || "").toString(),
            sell_price: sellPerPcs > 0 ? String(sellPerPcs) : "",
          };

        }
      }
      setRecv(map);
      setNewCfg(cfgMap);
    })();
  }, [open, poId]);

  const submit = async () => {
    if (!poId) return;
    setSaving(true);
    try {
      const { data: tid } = await (supabase as any).rpc("current_tenant_id");

      // 1. Auto-create products for items without product_id (jika di-tick)
      const toCreate = items.filter((it) => !it.product_id && (newCfg[it.id]?.create));
      const createdMap: Record<string, string> = {}; // po_item_id -> product_id
      for (const it of toCreate) {
        const cfg = newCfg[it.id];
        const conv = Math.max(1, Number(it.unit_conversion || 1));
        const perPcsCost = it.unit_cost && it.unit_cost > 0 ? Number(it.unit_cost) / conv : 0;
        const sellPerPcs = parseFloat(cfg.sell_price || "0") || 0;
        let code = cfg.code.trim();
        if (!code) {
          const { data: gen } = await supabase.rpc("next_product_code");
          if (gen) code = String(gen);
        }
        const { data: newP, error: pErr } = await supabase
          .from("products")
          .insert({
            code,
            barcode: cfg.barcode.trim() || null,
            name: it.product_name,
            category: cfg.category.trim() || null,
            price: sellPerPcs,
            cost_price: perPcsCost,
            stock: 0,
          })
          .select()
          .single();
        if (pErr || !newP) {
          toast.error(`Gagal buat produk "${it.product_name}": ${pErr?.message || ""}`);
          continue;
        }
        createdMap[it.id] = newP.id;
        // Update po item -> link ke produk baru
        await supabase.from("purchase_order_items").update({ product_id: newP.id, product_code: code }).eq("id", it.id);
      }

      let totalNew = 0;
      let allReceived = true;
      for (const it of items) {
        const r = recv[it.id];
        const addQty = Math.max(0, parseInt(r?.qty || "0", 10));
        const productId = it.product_id || createdMap[it.id] || null;
        if (addQty <= 0) {
          const already = it.qty_received || 0;
          if (already < it.qty) allReceived = false;
          continue;
        }
        const newReceived = (it.qty_received || 0) + addQty;
        await supabase.from("purchase_order_items").update({ qty_received: newReceived }).eq("id", it.id);
        const conv = Math.max(1, Number(it.unit_conversion || 1));
        const addStockBase = addQty * conv;
        const perPcsCost = it.unit_cost && it.unit_cost > 0 ? Number(it.unit_cost) / conv : 0;
        if (productId) {
          const { data: p } = await supabase.from("products").select("stock").eq("id", productId).single();
          const upd: { stock: number; cost_price?: number; price?: number } = { stock: (p?.stock || 0) + addStockBase };
          if (perPcsCost > 0) upd.cost_price = perPcsCost;
          if (it.sell_price && it.sell_price > 0) upd.price = it.sell_price;
          await supabase.from("products").update(upd).eq("id", productId);

          // Batch per pembelian (selalu, biar modal per batch tersimpan; expiry opsional)
          if (tid) {
            await (supabase as any).from("product_batches").insert({
              product_id: productId,
              qty: addStockBase,
              expiry_date: r.exp || null,
              unit_cost: perPcsCost > 0 ? perPcsCost : null,
              source: "po",
              po_id: poId,
              note: `Penerimaan PO ${poSupplier || ""}`.trim(),
              tenant_id: tid,
            });
          }
        }
        totalNew += addStockBase;
        if (newReceived < it.qty) allReceived = false;
      }

      const status = allReceived ? "received" : "partial";
      await supabase.from("purchase_orders").update({
        received_status: status,
        received_at: new Date().toISOString(),
        ...(allReceived ? { status: "received" } : {}),
      }).eq("id", poId);
      const createdCount = Object.keys(createdMap).length;
      toast.success(`${totalNew} pcs diterima${createdCount > 0 ? ` • ${createdCount} produk baru dibuat` : ""}. ${allReceived ? "PO selesai." : "Penerimaan sebagian."}`);
      onOpenChange(false);
      onDone?.();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const newItems = items.filter((it) => !it.product_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><PackageCheck className="h-5 w-5" /> Terima Barang</DialogTitle>
          <DialogDescription>
            Catat jumlah yang benar-benar diterima. Modal per batch akan disimpan sesuai harga beli PO ini (FEFO). Barang baru yang belum ada di master produk bisa dibuatkan otomatis.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="max-h-[65vh] overflow-y-auto space-y-4">
            {newItems.length > 0 && (
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <PackagePlus className="h-4 w-4 text-primary" /> Barang baru ({newItems.length})
                </div>
                <p className="text-xs text-muted-foreground">
                  Item berikut belum ada di master produk. Centang untuk dibuat otomatis. Kode kosong = auto-generate.
                </p>
                {newItems.map((it) => {
                  const cfg = newCfg[it.id] || { create: false, code: "", barcode: "", category: "", sell_price: "" };
                  const conv = Math.max(1, Number(it.unit_conversion || 1));
                  const perPcsCost = it.unit_cost > 0 ? Number(it.unit_cost) / conv : 0;
                  const sellPerPcs = parseFloat(cfg.sell_price || "0") || 0;
                  const profit = sellPerPcs > 0 && perPcsCost > 0 ? sellPerPcs - perPcsCost : 0;
                  return (
                    <div key={it.id} className="rounded border bg-card p-2 space-y-2">
                      <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                        <input
                          type="checkbox"
                          checked={cfg.create}
                          onChange={(e) => setNewCfg({ ...newCfg, [it.id]: { ...cfg, create: e.target.checked } })}
                        />
                        <span className="flex-1">{it.product_name}</span>
                        <span className="text-xs text-muted-foreground">
                          Modal: {formatRupiah(perPcsCost)}/pcs
                        </span>
                      </label>
                      {cfg.create && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pl-6">
                          <div>
                            <Label className="text-[10px] uppercase">Kode</Label>
                            <Input value={cfg.code} onChange={(e) => setNewCfg({ ...newCfg, [it.id]: { ...cfg, code: e.target.value } })} className="h-8 text-xs" placeholder="Auto" />
                          </div>
                          <div>
                            <Label className="text-[10px] uppercase">Barcode</Label>
                            <Input value={cfg.barcode} onChange={(e) => setNewCfg({ ...newCfg, [it.id]: { ...cfg, barcode: e.target.value } })} className="h-8 text-xs" placeholder="Opsional" />
                          </div>
                          <div>
                            <Label className="text-[10px] uppercase">Kategori</Label>
                            <Input list={`recv-cats-${it.id}`} value={cfg.category} onChange={(e) => setNewCfg({ ...newCfg, [it.id]: { ...cfg, category: e.target.value } })} className="h-8 text-xs" placeholder="Pilih / ketik" />
                            <datalist id={`recv-cats-${it.id}`}>
                              {existingCategories.map((c) => <option key={c} value={c} />)}
                            </datalist>
                          </div>

                          <div>
                            <Label className="text-[10px] uppercase">Jual/pcs</Label>
                            <Input type="number" inputMode="decimal" value={cfg.sell_price} onChange={(e) => setNewCfg({ ...newCfg, [it.id]: { ...cfg, sell_price: e.target.value } })} className="h-8 text-xs text-right" />
                            {profit > 0 && (
                              <div className="text-[10px] text-emerald-600 font-semibold text-right mt-0.5">
                                Untung {formatRupiah(profit)}/pcs
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
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
                  const conv = Math.max(1, Number(it.unit_conversion || 1));
                  const unitName = it.unit_name || "pcs";
                  const inputQty = parseInt(recv[it.id]?.qty || "0", 10) || 0;
                  return (
                    <tr key={it.id} className="border-t">
                      <td className="p-2">
                        <div className="font-medium">{it.product_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {it.product_code} • {formatRupiah(Number(it.unit_cost))}/{unitName}
                          {conv > 1 && <span className="ml-1 text-primary">(1 {unitName} = {conv} pcs)</span>}
                          {!it.product_id && <span className="ml-1 text-primary font-semibold">• BARU</span>}
                        </div>
                      </td>
                      <td className="p-2 text-right text-xs">{it.qty} / <span className="text-primary">{already}</span> {unitName}</td>
                      <td className="p-2">
                        <Input
                          inputMode="numeric"
                          value={recv[it.id]?.qty ?? ""}
                          onChange={(e) => setRecv({ ...recv, [it.id]: { ...recv[it.id], qty: e.target.value.replace(/\D/g, "") } })}
                          className="h-8 text-center"
                        />
                        {conv > 1 && inputQty > 0 && (
                          <div className="mt-1 text-[10px] text-center text-primary font-semibold">= {inputQty * conv} pcs</div>
                        )}
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
