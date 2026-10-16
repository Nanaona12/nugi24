import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatRupiah, parseNumber } from "@/lib/format";
import { replaceProductUnits, type ProductUnit } from "@/lib/product-pricing";

export type UnitDraft = { name: string; conversion: string; tiers: { min_qty: string; price: string }[] };

export type CreatedProduct = {
  id: string;
  code: string;
  barcode: string | null;
  name: string;
  price: number;
  cost_price: number;
  stock: number;
  min_stock: number | null;
  category: string | null;
};

const emptyUnits = (): UnitDraft[] => [{ name: "pcs", conversion: "1", tiers: [{ min_qty: "1", price: "" }] }];

/** Form tambah produk (satuan + harga grosir bertingkat) yang bisa dibuka langsung dari PO. */
export function NewProductDialog({
  open,
  initialName,
  initial,
  title,
  description,
  submitLabel,
  cancelLabel,
  onClose,
  onCreated,
}: {
  open: boolean;
  initialName?: string;
  initial?: { name?: string; code?: string; barcode?: string; category?: string; cost?: number; units?: UnitDraft[] };
  title?: string;
  description?: string;
  submitLabel?: string;
  cancelLabel?: string;
  onClose: () => void;
  onCreated: (p: CreatedProduct, units: ProductUnit[]) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [barcode, setBarcode] = useState("");
  const [category, setCategory] = useState("");
  const [cost, setCost] = useState("");
  const [minStock, setMinStock] = useState("");
  const [units, setUnits] = useState<UnitDraft[]>(emptyUnits());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? initialName ?? "");
      setCode(initial?.code || ""); setBarcode(initial?.barcode || ""); setCategory(initial?.category || "");
      setCost(initial?.cost ? String(Math.round(initial.cost)) : ""); setMinStock("");
      setUnits(initial?.units?.length ? initial.units : emptyUnits());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialName, initial]);

  const patchUnit = (i: number, patch: Partial<UnitDraft>) =>
    setUnits((u) => u.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const patchTier = (ui: number, ti: number, patch: Partial<{ min_qty: string; price: string }>) =>
    setUnits((u) => u.map((x, idx) => (idx === ui ? { ...x, tiers: x.tiers.map((t, j) => (j === ti ? { ...t, ...patch } : t)) } : x)));

  const save = async () => {
    if (!name.trim()) return toast.error("Nama wajib diisi");
    const clean: ProductUnit[] = units
      .map((u, i) => ({
        name: u.name.trim(),
        conversion: i === 0 ? 1 : Math.max(1, parseInt(u.conversion || "1", 10) || 1),
        sort_order: i,
        is_base: i === 0,
        show_in_showcase: true,
        tiers: u.tiers
          .map((t) => ({ min_qty: Math.max(1, parseInt(t.min_qty || "1", 10) || 1), price: parseNumber(t.price) }))
          .filter((t) => t.price > 0)
          .sort((a, b) => a.min_qty - b.min_qty),
      }))
      .filter((u) => u.name && u.tiers.length > 0);
    if (clean.length === 0 || !clean[0].is_base) return toast.error("Isi harga jual satuan dasar");
    const costBase = parseNumber(cost);
    const bad = clean.flatMap((u) => u.tiers.filter((t) => costBase > 0 && t.price < costBase * u.conversion).map((t) => `${u.name} ≥${t.min_qty}: ${formatRupiah(t.price)}`));
    if (bad.length && !confirm(`Harga jual di bawah modal:\n${bad.join("\n")}\n\nTetap simpan?`)) return;

    setSaving(true);
    try {
      let finalCode = code.trim();
      if (!finalCode) {
        const { data, error } = await supabase.rpc("next_product_code");
        if (error || !data) throw new Error("Gagal membuat kode otomatis");
        finalCode = String(data);
      }
      const basePrice = clean[0].tiers[0].price;
      const { data: inserted, error } = await supabase
        .from("products")
        .insert({
          code: finalCode,
          barcode: barcode.trim() || null,
          name: name.trim(),
          category: category.trim() || null,
          price: basePrice,
          cost_price: costBase,
          stock: 0,
          min_stock: minStock !== "" ? Math.max(0, parseInt(minStock, 10) || 0) : null,
        } as any)
        .select("id,code,barcode,name,price,cost_price,stock,min_stock,category")
        .single();
      if (error || !inserted) {
        throw new Error(error?.code === "23505" ? `Kode "${finalCode}" sudah dipakai` : error?.message || "Gagal simpan");
      }
      await replaceProductUnits(inserted.id, clean);
      toast.success(`Produk ${inserted.name} dibuat`);
      onCreated(inserted as CreatedProduct, clean);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title || "Produk Baru"}</DialogTitle>
          <DialogDescription>{description || "Stok awal 0 — stok bertambah saat barang PO diterima."}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label>Nama *</Label><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
          <div><Label>Kode (kosong = otomatis)</Label><Input value={code} onChange={(e) => setCode(e.target.value)} /></div>
          <div><Label>Barcode</Label><Input value={barcode} onChange={(e) => setBarcode(e.target.value)} /></div>
          <div><Label>Kategori</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} /></div>
          <div><Label>Harga modal / satuan dasar</Label><Input inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} /></div>
          <div><Label>Stok minimum</Label><Input inputMode="numeric" value={minStock} onChange={(e) => setMinStock(e.target.value)} /></div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-base">Satuan & Harga Grosir</Label>
            <Button type="button" size="sm" variant="outline" onClick={() => setUnits((u) => [...u, { name: "", conversion: "", tiers: [{ min_qty: "1", price: "" }] }])}>
              <Plus className="mr-1 h-4 w-4" /> Satuan
            </Button>
          </div>
          {units.map((u, ui) => (
            <div key={ui} className="space-y-2 rounded-lg border p-3">
              <div className="grid grid-cols-[1fr_6rem_auto] items-end gap-2">
                <div><Label className="text-xs">{ui === 0 ? "Satuan dasar" : "Nama satuan"}</Label><Input value={u.name} placeholder={ui === 0 ? "pcs / butir / gram" : "dus / kg"} onChange={(e) => patchUnit(ui, { name: e.target.value })} /></div>
                <div><Label className="text-xs">Isi</Label><Input inputMode="numeric" disabled={ui === 0} value={ui === 0 ? "1" : u.conversion} onChange={(e) => patchUnit(ui, { conversion: e.target.value })} /></div>
                {ui > 0 ? (
                  <Button type="button" size="icon" variant="ghost" onClick={() => setUnits((x) => x.filter((_, i) => i !== ui))}><Trash2 className="h-4 w-4" /></Button>
                ) : <span className="w-9" />}
              </div>
              {u.tiers.map((t, ti) => (
                <div key={ti} className="grid grid-cols-[6rem_1fr_auto] items-end gap-2">
                  <div><Label className="text-xs">Min beli</Label><Input inputMode="numeric" value={t.min_qty} onChange={(e) => patchTier(ui, ti, { min_qty: e.target.value })} /></div>
                  <div><Label className="text-xs">Harga / {u.name || "satuan"}</Label><Input inputMode="numeric" value={t.price} onChange={(e) => patchTier(ui, ti, { price: e.target.value })} /></div>
                  {ti > 0 ? (
                    <Button type="button" size="icon" variant="ghost" onClick={() => patchUnit(ui, { tiers: u.tiers.filter((_, j) => j !== ti) })}><Trash2 className="h-4 w-4" /></Button>
                  ) : <span className="w-9" />}
                </div>
              ))}
              <Button type="button" size="sm" variant="ghost" onClick={() => patchUnit(ui, { tiers: [...u.tiers, { min_qty: "", price: "" }] })}>
                <Plus className="mr-1 h-3 w-3" /> Tingkat harga grosir
              </Button>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>{cancelLabel || "Batal"}</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Menyimpan..." : submitLabel || "Simpan & Tambah ke PO"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
