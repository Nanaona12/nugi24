import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getMyBilling, createMidtransPayment, updateMyTenant } from "@/lib/billing.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatRupiah } from "@/lib/format";
import { CreditCard, Store, ShieldCheck, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/langganan")({
  component: LanggananPage,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6 text-sm">Tidak ditemukan</div>,
});

declare global {
  interface Window {
    snap?: { pay: (token: string, opts?: any) => void };
  }
}

function LanggananPage() {
  const qc = useQueryClient();
  const getBilling = useServerFn(getMyBilling);
  const createPay = useServerFn(createMidtransPayment);
  const updateTenant = useServerFn(updateMyTenant);

  const { data, isLoading } = useQuery({ queryKey: ["billing"], queryFn: () => getBilling() });
  const [snapReady, setSnapReady] = useState(false);
  const [tenantForm, setTenantForm] = useState({ name: "", phone: "", address: "" });

  useEffect(() => {
    if (data?.tenant) setTenantForm({
      name: data.tenant.name ?? "",
      phone: data.tenant.phone ?? "",
      address: data.tenant.address ?? "",
    });
  }, [data?.tenant]);

  // Load Midtrans Snap script
  useEffect(() => {
    const clientKey = import.meta.env.VITE_MIDTRANS_CLIENT_KEY;
    const isProd = clientKey && !String(clientKey).startsWith("SB-Mid-client-");
    const src = isProd
      ? "https://app.midtrans.com/snap/snap.js"
      : "https://app.sandbox.midtrans.com/snap/snap.js";
    if (document.querySelector(`script[src="${src}"]`)) { setSnapReady(true); return; }
    const s = document.createElement("script");
    s.src = src;
    s.setAttribute("data-client-key", clientKey ?? "");
    s.onload = () => setSnapReady(true);
    document.body.appendChild(s);
  }, []);

  const payMut = useMutation({
    mutationFn: async () => createPay(),
    onSuccess: (res) => {
      if (window.snap && snapReady) {
        window.snap.pay(res.token, {
          onSuccess: () => { toast.success("Pembayaran sukses!"); qc.invalidateQueries({ queryKey: ["billing"] }); },
          onPending: () => { toast.info("Menunggu pembayaran..."); qc.invalidateQueries({ queryKey: ["billing"] }); },
          onError: () => toast.error("Pembayaran gagal"),
          onClose: () => qc.invalidateQueries({ queryKey: ["billing"] }),
        });
      } else if (res.redirect_url) {
        window.open(res.redirect_url, "_blank");
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveTenantMut = useMutation({
    mutationFn: async () => updateTenant({ data: tenantForm }),
    onSuccess: () => { toast.success("Profil toko disimpan"); qc.invalidateQueries({ queryKey: ["billing"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Memuat...</div>;
  if (!data?.tenant) return <div className="p-6 text-sm">Toko belum dibuat.</div>;

  const sub = data.subscription;
  const expired = sub && new Date(sub.current_period_end) < new Date();
  const daysLeft = sub ? Math.max(0, Math.ceil((new Date(sub.current_period_end).getTime() - Date.now()) / 86400000)) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Langganan</h1>
        <Link to="/kasir"><Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-4 w-4" />Kembali</Button></Link>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Status</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={sub?.status === "active" ? "default" : sub?.status === "trialing" ? "secondary" : "destructive"}>
              {sub?.status?.toUpperCase()}
            </Badge>
            <span className="text-sm text-muted-foreground">
              Berakhir: {sub ? new Date(sub.current_period_end).toLocaleString("id-ID") : "-"}
              {!expired && ` (${daysLeft} hari lagi)`}
            </span>
          </div>
          <div className="rounded-lg border bg-accent/30 p-4">
            <div className="text-sm text-muted-foreground">Paket Basic</div>
            <div className="text-3xl font-bold">{formatRupiah(14900)}<span className="text-base font-normal text-muted-foreground"> / bulan</span></div>
            <Button className="mt-3" onClick={() => payMut.mutate()} disabled={payMut.isPending || !snapReady}>
              <CreditCard className="mr-2 h-4 w-4" />
              {payMut.isPending ? "Memproses..." : expired ? "Bayar Sekarang" : "Perpanjang 30 Hari"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Store className="h-5 w-5" />Profil Toko</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Nama Toko</Label><Input value={tenantForm.name} onChange={(e) => setTenantForm({ ...tenantForm, name: e.target.value })} /></div>
          <div><Label>No. WhatsApp</Label><Input value={tenantForm.phone} onChange={(e) => setTenantForm({ ...tenantForm, phone: e.target.value })} /></div>
          <div><Label>Alamat</Label><Input value={tenantForm.address} onChange={(e) => setTenantForm({ ...tenantForm, address: e.target.value })} /></div>
          <Button onClick={() => saveTenantMut.mutate()} disabled={saveTenantMut.isPending}>Simpan</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Riwayat Pembayaran</CardTitle></CardHeader>
        <CardContent>
          {data.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada pembayaran.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr><th className="py-2">Tanggal</th><th>Order ID</th><th>Metode</th><th className="text-right">Jumlah</th><th>Status</th></tr>
              </thead>
              <tbody>
                {data.payments.map((p: any) => (
                  <tr key={p.id} className="border-t">
                    <td className="py-2">{new Date(p.created_at).toLocaleString("id-ID")}</td>
                    <td className="font-mono text-xs">{p.midtrans_order_id}</td>
                    <td>{p.payment_type ?? "-"}</td>
                    <td className="text-right">{formatRupiah(p.amount)}</td>
                    <td><Badge variant={p.status === "paid" ? "default" : p.status === "pending" ? "secondary" : "destructive"}>{p.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {data.isSuperAdmin && (
        <div><Link to="/admin"><Button variant="outline">Buka Panel Super Admin</Button></Link></div>
      )}
    </div>
  );
}
