import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Camera, Upload, X, Sparkles, Loader2, ScrollText, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { analyzeCustomerOrder, type AiOrderResult } from "@/lib/ai-vision.functions";

export type AiOrderItem = AiOrderResult["items"][number];

type ProductLite = { id: string; name: string; barcode?: string | null; code?: string | null; units?: string[] };

type Props = {
  open: boolean;
  onClose: () => void;
  products: ProductLite[];
  onApply: (items: AiOrderItem[]) => void;
};

export function AIOrderDialog({ open, onClose, products, onApply }: Props) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AiOrderResult | null>(null);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const analyze = useServerFn(analyzeCustomerOrder);

  const reset = () => { setText(""); setImages([]); setResult(null); setSelected({}); setAnalyzing(false); };
  const close = () => { if (analyzing) return; reset(); onClose(); };

  const handleFile = async (f?: File) => {
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) return toast.error("Foto terlalu besar (max 8MB)");
    try {
      const dataUrl = await resizeImage(f, 1400, 0.8);
      setImages((p) => [...p, dataUrl].slice(0, 3));
    } catch (e: any) { toast.error(e?.message || "Gagal proses foto"); }
  };

  const run = async () => {
    if (!text.trim() && images.length === 0) return toast.error("Tulis pesanan atau ambil foto");
    setAnalyzing(true);
    try {
      const r = await analyze({ data: {
        text,
        images: images.map((d) => ({ data_url: d })),
        products: products.slice(0, 800).map((p) => ({
          id: p.id, name: p.name, barcode: p.barcode ?? null, code: p.code ?? null,
          units: p.units ?? [],
        })),
      } });
      setResult(r);
      const init: Record<number, boolean> = {};
      r.items.forEach((it, i) => { init[i] = !!it.matched_product_id; });
      setSelected(init);
      if (r.items.length === 0) toast.warning("Tidak ada item terdeteksi");
      else toast.success(`${r.items.length} item terdeteksi`);
    } catch (e: any) { toast.error(e?.message || "Gagal"); }
    finally { setAnalyzing(false); }
  };

  const apply = () => {
    if (!result) return;
    const picks = result.items.filter((_, i) => selected[i] && result.items[i].matched_product_id);
    if (picks.length === 0) return toast.error("Pilih minimal 1 item yang cocok");
    onApply(picks);
    reset();
    onClose();
  };

  const updateQty = (i: number, qty: number) => {
    if (!result) return;
    setResult({ ...result, items: result.items.map((it, idx) => idx === i ? { ...it, qty: Math.max(1, qty) } : it) });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-primary" /> Scan Pesanan Pelanggan (AI)
          </DialogTitle>
          <DialogDescription>
            Ketik atau foto daftar belanja pelanggan. AI akan cocokkan dengan stok toko dan masukkan ke keranjang.
          </DialogDescription>
        </DialogHeader>

        {!result && (
          <div className="space-y-3">
            <div>
              <div className="text-xs font-medium mb-1">Tulis daftar pesanan</div>
              <Textarea
                rows={6}
                placeholder={"Contoh:\n- 2 indomie goreng\n- aqua botol 3\n- 1 dus teh pucuk\n- rokok sampoerna mild 1 slove"}
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={analyzing}
              />
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-medium">Atau foto catatan / chat pelanggan (opsional)</div>
              <div className="grid grid-cols-3 gap-2">
                {images.map((src, i) => (
                  <div key={i} className="relative rounded border overflow-hidden">
                    <img src={src} className="h-24 w-full object-cover" alt="" />
                    <Button size="icon" variant="ghost" className="absolute right-1 top-1 h-6 w-6 bg-background/80"
                      onClick={() => setImages((p) => p.filter((_, idx) => idx !== i))} disabled={analyzing}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                {images.length < 3 && (
                  <div className="flex flex-col gap-1.5">
                    <Button type="button" size="sm" variant="outline" disabled={analyzing} onClick={() => {
                      const el = document.createElement("input");
                      el.type = "file"; el.accept = "image/*"; el.setAttribute("capture", "environment");
                      el.onchange = () => handleFile(el.files?.[0]); el.click();
                    }}>
                      <Camera className="mr-1 h-3.5 w-3.5" /> Foto
                    </Button>
                    <Button type="button" size="sm" variant="ghost" disabled={analyzing} onClick={() => fileRef.current?.click()}>
                      <Upload className="mr-1 h-3.5 w-3.5" /> Upload
                    </Button>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-2">
            {result.summary && <div className="text-xs text-muted-foreground italic">{result.summary}</div>}
            <div className="rounded border max-h-[55vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted text-left">
                  <tr>
                    <th className="p-2 w-8"></th>
                    <th className="p-2">Pesanan → Produk</th>
                    <th className="p-2 w-16 text-right">Qty</th>
                    <th className="p-2 w-20">Satuan</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((it, i) => {
                    const matched = !!it.matched_product_id;
                    return (
                      <tr key={i} className="border-t align-top">
                        <td className="p-2">
                          <input type="checkbox" checked={!!selected[i]} disabled={!matched}
                            onChange={(e) => setSelected((s) => ({ ...s, [i]: e.target.checked }))} />
                        </td>
                        <td className="p-2">
                          <div className="font-medium">{it.raw}</div>
                          <div className={`text-[11px] flex items-center gap-1 ${matched ? "text-green-600" : "text-destructive"}`}>
                            {matched ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                            {matched ? it.matched_name : (it.note || "Tidak ditemukan di stok")}
                          </div>
                        </td>
                        <td className="p-2"><Input type="number" min={1} value={it.qty} onChange={(e) => updateQty(i, parseInt(e.target.value || "1", 10) || 1)} className="h-8 text-xs text-right" /></td>
                        <td className="p-2 text-[11px] text-muted-foreground">{it.unit || "eceran"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={analyzing}>Batal</Button>
          {!result ? (
            <Button onClick={run} disabled={analyzing || (!text.trim() && images.length === 0)}>
              {analyzing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Menganalisa...</> : <><Sparkles className="mr-2 h-4 w-4" /> Analisa</>}
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setResult(null)}>← Ulang</Button>
              <Button onClick={apply}>Masukkan ke Keranjang</Button>
            </>
          )}
        </DialogFooter>
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
