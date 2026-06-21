import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  listAllTenants,
  adminExtendSubscription,
  adminSetSubscriptionStatus,
  adminUpdateTenant,
  adminDeleteTenant,
  adminGetTenantStats,
  adminCreateTenant,
  adminRecordPayment,
  adminListCoupons,
  adminCreateCoupon,
  adminToggleCoupon,
  adminDeleteCoupon,
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
import { Settings, Trash2, Calendar, Pause, Play, Plus, Wallet, Ticket, Star, MessageSquare } from "lucide-react";

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

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-tenants"],
    queryFn: () => fn(),
    retry: false,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });
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
  const dayMs = 24 * 60 * 60 * 1000;
  const newToday = tenants.filter((t: any) => Date.now() - new Date(t.created_at).getTime() < dayMs);
  const isNew = (t: any) => Date.now() - new Date(t.created_at).getTime() < dayMs;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Super Admin</h1>
        <CreateTenantDialog onCreated={invalidate} />
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Total Toko" value={tenants.length.toString()} />
        <Stat label="Toko Aktif" value={activeCount.toString()} />
        <Stat label="Daftar (24 jam)" value={newToday.length.toString()} />
        <Stat label="Pemasukan (100 terakhir)" value={formatRupiah(totalPaid)} />
      </div>

      {newToday.length > 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4 text-primary" />
              Pendaftaran Baru (24 jam terakhir)
              <Badge variant="default">{newToday.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {newToday.map((t: any) => (
                <li key={t.id} className="flex items-center justify-between py-2">
                  <div>
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.phone ?? "tanpa WA"} • {new Date(t.created_at).toLocaleString("id-ID")}
                    </div>
                  </div>
                  <Badge variant="secondary">Baru</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

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
                      <td className="py-2 font-medium">
                        <div className="flex items-center gap-2">
                          {t.name}
                          {isNew(t) && <Badge variant="default" className="text-[10px]">Baru</Badge>}
                        </div>
                      </td>
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
                          <RecordPaymentDialog tenant={t} onSaved={invalidate} />
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

      <CouponsCard />

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

      <FeedbackCard />
    </div>
  );
}

function CouponsCard() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListCoupons);
  const createFn = useServerFn(adminCreateCoupon);
  const toggleFn = useServerFn(adminToggleCoupon);
  const delFn = useServerFn(adminDeleteCoupon);
  const { data: coupons } = useQuery({ queryKey: ["admin-coupons"], queryFn: () => listFn(), retry: false });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-coupons"] });

  const [form, setForm] = useState({ code: "", discount_percent: 30, max_uses: "", expires_at: "" });
  const create = useMutation({
    mutationFn: () => createFn({ data: {
      code: form.code,
      discount_percent: form.discount_percent,
      max_uses: form.max_uses ? Number(form.max_uses) : null,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
    }}),
    onSuccess: () => { toast.success("Kupon dibuat"); invalidate(); setForm({ code: "", discount_percent: 30, max_uses: "", expires_at: "" }); },
    onError: (e: any) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => toggleFn({ data: v }),
    onSuccess: invalidate, onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Kupon dihapus"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Ticket className="h-5 w-5" />Kupon Diskon</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-5">
          <div className="sm:col-span-2"><Label className="text-xs">Kode</Label>
            <Input placeholder="PROMO50" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className="uppercase" />
          </div>
          <div><Label className="text-xs">Diskon %</Label>
            <Select value={String(form.discount_percent)} onValueChange={(v) => setForm({ ...form, discount_percent: Number(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10%</SelectItem>
                <SelectItem value="25">25%</SelectItem>
                <SelectItem value="30">30%</SelectItem>
                <SelectItem value="50">50%</SelectItem>
                <SelectItem value="75">75%</SelectItem>
                <SelectItem value="100">100% (Gratis)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Maks. Pakai</Label>
            <Input type="number" placeholder="∞" value={form.max_uses} onChange={(e) => setForm({ ...form, max_uses: e.target.value })} />
          </div>
          <div><Label className="text-xs">Berakhir</Label>
            <Input type="date" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
          </div>
          <div className="sm:col-span-5">
            <Button onClick={() => create.mutate()} disabled={create.isPending || !form.code}><Plus className="mr-1 h-4 w-4" />Buat Kupon</Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr><th className="py-2">Kode</th><th>Diskon</th><th>Pakai</th><th>Berakhir</th><th>Status</th><th className="text-right">Aksi</th></tr>
            </thead>
            <tbody>
              {(coupons ?? []).map((c: any) => (
                <tr key={c.id} className="border-t">
                  <td className="py-2 font-mono font-semibold">{c.code}</td>
                  <td>{c.discount_percent}%</td>
                  <td>{c.used_count}{c.max_uses ? `/${c.max_uses}` : ""}</td>
                  <td>{c.expires_at ? new Date(c.expires_at).toLocaleDateString("id-ID") : "-"}</td>
                  <td><Badge variant={c.active ? "default" : "secondary"}>{c.active ? "Aktif" : "Nonaktif"}</Badge></td>
                  <td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => toggle.mutate({ id: c.id, active: !c.active })}>
                        {c.active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => { if (confirm(`Hapus kupon ${c.code}?`)) del.mutate(c.id); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {(coupons ?? []).length === 0 && (
                <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">Belum ada kupon.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
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

function CreateTenantDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ shop_name: "", email: "", password: "", phone: "", address: "" });
  const fn = useServerFn(adminCreateTenant);
  const mut = useMutation({
    mutationFn: () => fn({ data: form }),
    onSuccess: () => { toast.success("Toko baru dibuat (belum berlangganan)"); onCreated(); setOpen(false); setForm({ shop_name: "", email: "", password: "", phone: "", address: "" }); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-1 h-4 w-4" />Tambah Toko</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Tambah Toko Baru</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label>Nama Toko</Label><Input value={form.shop_name} onChange={(e) => setForm({ ...form, shop_name: e.target.value })} /></div>
          <div><Label>Email Pemilik</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><Label>Password Awal</Label><Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="min. 6 karakter" /></div>
          <div><Label>WhatsApp</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>Alamat</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <p className="text-xs text-muted-foreground">Toko baru harus melakukan pembayaran (atau pakai kode kupon) untuk mengaktifkan langganan.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !form.email || !form.password || !form.shop_name}>
            {mut.isPending ? "Membuat..." : "Buat Toko"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecordPaymentDialog({ tenant, onSaved }: { tenant: any; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ amount: 14900, payment_type: "manual_transfer", extend_days: 30, note: "" });
  const fn = useServerFn(adminRecordPayment);
  const mut = useMutation({
    mutationFn: () => fn({ data: { tenant_id: tenant.id, ...form } }),
    onSuccess: () => { toast.success("Pembayaran tercatat"); onSaved(); setOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" title="Catat Pembayaran"><Wallet className="h-3.5 w-3.5" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Catat Pembayaran — {tenant.name}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Jumlah (Rp)</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></div>
            <div><Label>Perpanjang (hari)</Label><Input type="number" value={form.extend_days} onChange={(e) => setForm({ ...form, extend_days: Number(e.target.value) })} /></div>
          </div>
          <div>
            <Label>Metode</Label>
            <Select value={form.payment_type} onValueChange={(v) => setForm({ ...form, payment_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual_transfer">Transfer Bank</SelectItem>
                <SelectItem value="manual_cash">Tunai</SelectItem>
                <SelectItem value="manual_qris">QRIS Manual</SelectItem>
                <SelectItem value="manual_other">Lainnya</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Catatan (opsional)</Label><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Menyimpan..." : "Catat & Perpanjang"}
          </Button>
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

function FeedbackCard() {
  const qc = useQueryClient();
  const { data: feedback } = useQuery({
    queryKey: ["admin-feedback"],
    queryFn: async () => {
      const { data, error } = await supabase.from("feedback").select("*").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
    retry: false,
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("feedback").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Feedback dihapus"); qc.invalidateQueries({ queryKey: ["admin-feedback"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />Feedback Pengunjung
          <Badge variant="secondary" className="ml-2">{feedback?.length ?? 0}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!feedback || feedback.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada feedback.</p>
        ) : (
          <div className="space-y-3">
            {feedback.map((f: any) => (
              <div key={f.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{f.name}</span>
                      {f.email && <span className="text-xs text-muted-foreground">{f.email}</span>}
                      {f.rating && (
                        <span className="flex items-center gap-0.5">
                          {Array.from({ length: f.rating }).map((_, i) => (
                            <Star key={i} className="h-3 w-3 fill-primary text-primary" />
                          ))}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{f.message}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{new Date(f.created_at).toLocaleString("id-ID")}</p>
                  </div>
                  <Button size="sm" variant="destructive" onClick={() => { if (confirm("Hapus feedback ini?")) del.mutate(f.id); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
