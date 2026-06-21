import { useEffect, useRef } from "react";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
  title?: string;
  description?: string;
};

export function BarcodeScanner({ open, onClose, onDetected, title = "Scan Barcode", description }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  useEffect(() => {
    if (!open) return;
    const reader = new BrowserMultiFormatReader();
    let stopped = false;

    (async () => {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        const back = devices.find((d) => /back|rear|environment/i.test(d.label)) || devices[0];
        if (!back) {
          toast.error("Tidak ada kamera terdeteksi");
          onClose();
          return;
        }
        const controls = await reader.decodeFromVideoDevice(back.deviceId, videoRef.current!, (result) => {
          if (result && !stopped) {
            stopped = true;
            const text = result.getText();
            controls.stop();
            onDetected(text);
          }
        });
        controlsRef.current = controls;
      } catch (e: any) {
        toast.error("Gagal akses kamera: " + (e?.message || ""));
        onClose();
      }
    })();

    return () => {
      stopped = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open, onDetected, onClose]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="relative overflow-hidden rounded-lg bg-black aspect-video">
          <video ref={videoRef} className="h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-destructive/80" />
        </div>
        <p className="text-xs text-muted-foreground text-center">Arahkan kamera ke barcode produk</p>
      </DialogContent>
    </Dialog>
  );
}
