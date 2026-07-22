import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/stok-log")({
  head: () => ({
    meta: [
      { title: "Stock Opname - Log Perubahan Stok" },
      { name: "description", content: "Riwayat harian perubahan stok produk untuk audit stock opname." },
      { property: "og:title", content: "Stock Opname - Log Perubahan Stok" },
      { property: "og:description", content: "Riwayat harian perubahan stok produk untuk audit stock opname." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StokLogPage,
});

type Row = {
  id: string;
  product_id: string;
  old_stock: number;
  new_stock: number;
  delta: number;
  source: string | null;
  changed_by: string | null;
  created_at: string;
};

type Product = { id: string; name: string; code: string | null; stock: number };

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" });
}
function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function StokLogPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [productFilter, setProductFilter] = useState<string>("");
  const [startDate, setStartDate] = useState(todayISO(-30));
  const [endDate, setEndDate] = useState(todayISO(0));

  const load = async () => {
    setLoading(true);
    try {
      const startISO = new Date(startDate + "T00:00:00").toISOString();
      const endISO = new Date(endDate + "T23:59:59").toISOString();
      const [{ data: mv, error: e1 }, { data: pr, error: e2 }] = await Promise.all([
        (supabase as any)
          .from("stock_movements")
          .select("id, product_id, old_stock, new_stock, delta, source, changed_by, created_at")
          .gte("created_at", startISO)
          .lte("created_at", endISO)
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase.from("products").select("id, name, code, stock").order("name"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      setRows((mv || []) as Row[]);
      setProducts((pr || []) as Product[]);
    } catch (e: any) {
      toast.error(e.message || "Gagal memuat log");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (productFilter && r.product_id !== productFilter) return false;
      if (!query) return true;
      const p = productMap.get(r.product_id);
      return (
        p?.name?.toLowerCase().includes(query) ||
        p?.code?.toLowerCase().includes(query) ||
        (r.source ?? "").toLowerCase().includes(query)
      );
    });
  }, [rows, q, productFilter, productMap]);

  // Daily summary per product within range
  type Summary = {
    product_id: string;
    name: string;
    code: string | null;
    currentStock: number;
    totalIn: number;
    totalOut: number;
    net: number;
    changes: number;
  };
  const summaries = useMemo<Summary[]>(() => {
    const map = new Map<string, Summary>();
    for (const r of rows) {
      const p = productMap.get(r.product_id);
      const s = map.get(r.product_id) || {
        product_id: r.product_id,
        name: p?.name || "(produk dihapus)",
        code: p?.code || null,
        currentStock: p?.stock ?? 0,
        totalIn: 0,
        totalOut: 0,
        net: 0,
        changes: 0,
      };
      if (r.delta > 0) s.totalIn += r.delta;
      else s.totalOut += -r.delta;
      s.net += r.delta;
      s.changes += 1;
      map.set(r.product_id, s);
    }
    return Array.from(map.values()).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  }, [rows, productMap]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Stock Opname · Log Perubahan Stok</h1>
        <p className="text-sm text-muted-foreground">
          Semua perubahan stok tercatat otomatis: penjualan, refund, penerimaan PO, pengambilan rumah tangga, dan edit manual.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Dari</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Sampai</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="min-w-[220px] flex-1">
              <label className="mb-1 block text-xs text-muted-foreground">Cari produk / sumber</label>
              <Input placeholder="Nama produk, kode, atau sumber…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="min-w-[220px]">
              <label className="mb-1 block text-xs text-muted-foreground">Filter 1 produk</label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value)}
              >
                <option value="">Semua produk</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.code ? ` (${p.code})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <Button variant="outline" onClick={load} disabled={loading}>
              {loading ? "Memuat…" : "Muat Ulang"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ringkasan per Produk ({summaries.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {summaries.length === 0 ? (
            <div className="text-sm text-muted-foreground">Tidak ada perubahan stok pada rentang ini.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="p-2">Produk</th>
                    <th className="p-2 text-right">Stok Sekarang</th>
                    <th className="p-2 text-right">Masuk (+)</th>
                    <th className="p-2 text-right">Keluar (−)</th>
                    <th className="p-2 text-right">Netto</th>
                    <th className="p-2 text-right">Jumlah Perubahan</th>
                  </tr>
                </thead>
                <tbody>
                  {summaries.map((s) => (
                    <tr key={s.product_id} className="border-b last:border-b-0">
                      <td className="p-2">
                        <div className="font-medium">{s.name}</div>
                        {s.code && <div className="text-xs text-muted-foreground">{s.code}</div>}
                      </td>
                      <td className="p-2 text-right">{s.currentStock}</td>
                      <td className="p-2 text-right text-green-600">+{s.totalIn}</td>
                      <td className="p-2 text-right text-red-600">−{s.totalOut}</td>
                      <td className={`p-2 text-right font-semibold ${s.net >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {s.net >= 0 ? "+" : ""}
                        {s.net}
                      </td>
                      <td className="p-2 text-right">{s.changes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detail Perubahan ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground">Tidak ada data.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="p-2">Waktu</th>
                    <th className="p-2">Produk</th>
                    <th className="p-2 text-right">Stok Lama</th>
                    <th className="p-2 text-right">Stok Baru</th>
                    <th className="p-2 text-right">Delta</th>
                    <th className="p-2">Sumber</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const p = productMap.get(r.product_id);
                    return (
                      <tr key={r.id} className="border-b last:border-b-0">
                        <td className="p-2 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                        <td className="p-2">
                          <div className="font-medium">{p?.name || "(produk dihapus)"}</div>
                          {p?.code && <div className="text-xs text-muted-foreground">{p.code}</div>}
                        </td>
                        <td className="p-2 text-right">{r.old_stock}</td>
                        <td className="p-2 text-right">{r.new_stock}</td>
                        <td className={`p-2 text-right font-semibold ${r.delta >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {r.delta >= 0 ? "+" : ""}
                          {r.delta}
                        </td>
                        <td className="p-2">
                          <Badge variant="outline" className="text-[10px]">
                            {r.source || "manual/edit"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-2 text-xs text-muted-foreground">
            Menampilkan maksimal 1000 baris terbaru pada rentang tanggal. Persempit rentang jika perlu.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
