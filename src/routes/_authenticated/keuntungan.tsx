import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { formatRupiah } from "@/lib/format";
import { TrendingUp, DollarSign, ShoppingBag, Calendar, PackageX, ShoppingCart } from "lucide-react";

export const Route = createFileRoute("/_authenticated/keuntungan")({
  component: KeuntunganPage,
});

type Item = {
  qty: number;
  unit_price: number;
  unit_cost: number;
  subtotal: number;
  product_name: string;
  transactions: { created_at: string } | null;
};

type Bucket = {
  key: string;
  label: string;
  revenue: number;
  cost: number;
  profit: number;
  count: number;
};

type LowStockProduct = {
  id: string;
  code: string;
  name: string;
  category: string | null;
  stock: number;
  price: number;
};

const LOW_STOCK_THRESHOLD = 5;

function KeuntunganPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [lowStock, setLowStock] = useState<LowStockProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [itemsRes, lowRes] = await Promise.all([
        supabase
          .from("transaction_items")
          .select("qty, unit_price, unit_cost, subtotal, product_name, transactions(created_at)")
          .order("id", { ascending: false })
          .limit(5000),
        supabase
          .from("products")
          .select("id, code, name, category, stock, price")
          .lte("stock", LOW_STOCK_THRESHOLD)
          .order("stock", { ascending: true })
          .limit(100),
      ]);
      if (itemsRes.error) toast.error(itemsRes.error.message);
      else setItems((itemsRes.data || []) as unknown as Item[]);
      if (lowRes.error) toast.error(lowRes.error.message);
      else setLowStock((lowRes.data || []) as LowStockProduct[]);
      setLoading(false);
    })();
  }, []);


  const stats = useMemo(() => {
    const now = new Date();
    const todayKey = ymd(now);
    const monthKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
    const yearKey = String(now.getFullYear());

    let todayProfit = 0, todayRev = 0;
    let monthProfit = 0, monthRev = 0;
    let yearProfit = 0, yearRev = 0;
    let allProfit = 0, allRev = 0;

    const dailyMap = new Map<string, Bucket>();
    const monthlyMap = new Map<string, Bucket>();
    const yearlyMap = new Map<string, Bucket>();
    const productMap = new Map<string, { name: string; qty: number; revenue: number; profit: number }>();

    for (const it of items) {
      const at = it.transactions?.created_at;
      if (!at) continue;
      const d = new Date(at);
      const dk = ymd(d);
      const mk = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      const yk = String(d.getFullYear());
      const rev = Number(it.subtotal);
      const cost = Number(it.unit_cost) * it.qty;
      const profit = rev - cost;

      allRev += rev; allProfit += profit;
      if (dk === todayKey) { todayRev += rev; todayProfit += profit; }
      if (mk === monthKey) { monthRev += rev; monthProfit += profit; }
      if (yk === yearKey) { yearRev += rev; yearProfit += profit; }

      bump(dailyMap, dk, dk, rev, cost, profit);
      bump(monthlyMap, mk, mk, rev, cost, profit);
      bump(yearlyMap, yk, yk, rev, cost, profit);

      const pm = productMap.get(it.product_name) || { name: it.product_name, qty: 0, revenue: 0, profit: 0 };
      pm.qty += it.qty;
      pm.revenue += rev;
      pm.profit += profit;
      productMap.set(it.product_name, pm);
    }

    const daily = Array.from(dailyMap.values()).sort((a, b) => b.key.localeCompare(a.key)).slice(0, 30);
    const monthly = Array.from(monthlyMap.values()).sort((a, b) => b.key.localeCompare(a.key)).slice(0, 24);
    const yearly = Array.from(yearlyMap.values()).sort((a, b) => b.key.localeCompare(a.key));
    const topProducts = Array.from(productMap.values()).sort((a, b) => b.profit - a.profit).slice(0, 10);

    return { todayProfit, todayRev, monthProfit, monthRev, yearProfit, yearRev, allProfit, allRev, daily, monthly, yearly, topProducts };
  }, [items]);

  if (loading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Memuat data keuntungan...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Calendar className="h-5 w-5" />}
          label="Keuntungan Hari Ini"
          value={formatRupiah(stats.todayProfit)}
          sub={`Omset ${formatRupiah(stats.todayRev)}`}
          tone="primary"
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Keuntungan Bulan Ini"
          value={formatRupiah(stats.monthProfit)}
          sub={`Omset ${formatRupiah(stats.monthRev)}`}
          tone="success"
        />
        <StatCard
          icon={<DollarSign className="h-5 w-5" />}
          label="Keuntungan Tahun Ini"
          value={formatRupiah(stats.yearProfit)}
          sub={`Omset ${formatRupiah(stats.yearRev)}`}
        />
        <StatCard
          icon={<ShoppingBag className="h-5 w-5" />}
          label="Total Keuntungan"
          value={formatRupiah(stats.allProfit)}
          sub={`Omset ${formatRupiah(stats.allRev)}`}
        />
      </div>

      {items.length === 0 && (
        <Card className="p-6 text-sm text-muted-foreground">
          Belum ada data transaksi. Selesaikan transaksi di menu Kasir untuk melihat keuntungan.
        </Card>
      )}

      {items.some((it) => Number(it.unit_cost) === 0) && (
        <Card className="border-warning/40 bg-warning/10 p-3 text-xs">
          <strong>Catatan:</strong> Sebagian item tercatat tanpa harga modal (modal = 0), sehingga keuntungan dihitung sama dengan harga jual. Isi <em>Harga Modal</em> di menu Produk agar perhitungan akurat.
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b bg-muted/40 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <PackageX className="h-4 w-4 text-destructive" />
            Produk Habis / Stok Menipis
            <Badge variant="secondary">{lowStock.length}</Badge>
          </div>
          <Button asChild size="sm" variant="default">
            <Link to="/po"><ShoppingCart className="mr-1 h-4 w-4" />Buat PO</Link>
          </Button>
        </div>
        {lowStock.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Semua produk masih memiliki stok aman (&gt; {LOW_STOCK_THRESHOLD}).
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Kode</th>
                  <th className="p-3">Nama Produk</th>
                  <th className="p-3">Kategori</th>
                  <th className="p-3 text-right">Sisa Stok</th>
                  <th className="p-3 text-right">Harga</th>
                  <th className="p-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.map((p) => (
                  <tr key={p.id} className="border-t hover:bg-muted/40">
                    <td className="p-3 font-mono text-xs">{p.code}</td>
                    <td className="p-3 font-medium">{p.name}</td>
                    <td className="p-3 text-muted-foreground">{p.category || "-"}</td>
                    <td className="p-3 text-right font-semibold">{p.stock}</td>
                    <td className="p-3 text-right">{formatRupiah(Number(p.price))}</td>
                    <td className="p-3 text-right">
                      {p.stock <= 0 ? (
                        <Badge variant="destructive">Habis</Badge>
                      ) : (
                        <Badge variant="secondary">Menipis</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>



      <Tabs defaultValue="daily">
        <TabsList>
          <TabsTrigger value="daily">Per Hari</TabsTrigger>
          <TabsTrigger value="monthly">Per Bulan</TabsTrigger>
          <TabsTrigger value="yearly">Per Tahun</TabsTrigger>
          <TabsTrigger value="products">Produk Terlaris</TabsTrigger>
        </TabsList>

        <TabsContent value="daily">
          <BucketTable rows={stats.daily} labelHeader="Tanggal" formatLabel={(k) => formatDate(k)} />
        </TabsContent>
        <TabsContent value="monthly">
          <BucketTable rows={stats.monthly} labelHeader="Bulan" formatLabel={(k) => formatMonth(k)} />
        </TabsContent>
        <TabsContent value="yearly">
          <BucketTable rows={stats.yearly} labelHeader="Tahun" formatLabel={(k) => k} />
        </TabsContent>
        <TabsContent value="products">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-3">Produk</th>
                    <th className="p-3 text-right">Qty Terjual</th>
                    <th className="p-3 text-right">Omset</th>
                    <th className="p-3 text-right">Keuntungan</th>
                    <th className="p-3 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.topProducts.length === 0 ? (
                    <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Belum ada data</td></tr>
                  ) : stats.topProducts.map((p) => {
                    const margin = p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0;
                    return (
                      <tr key={p.name} className="border-t hover:bg-muted/40">
                        <td className="p-3 font-medium">{p.name}</td>
                        <td className="p-3 text-right">{p.qty}</td>
                        <td className="p-3 text-right">{formatRupiah(p.revenue)}</td>
                        <td className="p-3 text-right font-semibold text-primary">{formatRupiah(p.profit)}</td>
                        <td className="p-3 text-right">
                          <Badge variant={margin >= 20 ? "default" : "secondary"}>{margin.toFixed(1)}%</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BucketTable({ rows, labelHeader, formatLabel }: { rows: Bucket[]; labelHeader: string; formatLabel: (k: string) => string }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3">{labelHeader}</th>
              <th className="p-3 text-right">Omset</th>
              <th className="p-3 text-right">Modal</th>
              <th className="p-3 text-right">Keuntungan</th>
              <th className="p-3 text-right">Margin</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Belum ada data</td></tr>
            ) : rows.map((r) => {
              const margin = r.revenue > 0 ? (r.profit / r.revenue) * 100 : 0;
              return (
                <tr key={r.key} className="border-t hover:bg-muted/40">
                  <td className="p-3 font-medium">{formatLabel(r.key)}</td>
                  <td className="p-3 text-right">{formatRupiah(r.revenue)}</td>
                  <td className="p-3 text-right text-muted-foreground">{formatRupiah(r.cost)}</td>
                  <td className="p-3 text-right font-semibold text-primary">{formatRupiah(r.profit)}</td>
                  <td className="p-3 text-right">
                    <Badge variant={margin >= 20 ? "default" : "secondary"}>{margin.toFixed(1)}%</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function StatCard({
  icon, label, value, sub, tone,
}: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: "primary" | "success" }) {
  const toneCls = tone === "primary" ? "text-primary" : tone === "success" ? "text-success" : "text-foreground";
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
        <span className={toneCls}>{icon}</span>
        {label}
      </div>
      <div className={`mt-2 text-2xl font-bold ${toneCls}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}

function bump(m: Map<string, Bucket>, key: string, label: string, rev: number, cost: number, profit: number) {
  const b = m.get(key) || { key, label, revenue: 0, cost: 0, profit: 0, count: 0 };
  b.revenue += rev; b.cost += cost; b.profit += profit; b.count += 1;
  m.set(key, b);
}
function pad(n: number) { return String(n).padStart(2, "0"); }
function ymd(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function formatDate(k: string) {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}
function formatMonth(k: string) {
  const [y, m] = k.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}
