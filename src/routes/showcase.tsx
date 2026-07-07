import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Store, Search, ArrowRight, MapPin } from "lucide-react";

export const Route = createFileRoute("/showcase")({
  head: () => ({
    meta: [
      { title: "Galeri Toko — Lihat Stok & Harga" },
      { name: "description", content: "Jelajahi daftar toko dan lihat stok serta harga produk terkini." },
      { property: "og:title", content: "Galeri Toko — Lihat Stok & Harga" },
      { property: "og:description", content: "Jelajahi daftar toko dan lihat stok serta harga produk terkini." },
    ],
  }),
  component: ShowcaseIndex,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6 text-sm">Tidak ditemukan</div>,
});

type Store = { id: string; name: string; slug: string; phone: string | null; address: string | null; showcase_description: string | null };

function ShowcaseIndex() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("tenants")
        .select("id, name, slug, phone, address, showcase_description")
        .eq("showcase_enabled", true)
        .not("slug", "is", null)
        .order("name");
      setStores((data ?? []) as Store[]);
      setLoading(false);
    })();
  }, []);

  const filtered = stores.filter((s) => {
    const t = q.toLowerCase();
    return !t || s.name.toLowerCase().includes(t) || (s.address ?? "").toLowerCase().includes(t);
  });

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

        <div className="relative mb-6 max-w-md mx-auto">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari toko / alamat…" className="pl-9" />
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Memuat toko…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {stores.length === 0 ? "Belum ada toko yang mengaktifkan galeri publik." : "Toko tidak ditemukan."}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((s) => (
              <Link key={s.id} to="/showcase/$slug" params={{ slug: s.slug }} className="block">
                <Card className="group flex items-center gap-4 p-4 transition hover:border-primary hover:shadow-md">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Store className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{s.name}</div>
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
