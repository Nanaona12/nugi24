import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listAllTenants } from "@/lib/billing.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRupiah } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6 text-sm">Tidak ditemukan</div>,
});

function AdminPage() {
  const fn = useServerFn(listAllTenants);
  const { data, isLoading, error } = useQuery({ queryKey: ["admin-tenants"], queryFn: () => fn(), retry: false });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Memuat...</div>;
  if (error) return <div className="p-6 text-sm text-destructive">{(error as Error).message}</div>;

  const tenants = data?.tenants ?? [];
  const pays = data?.recentPayments ?? [];
  const totalPaid = pays.filter((p: any) => p.status === "paid").reduce((s: number, p: any) => s + p.amount, 0);
  const activeCount = tenants.filter((t: any) => t.subscriptions?.[0]?.status === "active").length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Super Admin</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Total Toko" value={tenants.length.toString()} />
        <Stat label="Toko Aktif" value={activeCount.toString()} />
        <Stat label="Pemasukan (100 terakhir)" value={formatRupiah(totalPaid)} />
      </div>

      <Card>
        <CardHeader><CardTitle>Semua Toko</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr><th className="py-2">Nama Toko</th><th>WA</th><th>Status</th><th>Berakhir</th><th>Daftar</th></tr>
              </thead>
              <tbody>
                {tenants.map((t: any) => {
                  const s = t.subscriptions?.[0];
                  return (
                    <tr key={t.id} className="border-t">
                      <td className="py-2 font-medium">{t.name}</td>
                      <td>{t.phone ?? "-"}</td>
                      <td><Badge variant={s?.status === "active" ? "default" : s?.status === "trialing" ? "secondary" : "destructive"}>{s?.status ?? "-"}</Badge></td>
                      <td>{s ? new Date(s.current_period_end).toLocaleDateString("id-ID") : "-"}</td>
                      <td>{new Date(t.created_at).toLocaleDateString("id-ID")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Pembayaran Terbaru</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr><th className="py-2">Tanggal</th><th>Tenant</th><th>Metode</th><th className="text-right">Jumlah</th><th>Status</th></tr>
              </thead>
              <tbody>
                {pays.map((p: any, i: number) => {
                  const t = tenants.find((x: any) => x.id === p.tenant_id);
                  return (
                    <tr key={i} className="border-t">
                      <td className="py-2">{new Date(p.created_at).toLocaleString("id-ID")}</td>
                      <td>{t?.name ?? p.tenant_id.slice(0, 8)}</td>
                      <td>{p.payment_type ?? "-"}</td>
                      <td className="text-right">{formatRupiah(p.amount)}</td>
                      <td><Badge variant={p.status === "paid" ? "default" : p.status === "pending" ? "secondary" : "destructive"}>{p.status}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
