import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, Upload, X, Sparkles, Loader2, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { analyzeInvoicePhoto, type AiInvoiceResult } from "@/lib/ai-vision.functions";
import { formatRupiah } from "@/lib/format";

type StoreType = "auto" | "warung" | "grosiran" | "both";

type Props = {
  open: boolean;
  onClose: () => void;
  onResult: (r: AiInvoiceResult) => void;
  existingProducts?: { id: string; name: string; barcode?: string | null; code?: string }[];
  existingCategories?: string[];
  inline?: boolean;
};

export function AIInvoiceCapture({ open, onClose, onResult, existingProducts = [], existingCategories = [], inline = false }: Props) {

  const [images, setImages] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [storeType, setStoreType] = useState<StoreType>("auto");
  const [preview, setPreview] = useState<AiInvoiceResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const analyze = useServerFn(analyzeInvoicePhoto);

  const reset = () => { setImages([]); setPreview(null); setAnalyzing(false); };
  const handleClose = () => { if (analyzing) return; reset(); onClose(); };

  const handleFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return toast.error("Foto terlalu besar (max 8MB)");
    try {
      const dataUrl = await resizeImage(file, 1600, 0.8);
      setImages((p) => [...p, dataUrl].slice(0, 4));
    } catch (e: any) { toast.error("Gagal memproses foto: " + (e?.message || "")); }
  };

  const runAnalyze = async () => {
    if (images.length === 0) return toast.error("Tambahkan foto struk/faktur");
    setAnalyzing(true);
    try {
      const r = await analyze({ data: {
        images: images.map((d) => ({ data_url: d })),
        existing_products: existingProducts.slice(0, 200),
        existing_categories: existingCategories.slice(0, 100),
        store_type: storeType,
      } });

      setPreview(r);
      if ((r.items || []).length === 0) toast.warning("Tidak ada item terdeteksi — coba foto ulang");
      else toast.success(`${r.items.length} item terdeteksi`);
    } catch (e: any) { toast.error(e?.message || "Gagal"); }
    finally { setAnalyzing(false); }
  };

  const apply = () => {
    if (!preview) return;
    onResult(preview);
    reset();
    onClose();
  };

  const updateItem = (i: number, patch: Partial<NonNullable<AiInvoiceResult["items"]>[number]>) => {
    setPreview((p) => p ? { ...p, items: p.items.map((it, idx) => idx === i ? { ...it, ...patch } : it) } : p);
  };
  const removeItem = (i: number) => {
    setPreview((p) => p ? { ...p, items: p.items.filter((_, idx) => idx !== i) } : p);
  };

  const content = (
    <>
      {inline ? (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ReceiptText className="h-4 w-4 text-primary" /> Scan Struk / Faktur Supplier
          </div>
          <p className="text-xs text-muted-foreground">
            AI akan baca supplier, daftar barang, harga modal & rekomendasi harga jual dari foto struk.
          </p>
        </div>
      ) : (
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5 text-primary" /> Scan Struk / Faktur Supplier
          </DialogTitle>
          <DialogDescription>
            AI akan baca supplier, daftar barang, harga modal & rekomendasi harga jual dari foto struk.
          </DialogDescription>
        </DialogHeader>
      )}

      {!preview && (
        <>
          <div className="rounded-md border bg-muted/30 p-2.5 space-y-1.5">
              <div className="text-xs font-medium">Strategi harga jual</div>
              <div className="flex flex-wrap gap-1.5">
                {([
                  { v: "auto", l: "Auto" },
                  { v: "warung", l: "Warung (margin 10-20%)" },
                  { v: "grosiran", l: "Grosir (+Rp500-1000)" },
                  { v: "both", l: "Warung + Grosir" },
                ] as { v: StoreType; l: string }[]).map((o) => (
                  <button key={o.v} type="button" onClick={() => setStoreType(o.v)}
                    className={`text-xs rounded-full border px-2.5 py-1 ${storeType === o.v ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}>
                    {o.l}
                  </button>
                ))}
              </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-4">
              {images.map((src, i) => (
                <div key={i} className="relative rounded border overflow-hidden">
                  <img src={src} className="h-28 w-full object-cover" alt="" />
                  <Button size="icon" variant="ghost" className="absolute right-1 top-1 h-6 w-6 bg-background/80"
                    onClick={() => setImages((p) => p.filter((_, idx) => idx !== i))} disabled={analyzing}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              {images.length < 4 && (
                <div className="flex flex-col gap-1.5">
                  <Button type="button" size="sm" variant="outline" disabled={analyzing} onClick={() => cameraRef.current?.click()}>
                    <Camera className="mr-1 h-3.5 w-3.5" /> Foto Struk
                  </Button>
                  <Button type="button" size="sm" variant="ghost" disabled={analyzing} onClick={() => fileRef.current?.click()}>
                    <Upload className="mr-1 h-3.5 w-3.5" /> Upload
                  </Button>
                  <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }} />
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }} />
                </div>
              )}
          </div>
        </>
      )}

      {preview && (
        <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Supplier</Label>
                <Input value={preview.supplier ?? ""} onChange={(e) => setPreview({ ...preview, supplier: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">No. Faktur</Label>
                <Input value={preview.invoice_no ?? ""} onChange={(e) => setPreview({ ...preview, invoice_no: e.target.value })} />
              </div>
            </div>

            <div className="rounded border max-h-[50vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted text-left">
                  <tr>
                    <th className="p-2">Barang</th>
                    <th className="p-2 w-16 text-right">Qty</th>
                    <th className="p-2 w-24 text-right">Modal</th>
                    <th className="p-2 w-24 text-right">Jual</th>
                    <th className="p-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {preview.items.map((it, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-1">
                        <Input value={it.name} onChange={(e) => updateItem(i, { name: e.target.value })} className="h-8 text-xs" />
                        {it.matched_product_id && <div className="text-[10px] text-green-600 mt-0.5">✓ cocok dengan produk existing</div>}
                      </td>
                      <td className="p-1"><Input type="number" value={it.qty} onChange={(e) => updateItem(i, { qty: parseInt(e.target.value || "1", 10) || 1 })} className="h-8 text-xs text-right" /></td>
                      <td className="p-1"><Input type="number" value={it.cost_price} onChange={(e) => updateItem(i, { cost_price: parseFloat(e.target.value || "0") })} className="h-8 text-xs text-right" /></td>
                      <td className="p-1"><Input type="number" value={it.sell_price ?? 0} onChange={(e) => updateItem(i, { sell_price: parseFloat(e.target.value || "0") })} className="h-8 text-xs text-right" /></td>
                      <td className="p-1 text-center"><Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeItem(i)}><X className="h-3.5 w-3.5" /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.total != null && <div className="text-right text-sm text-muted-foreground">Total struk: <b>{formatRupiah(preview.total)}</b></div>}
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={handleClose} disabled={analyzing}>Batal</Button>
        {!preview ? (
          <Button onClick={runAnalyze} disabled={analyzing || images.length === 0}>
            {analyzing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Menganalisa...</> : <><Sparkles className="mr-2 h-4 w-4" /> Analisa Struk</>}
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setPreview(null)}>← Foto Ulang</Button>
            <Button onClick={apply}>Pakai ({preview.items.length} item)</Button>
          </>
        )}
      </DialogFooter>
    </>
  );

  if (inline) {
    if (!open) return null;
    return <div className="space-y-3 rounded-lg border bg-card p-3 shadow-sm">{content}</div>;
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent
        className="max-w-3xl max-h-[92vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
      >
        {content}
      </DialogContent>
    </Dialog>
  );
}

async function resizeImage(file: File, maxDim: number, quality: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak tersedia");
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}
