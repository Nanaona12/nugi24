import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRupiah } from "@/lib/format";
import { ArrowLeft, Search, Package, MessageCircle, MapPin, Phone, Store, Filter, Navigation } from "lucide-react";

export const Route = createFileRoute("/showcase/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `Galeri Toko ${params.slug}` },
      { name: "description", content: `Lihat stok dan harga per satuan di toko ${params.slug}.` },
      { property: "og:title", content: `Galeri Toko ${params.slug}` },
      { property: "og:description", content: `Lihat stok dan harga per satuan di toko ${params.slug}.` },
    ],
  }),
  component: ShowcaseDetail,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => (
    <div className="mx-auto max-w-lg p-8 text-center">
      <div className="mb-2 text-lg font-semibold">Toko tidak ditemukan</div>
      <p className="mb-4 text-sm text-muted-foreground">Toko mungkin belum mengaktifkan galeri publik.</p>
      <Link to="/showcase"><Button variant="outline"><ArrowLeft className="mr-1 h-4 w-4" />Kembali</Button></Link>
    </div>
  ),
});

type Tenant = { id: string; name: string; slug: string; phone: string | null; address: string | null; showcase_description: string | null; latitude: number | null; longitude: number | null };
type Product = { id: string; name: string; category: string | null; price: number; stock: number; image_url: string | null; code: string };
type Unit = { id: string; product_id: string; name: string; conversion: number; sort_order: number; is_base: boolean };
type Tier = { id: string; product_unit_id: string; min_qty: number; price: number };

function ShowcaseDetail() {
  const { slug } = Route.useParams();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("");
  const [onlyStock, setOnlyStock] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: t } = await (supabase as any)
        .from("tenants")
        .select("id, name, slug, phone, address, showcase_description, latitude, longitude")
        .eq("slug", slug)
        .eq("showcase_enabled", true)
        .maybeSingle();
      if (!t) { setLoading(false); throw notFound(); }
      setTenant(t as Tenant);

      const [{ data: prods }, { data: us }, { data: ts }] = await Promise.all([
        (supabase as any).from("products")
          .select("id, name, category, price, stock, image_url, code")
          .eq("tenant_id", t.id)
          .order("name"),
        (supabase as any).from("product_units")
          .select("id, product_id, name, conversion, sort_order, is_base")
          .eq("tenant_id", t.id)
          .order("sort_order"),
        (supabase as any).from("product_price_tiers")
          .select("id, product_unit_id, min_qty, price")
          .eq("tenant_id", t.id)
          .order("min_qty"),
      ]);
      setProducts((prods ?? []) as Product[]);
      setUnits((us ?? []) as Unit[]);
      setTiers((ts ?? []) as Tier[]);
      setLoading(false);
    })().catch(() => setLoading(false));
  }, [slug]);

  const unitsByProduct = useMemo(() => {
    const map: Record<string, Unit[]> = {};
    for (const u of units) (map[u.product_id] ||= []).push(u);
    return map;
  }, [units]);
  const tiersByUnit = useMemo(() => {
    const map: Record<string, Tier[]> = {};
    for (const t of tiers) (map[t.product_unit_id] ||= []).push(t);
    return map;
  }, [tiers]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const p of products) if (p.category) s.add(p.category);
    return Array.from(s).sort();
  }, [products]);

  const filtered = products.filter((p) => {
    const t = q.toLowerCase();
    if (t && !p.name.toLowerCase().includes(t) && !(p.category ?? "").toLowerCase().includes(t)) return false;
    if (category && p.category !== category) return false;
    if (onlyStock && p.stock <= 0) return false;
    return true;
  });

  const waLink = (msg?: string) => {
    if (!tenant?.phone) return null;
    const num = tenant.phone.replace(/\D/g, "").replace(/^0/, "62");
    return `https://wa.me/${num}${msg ? `?text=${encodeURIComponent(msg)}` : ""}`;
  };

  if (loading && !tenant) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Memuat toko…</div>;
  }
  if (!tenant) return null;

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary/10 via-background to-background border-b">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
          <Link to="/showcase" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Semua toko
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <Store className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold sm:text-3xl">{tenant.name}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {tenant.address && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{tenant.address}</span>}
                  {tenant.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{tenant.phone}</span>}
                </div>
                {tenant.showcase_description && (
                  <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{tenant.showcase_description}</p>
                )}
              </div>
            </div>
            {tenant.phone && (
              <a href={waLink(`Halo ${tenant.name}, saya lihat galeri toko Anda`) ?? "#"} target="_blank" rel="noreferrer">
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white"><MessageCircle className="mr-1 h-4 w-4" />Chat WhatsApp</Button>
              </a>
            )}
          </div>

          {(tenant.latitude != null && tenant.longitude != null) && (
            <StoreMap lat={tenant.latitude} lng={tenant.longitude} name={tenant.name} address={tenant.address} />
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari produk…" className="pl-9" />
            </div>
            {categories.length > 0 && (
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Semua kategori</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            <Button size="sm" variant={onlyStock ? "default" : "outline"} onClick={() => setOnlyStock((v) => !v)}>
              <Filter className="mr-1 h-3.5 w-3.5" />
              {onlyStock ? "Ada stok" : "Semua"}
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-3 text-xs text-muted-foreground">{filtered.length} produk</div>
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Tidak ada produk cocok.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => {
              const pUnits = (unitsByProduct[p.id] ?? []).sort((a, b) => a.sort_order - b.sort_order);
              const out = p.stock <= 0;
              return (
                <Card key={p.id} className={`overflow-hidden flex flex-col ${out ? "opacity-70" : ""}`}>
                  <div className="relative aspect-square w-full bg-muted">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        <Package className="h-12 w-12 opacity-40" />
                      </div>
                    )}
                    {out && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <Badge variant="destructive">Stok habis</Badge>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="line-clamp-2 text-sm font-semibold">{p.name}</div>
                        {p.category && <div className="mt-0.5 text-[11px] text-muted-foreground">{p.category}</div>}
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Stok</div>
                        <div className={`text-sm font-bold ${out ? "text-destructive" : "text-emerald-600"}`}>{p.stock}</div>
                      </div>
                    </div>

                    <div className="mt-2.5 space-y-1.5">
                      {pUnits.length === 0 ? (
                        <div className="text-sm font-bold text-primary">{formatRupiah(p.price)}</div>
                      ) : pUnits.map((u) => {
                        const uTiers = (tiersByUnit[u.id] ?? []).sort((a, b) => a.min_qty - b.min_qty);
                        if (uTiers.length === 0) return null;
                        return (
                          <div key={u.id} className="rounded-md bg-muted/50 px-2 py-1.5 text-xs">
                            <div className="mb-0.5 font-medium">{u.name}{u.is_base ? "" : ` (${u.conversion} pcs)`}</div>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                              {uTiers.map((t) => (
                                <span key={t.id}>
                                  {t.min_qty > 1 && <span className="text-muted-foreground">≥{t.min_qty} </span>}
                                  <span className="font-semibold text-primary">{formatRupiah(t.price)}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {tenant.phone && !out && (
                      <a
                        href={waLink(`Halo ${tenant.name}, saya mau tanya/pesan produk *${p.name}*`) ?? "#"}
                        target="_blank" rel="noreferrer"
                        className="mt-3"
                      >
                        <Button size="sm" variant="outline" className="w-full">
                          <MessageCircle className="mr-1 h-3.5 w-3.5" />Pesan via WA
                        </Button>
                      </a>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <div className="mt-10 border-t pt-4 text-center text-[11px] text-muted-foreground">
          Galeri publik oleh <span className="font-medium text-foreground">{tenant.name}</span>
        </div>
      </div>
    </div>
  );
}

function StoreMap({ lat, lng, name, address }: { lat: number; lng: number; name: string; address: string | null }) {
  const delta = 0.008;
  const bbox = `${lng - delta}%2C${lat - delta}%2C${lng + delta}%2C${lat + delta}`;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
  const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  const osm = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
  return (
    <div className="mt-5 overflow-hidden rounded-xl border bg-background">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <MapPin className="h-3.5 w-3.5 text-primary" />
          <span className="truncate font-medium">Lokasi {name}</span>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <a href={osm} target="_blank" rel="noreferrer">
            <Button size="sm" variant="outline" className="h-7 text-[11px]">Peta</Button>
          </a>
          <a href={gmaps} target="_blank" rel="noreferrer">
            <Button size="sm" className="h-7 text-[11px]"><Navigation className="mr-1 h-3 w-3" />Rute</Button>
          </a>
        </div>
      </div>
      <iframe
        title={`Peta ${name}`}
        src={src}
        loading="lazy"
        className="block h-56 w-full sm:h-64"
        style={{ border: 0 }}
      />
      {address && <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">{address}</div>}
    </div>
  );
}

