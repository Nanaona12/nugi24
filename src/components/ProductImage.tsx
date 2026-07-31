import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "product-photos";
const cache = new Map<string, string>();

export function storagePathFromUrl(url: string): string | null {
  const marker = `/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const raw = url.slice(i + marker.length).split("?")[0];
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Resolve a stored product photo URL into a usable (signed) URL. */
export async function resolvePhotoUrl(url: string): Promise<string> {
  if (cache.has(url)) return cache.get(url)!;
  const path = storagePathFromUrl(url);
  if (!path) return url;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 7);
  const resolved = data?.signedUrl || url;
  cache.set(url, resolved);
  return resolved;
}

type Props = {
  src: string;
  alt: string;
  className?: string;
  loading?: "lazy" | "eager";
  /** Klik gambar untuk melihat pratinjau besar. */
  zoomable?: boolean;
};

export function ProductImage({ src, alt, className, loading = "lazy", zoomable = false }: Props) {
  const [resolved, setResolved] = useState<string | null>(() => cache.get(src) ?? null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const cached = cache.get(src);
    if (cached) {
      setResolved(cached);
      return;
    }
    setResolved(null);
    resolvePhotoUrl(src).then((u) => {
      if (active) setResolved(u);
    });
    return () => {
      active = false;
    };
  }, [src]);

  if (!resolved) return <div className={`bg-muted ${className ?? ""}`} aria-label={alt} />;

  const img = <img src={resolved} alt={alt} className={className} loading={loading} />;
  if (!zoomable) return img;

  return (
    <>
      <button
        type="button"
        className="contents cursor-zoom-in"
        aria-label={`Lihat gambar ${alt}`}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen(true);
        }}
      >
        {img}
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-black/80 p-4 backdrop-blur-sm"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
          }}
        >
          <img
            src={resolved}
            alt={alt}
            className="max-h-[80vh] max-w-full rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <p className="max-w-[90vw] text-center text-sm font-medium text-white">{alt}</p>
          <p className="text-xs text-white/70">Ketuk di luar gambar untuk menutup</p>
        </div>
      )}
    </>
  );
}
