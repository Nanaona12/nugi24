import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatRupiah } from "@/lib/format";
import {
  Store, Search, ArrowRight, MapPin, Navigation, Loader2, Package, Filter, ShoppingBag,
} from "lucide-react";

export const Route = createFileRoute("/showcase")({
  head: () => ({
    meta: [
      { title: "Katalog Produk — Cari Barang dari Berbagai Toko" },
      { name: "description", content: "Cari produk & lihat harga dari berbagai toko. Filter per toko, kategori, dan lokasi terdekat." },
      { property: "og:title", content: "Katalog Produk — Cari Barang dari Berbagai Toko" },
      { property: "og:description", content: "Cari produk & lihat harga dari berbagai toko. Filter per toko, kategori, dan lokasi terdekat." },
    ],
  }),
  component: ShowcaseIndex,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6 text-sm">Tidak ditemukan</div>,
});

type StoreRow = {
  id: string; name: string; slug: string;
  phone: string | null; address: string | null;
  showcase_description: string | null;
  latitude: number | null; longitude: number | null;
};
type Product = {
  id: string; tenant_id: string; name: string; category: string | null;
  price: number; stock: number; image_url: string | null;
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
  const [tab, setTab] = useState<"produk" | "toko">("produk");
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [storeFilter, setStoreFilter] = useState<string>(""); // tenant_id
  const [category, setCategory] = useState<string>("");
  const [onlyStock, setOnlyStock] = useState(true);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locStatus, setLocStatus] = useState<"idle" | "loading" | "denied" | "ok">("idle");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: sData } = await (supabase as any)
        .from("tenants_showcase")
        .select("id, name, slug, phone, address, showcase_description, latitude, longitude")
        .eq("showcase_enabled", true)
        .not("slug", "is", null)
        .order("name");
      const s = (sData ?? []) as StoreRow[];
      setStores(s);

      if (s.length > 0) {
        const ids = s.map((x) => x.id);
        const { data: pData } = await (supabase as any)
          .from("products")
          .select("id, tenant_id, name, category, price, stock, image_url")
          .in("tenant_id", ids)
          .order("name")
          .limit(2000);
        setProducts((pData ?? []) as Product[]);
      }
      setLoading(false);
    })();
  }, []);

  const storeById = useMemo(() => {
    const m: Record<string, StoreRow> = {};
    for (const s of stores) m[s.id] = s;
    return m;
  }, [stores]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) if (p.category) set.add(p.category);
    return Array.from(set).sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    const t = q.trim().toLowerCase();
    return products.filter((p) => {
      if (storeFilter && p.tenant_id !== storeFilter) return false;
      if (category && p.category !== category) return false;
      if (onlyStock && p.stock <= 0) return false;
      if (t) {
        const inName = p.name.toLowerCase().includes(t);
        const inCat = (p.category ?? "").toLowerCase().includes(t);
        const inStore = (storeById[p.tenant_id]?.name ?? "").toLowerCase().includes(t);
        if (!inName && !inCat && !inStore) return false;
      }
      return true;
    });
  }, [products, q, storeFilter, category, onlyStock, storeById]);

  const requestLocation = () => {
    if (!("geolocation" in navigator)) { setLocStatus("denied"); return; }
    setLocStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude }); setLocStatus("ok"); },
      () => setLocStatus("denied"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const storeList = useMemo(() => {
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
      <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
        <header className="mb-6 text-center">
          <div className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ShoppingBag className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Katalog Produk</h1>
          <p className="mt-2 text-sm text-muted-foreground">Cari barang dari berbagai toko — hanya lihat, hubungi toko langsung untuk pesan.</p>
        </header>

        {/* Tabs */}
        <div className="mx-auto mb-4 flex max-w-md items-center justify-center gap-1 rounded-lg border bg-background p-1">
          <button
            onClick={() => setTab("produk")}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${tab === "produk" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Package className="mr-1 inline h-3.5 w-3.5" />Produk
          </button>
          <button
            onClick={() => setTab("toko")}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${tab === "toko" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Store className="mr-1 inline h-3.5 w-3.5" />Toko
          </button>
        </div>

        {/* Filter bar */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tab === "produk" ? "Cari produk, kategori, atau toko…" : "Cari toko / alamat…"}
              className="pl-9"
            />
          </div>

          {tab === "produk" && (
            <>
              <select
                value={storeFilter}
                onChange={(e) => setStoreFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Semua toko</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {categories.length > 0 && (
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Semua kategori</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
              <Button size="sm" variant={onlyStock ? "default" : "outline"} onClick={() => setOnlyStock((v) => !v)}>
                <Filter className="mr-1 h-3.5 w-3.5" />
                {onlyStock ? "Ada stok" : "Semua"}
              </Button>
            </>
          )}

          {tab === "toko" && (
            <Button
              type="button"
              variant={pos ? "default" : "outline"}
              onClick={requestLocation}
              disabled={locStatus === "loading"}
              size="sm"
            >
              {locStatus === "loading"
                ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Mendeteksi…</>
                : <><Navigation className="mr-1 h-4 w-4" />{pos ? "Terdekat aktif" : "Toko terdekat"}</>}
            </Button>
          )}
        </div>

        {locStatus === "denied" && tab === "toko" && (
          <div className="mb-4 text-center text-xs text-muted-foreground">
            Izin lokasi ditolak. Aktifkan lokasi di browser untuk melihat toko terdekat.
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Memuat…</div>
        ) : tab === "produk" ? (
          <ProductsGrid products={filteredProducts} storeById={storeById} totalStores={stores.length} />
        ) : (
          <StoresGrid list={storeList} totalStores={stores.length} fmtKm={fmtKm} />
        )}
      </div>
    </div>
  );
}

function ProductsGrid({
  products, storeById, totalStores,
}: {
  products: Product[];
  storeById: Record<string, StoreRow>;
  totalStores: number;
}) {
  if (totalStores === 0) {
    return <div className="py-16 text-center text-sm text-muted-foreground">Belum ada toko yang mengaktifkan galeri publik.</div>;
  }
  if (products.length === 0) {
    return <div className="py-16 text-center text-sm text-muted-foreground">Produk tidak ditemukan.</div>;
  }
  return (
    <>
      <div className="mb-3 text-xs text-muted-foreground">{products.length} produk</div>
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((p) => {
          const store = storeById[p.tenant_id];
          const out = p.stock <= 0;
          return (
            <Link
              key={p.id}
              to="/showcase/$slug"
              params={{ slug: store?.slug ?? "" }}
              className="block"
            >
              <Card className={`group overflow-hidden flex flex-col h-full transition hover:border-primary hover:shadow-md ${out ? "opacity-70" : ""}`}>
                <div className="relative aspect-square w-full bg-muted">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <Package className="h-10 w-10 opacity-40" />
                    </div>
                  )}
                  {out && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <Badge variant="destructive" className="text-[10px]">Stok habis</Badge>
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1 p-2.5">
                  <div className="line-clamp-2 min-h-[2.5rem] text-xs font-medium sm:text-sm">{p.name}</div>
                  <div className="text-sm font-bold text-primary sm:text-base">{formatRupiah(p.price)}</div>
                  {store && (
                    <div className="mt-auto flex items-center gap-1 truncate pt-1 text-[10px] text-muted-foreground">
                      <Store className="h-3 w-3 shrink-0" />
                      <span className="truncate">{store.name}</span>
                    </div>
                  )}
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}

function StoresGrid({
  list, totalStores, fmtKm,
}: {
  list: (StoreRow & { distanceKm: number | null })[];
  totalStores: number;
  fmtKm: (km: number) => string;
}) {
  if (list.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        {totalStores === 0 ? "Belum ada toko yang mengaktifkan galeri publik." : "Toko tidak ditemukan."}
      </div>
    );
  }
  return (
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
  );
}
