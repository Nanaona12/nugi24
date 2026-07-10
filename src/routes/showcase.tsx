import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Store, Search, ArrowRight, MapPin, Navigation, Loader2 } from "lucide-react";

export const Route = createFileRoute("/showcase")({
  head: () => ({
    meta: [
      { title: "Galeri Toko — Lihat Stok & Harga" },
      { name: "description", content: "Jelajahi daftar toko dan lihat stok serta harga produk terkini. Temukan toko terdekat dari lokasi Anda." },
      { property: "og:title", content: "Galeri Toko — Lihat Stok & Harga" },
      { property: "og:description", content: "Jelajahi daftar toko dan lihat stok serta harga produk terkini. Temukan toko terdekat dari lokasi Anda." },
    ],
  }),
  component: ShowcaseIndex,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6 text-sm">Tidak ditemukan</div>,
});

type Store = {
  id: string; name: string; slug: string;
  phone: string | null; address: string | null;
  showcase_description: string | null;
  latitude: number | null; longitude: number | null;
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function ShowcaseIndex() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locStatus, setLocStatus] = useState<"idle" | "loading" | "denied" | "ok">("idle");

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("tenants_showcase")
        .select("id, name, slug, phone, address, showcase_description, latitude, longitude")
        .eq("showcase_enabled", true)
        .not("slug", "is", null)
        .order("name");
      setStores((data ?? []) as Store[]);
      setLoading(false);
    })();
  }, []);

  const requestLocation = () => {
    if (!("geolocation" in navigator)) { setLocStatus("denied"); return; }
    setLocStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude }); setLocStatus("ok"); },
      () => setLocStatus("denied"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const list = useMemo(() => {
    const t = q.toLowerCase();
    const filtered = stores.filter((s) =>
      !t || s.name.toLowerCase().includes(t) || (s.address ?? "").toLowerCase().includes(t),
    );
    if (!pos) return filtered.map((s) => ({ ...s, distanceKm: null as number | null }));
    return filtered
      .map((s) => ({
        ...s,
        distanceKm: s.latitude != null && s.longitude != null
          ? haversineKm(pos.lat, pos.lng, s.latitude, s.longitude)
          : null,
      }))
      .sort((a, b) => {
        if (a.distanceKm == null && b.distanceKm == null) return 0;
        if (a.distanceKm == null) return 1;
        if (b.distanceKm == null) return -1;
        return a.distanceKm - b.distanceKm;
      });
  }, [stores, q, pos]);

  const fmtKm = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Store className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Galeri Toko</h1>
          <p className="mt-2 text-sm text-muted-foreground">Pilih toko untuk melihat stok & harga terkini per satuan.</p>
        </header>

        <div className="mx-auto mb-4 flex max-w-md flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari toko / alamat…" className="pl-9" />
          </div>
          <Button
            type="button"
            variant={pos ? "default" : "outline"}
            onClick={requestLocation}
            disabled={locStatus === "loading"}
            className="shrink-0"
          >
            {locStatus === "loading"
              ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Mendeteksi…</>
              : <><Navigation className="mr-1 h-4 w-4" />{pos ? "Terdekat aktif" : "Toko terdekat"}</>}
          </Button>
        </div>
        {locStatus === "denied" && (
          <div className="mx-auto mb-4 max-w-md text-center text-xs text-muted-foreground">
            Izin lokasi ditolak. Aktifkan lokasi di browser untuk melihat toko terdekat.
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Memuat toko…</div>
        ) : list.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {stores.length === 0 ? "Belum ada toko yang mengaktifkan galeri publik." : "Toko tidak ditemukan."}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {list.map((s) => (
              <Link key={s.id} to="/showcase/$slug" params={{ slug: s.slug }} className="block">
                <Card className="group flex items-center gap-4 p-4 transition hover:border-primary hover:shadow-md">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Store className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="truncate font-semibold">{s.name}</div>
                      {s.distanceKm != null && (
                        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          {fmtKm(s.distanceKm)}
                        </span>
                      )}
                    </div>
                    {s.address && (
                      <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {s.address}
                      </div>
                    )}
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
