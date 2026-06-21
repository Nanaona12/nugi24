import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wifi, Database, Server, Package } from "lucide-react";

export const Route = createFileRoute("/_authenticated/cek-koneksi")({
  component: CekKoneksiPage,
});

function CekKoneksiPage() {
  const [productCount, setProductCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "—";

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const { count, error: err } = await supabase
          .from("products")
          .select("*", { count: "exact", head: true });
        if (cancelled) return;
        if (err) throw err;
        setProductCount(count ?? 0);
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? "Gagal memuat data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    check();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cek Koneksi</h1>
        <p className="text-muted-foreground">Informasi koneksi database dan data produk.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Status Koneksi</CardTitle>
            <Wifi className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
              </span>
              <span className="text-lg font-semibold">Terhubung</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Koneksi ke backend aktif.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Project / URL</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium break-all">{supabaseUrl}</div>
            <Badge variant="outline" className="mt-2">Supabase</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Jumlah Produk</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-7 w-16 animate-pulse rounded bg-muted" />
            ) : error ? (
              <div className="text-sm text-destructive">{error}</div>
            ) : (
              <div className="flex items-baseline gap-2">
                <Database className="h-5 w-5 text-primary" />
                <span className="text-3xl font-bold">{productCount ?? 0}</span>
                <span className="text-sm text-muted-foreground">produk</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
