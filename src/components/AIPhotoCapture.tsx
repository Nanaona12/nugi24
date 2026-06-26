import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, Upload, X, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { analyzeProductPhotos, type AiVisionResult } from "@/lib/ai-vision.functions";

type Kind = "package" | "barcode" | "expiry" | "receipt";

type Slot = {
  key: Kind;
  label: string;
  hint: string;
  optional?: boolean;
};

const ALL_SLOTS: Slot[] = [
  { key: "package", label: "Kemasan Depan", hint: "Tampak nama & ukuran produk" },
  { key: "barcode", label: "Barcode", hint: "Foto barcode dekat & jelas", optional: true },
  { key: "expiry", label: "Tanggal Kadaluarsa", hint: "EXP / BBD / Best Before", optional: true },
  { key: "receipt", label: "Struk Modal", hint: "Untuk harga beli dari supplier", optional: true },
];

type Props = {
  open: boolean;
  onClose: () => void;
  onResult: (r: AiVisionResult) => void;
  existingCategories?: string[];
  mode?: "full" | "expiry_only";
  title?: string;
};

export function AIPhotoCapture({ open, onClose, onResult, existingCategories = [], mode = "full", title }: Props) {
  const slots = mode === "expiry_only"
    ? [{ key: "expiry" as Kind, label: "Foto Kadaluarsa", hint: "Boleh > 1 sekaligus" }]
    : ALL_SLOTS;

  const [images, setImages] = useState<Partial<Record<Kind, string>>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const analyze = useServerFn(analyzeProductPhotos);

  const reset = () => {
    setImages({});
    setAnalyzing(false);
  };

  const handleClose = () => {
    if (analyzing) return;
    reset();
    onClose();
  };

  const handleFile = async (kind: Kind, file: File | undefined) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Foto terlalu besar (max 8MB)");
      return;
    }
    try {
      const dataUrl = await resizeImage(file, 1280, 0.78);
      setImages((prev) => ({ ...prev, [kind]: dataUrl }));
    } catch (e: any) {
      toast.error("Gagal memproses foto: " + (e?.message || ""));
    }
  };

  const runAnalyze = async () => {
    const payload = Object.entries(images)
      .filter(([, v]) => !!v)
      .map(([k, v]) => ({ kind: k as Kind, data_url: v as string }));
    if (payload.length === 0) {
      toast.error("Tambahkan minimal 1 foto");
      return;
    }
    setAnalyzing(true);
    try {
      const r = await analyze({ data: { images: payload, existing_categories: existingCategories, mode } });
      onResult(r);
      toast.success("Foto berhasil dianalisa");
      reset();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Gagal menganalisa");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> {title ?? "Isi Otomatis dengan AI"}
          </DialogTitle>
          <DialogDescription>
            Ambil foto kemasan, barcode, tanggal kadaluarsa, dan/atau struk modal. AI akan baca dan isi form otomatis. Anda tetap bisa edit sebelum simpan.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          {slots.map((s) => {
            const img = images[s.key];
            return (
              <div key={s.key} className="rounded-md border p-2.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">{s.label}{s.optional && <span className="text-[10px] text-muted-foreground"> (opsional)</span>}</div>
                    <div className="text-[11px] text-muted-foreground">{s.hint}</div>
                  </div>
                  {img && (
                    <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => setImages((p) => ({ ...p, [s.key]: undefined }))} disabled={analyzing}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>

                {img ? (
                  <img src={img} alt={s.label} className="h-28 w-full rounded object-cover" />
                ) : (
                  <div className="flex gap-1.5">
                    <Button type="button" size="sm" variant="outline" className="flex-1" disabled={analyzing} onClick={() => {
                      const el = document.createElement("input");
                      el.type = "file";
                      el.accept = "image/*";
                      el.setAttribute("capture", "environment");
                      el.onchange = () => handleFile(s.key, el.files?.[0]);
                      el.click();
                    }}>
                      <Camera className="mr-1 h-3.5 w-3.5" /> Foto
                    </Button>
                    <input
                      ref={(el) => { fileRefs.current[s.key] = el; }}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFile(s.key, e.target.files?.[0])}
                    />
                    <Button type="button" size="sm" variant="ghost" disabled={analyzing} onClick={() => fileRefs.current[s.key]?.click()}>
                      <Upload className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={analyzing}>Batal</Button>
          <Button onClick={runAnalyze} disabled={analyzing || Object.values(images).filter(Boolean).length === 0}>
            {analyzing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Menganalisa...</> : <><Sparkles className="mr-2 h-4 w-4" /> Analisa Foto</>}
          </Button>
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
