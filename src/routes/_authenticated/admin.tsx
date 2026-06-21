import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listAllTenants,
  adminExtendSubscription,
  adminSetSubscriptionStatus,
  adminUpdateTenant,
  adminDeleteTenant,
  adminGetTenantStats,
  adminCreateTenant,
  adminRecordPayment,
} from "@/lib/billing.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatRupiah } from "@/lib/format";
import { toast } from "sonner";
import { Settings, Trash2, Calendar, Pause, Play, Plus, Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6 text-sm">Tidak ditemukan</div>,
});

function AdminPage() {
  const qc = useQueryClient();
  const fn = useServerFn(listAllTenants);
  const extendFn = useServerFn(adminExtendSubscription);
  const statusFn = useServerFn(adminSetSubscriptionStatus);
  const deleteFn = useServerFn(adminDeleteTenant);

  const { data, isLoading, error } = useQuery({ queryKey: ["admin-tenants"], queryFn: () => fn(), retry: false });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-tenants"] });

  const extend = useMutation({
    mutationFn: (v: { tenant_id: string; days: number }) => extendFn({ data: v }),
    onSuccess: () => { toast.success("Langganan diperpanjang"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const setStatus = useMutation({
    mutationFn: (v: { tenant_id: string; status: any }) => statusFn({ data: v }),
    onSuccess: () => { toast.success("Status diperbarui"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (tenant_id: string) => deleteFn({ data: { tenant_id } }),
    onSuccess: () => { toast.success("Toko dihapus"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

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
                <tr><th className="py-2">Nama Toko</th><th>WA</th><th>Status</th><th>Berakhir</th><th>Daftar</th><th className="text-right">Aksi</th></tr>
              </thead>
              <tbody>
                {tenants.map((t: any) => {
                  const s = t.subscriptions?.[0];
                  const isActive = s?.status === "active";
                  return (
                    <tr key={t.id} className="border-t">
                      <td className="py-2 font-medium">{t.name}</td>
                      <td>{t.phone ?? "-"}</td>
                      <td><Badge variant={isActive ? "default" : s?.status === "trialing" ? "secondary" : "destructive"}>{s?.status ?? "-"}</Badge></td>
                      <td>{s ? new Date(s.current_period_end).toLocaleDateString("id-ID") : "-"}</td>
                      <td>{new Date(t.created_at).toLocaleDateString("id-ID")}</td>
                      <td className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" title="+30 hari" onClick={() => extend.mutate({ tenant_id: t.id, days: 30 })} disabled={extend.isPending}>
                            <Calendar className="h-3.5 w-3.5" />
                          </Button>
                          {isActive ? (
                            <Button size="sm" variant="outline" title="Suspend" onClick={() => setStatus.mutate({ tenant_id: t.id, status: "canceled" })}>
                              <Pause className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" title="Aktifkan" onClick={() => setStatus.mutate({ tenant_id: t.id, status: "active" })}>
                              <Play className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <ManageTenantDialog tenant={t} onSaved={invalidate} />
                          <Button size="sm" variant="destructive" title="Hapus" onClick={() => { if (confirm(`Hapus toko "${t.name}"? Semua data akan hilang.`)) del.mutate(t.id); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
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

function ManageTenantDialog({ tenant, onSaved }: { tenant: any; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: tenant.name ?? "", phone: tenant.phone ?? "", address: tenant.address ?? "" });
  const updateFn = useServerFn(adminUpdateTenant);
  const statsFn = useServerFn(adminGetTenantStats);

  const { data: stats } = useQuery({
    queryKey: ["admin-tenant-stats", tenant.id],
    queryFn: () => statsFn({ data: { tenant_id: tenant.id } }),
    enabled: open,
  });

  const save = useMutation({
    mutationFn: () => updateFn({ data: { tenant_id: tenant.id, ...form } }),
    onSuccess: () => { toast.success("Tersimpan"); onSaved(); setOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" title="Kelola"><Settings className="h-3.5 w-3.5" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Kelola Toko</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/40 p-3 text-center text-sm">
            <div><div className="text-xs text-muted-foreground">Produk</div><div className="font-semibold">{stats?.products ?? "-"}</div></div>
            <div><div className="text-xs text-muted-foreground">Transaksi</div><div className="font-semibold">{stats?.transactions ?? "-"}</div></div>
            <div><div className="text-xs text-muted-foreground">Omzet</div><div className="font-semibold">{stats ? formatRupiah(stats.revenue) : "-"}</div></div>
          </div>
          <div><Label>Nama Toko</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>WhatsApp</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>Alamat</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
