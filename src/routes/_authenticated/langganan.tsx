import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getMyBilling, createMidtransPayment, updateMyTenant, listPlanAudit } from "@/lib/billing.functions";
import { PLANS, priceFor, yearlySavingPct, qrisQuotaFor, type PlanId, type BillingPeriod } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatRupiah } from "@/lib/format";
import { CreditCard, Store, ShieldCheck, ArrowLeft, Check, Sparkles, Zap } from "lucide-react";

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
  const [couponCode, setCouponCode] = useState("");
  const [period, setPeriod] = useState<BillingPeriod>("yearly");
  const [selectedPlan, setSelectedPlan] = useState<PlanId>("warung");

  useEffect(() => {
    if (data?.tenant) setTenantForm({
      name: data.tenant.name ?? "",
      phone: data.tenant.phone ?? "",
      address: data.tenant.address ?? "",
    });
    if (data?.subscription?.plan === "grosir") setSelectedPlan("grosir");
  }, [data?.tenant, data?.subscription?.plan]);

  // Scroll to plan selector when arriving with #pilih-paket (or via banner)
  useEffect(() => {
    if (isLoading) return;
    if (typeof window === "undefined") return;
    if (window.location.hash === "#pilih-paket") {
      setTimeout(() => {
        document.getElementById("pilih-paket")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [isLoading]);

  useEffect(() => {
    if (!data?.midtransClientKey) return;
    const isProd = data.midtransIsProduction;
    const src = isProd ? "https://app.midtrans.com/snap/snap.js" : "https://app.sandbox.midtrans.com/snap/snap.js";
    if (document.querySelector(`script[src="${src}"]`)) { setSnapReady(true); return; }
    const s = document.createElement("script");
    s.src = src;
    s.setAttribute("data-client-key", data.midtransClientKey);
    s.onload = () => setSnapReady(true);
    document.body.appendChild(s);
  }, [data?.midtransClientKey, data?.midtransIsProduction]);

  const payMut = useMutation({
    mutationFn: async (vars: { plan: PlanId }) =>
      createPay({ data: { coupon_code: couponCode.trim() || undefined, plan: vars.plan, period } }),
    onSuccess: (res: any) => {
      const refresh = () => {
        qc.invalidateQueries({ queryKey: ["billing"] });
        qc.invalidateQueries({ queryKey: ["plan-audit"] });
        if (typeof window !== "undefined") window.dispatchEvent(new Event("billing:refresh"));
      };
      if (res.free) {
        toast.success("Aktivasi berhasil dengan kupon 100%!");
        setCouponCode("");
        refresh();
        return;
      }
      if (window.snap && snapReady && res.token) {
        window.snap.pay(res.token, {
          onSuccess: () => { toast.success("Pembayaran sukses!"); refresh(); },
          onPending: () => { toast.info("Menunggu pembayaran..."); refresh(); },
          onError: () => toast.error("Pembayaran gagal"),
          onClose: () => refresh(),
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

  const currentPlan = (data?.subscription?.plan as PlanId | undefined) ?? "warung";

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Memuat...</div>;
  if (!data?.tenant) return <div className="p-6 text-sm">Toko belum dibuat.</div>;

  const sub = data.subscription;
  const expired = sub && new Date(sub.current_period_end) < new Date();
  const daysLeft = sub ? Math.max(0, Math.ceil((new Date(sub.current_period_end).getTime() - Date.now()) / 86400000)) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Langganan</h1>
        <Link to="/keuntungan"><Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-4 w-4" />Kembali</Button></Link>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Status Berlangganan</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={sub?.status === "active" ? "default" : sub?.status === "trialing" ? "secondary" : "destructive"}>
              {sub?.status?.toUpperCase()}
            </Badge>
            <Badge variant="outline" className="capitalize">Paket: {currentPlan}</Badge>
            <span className="text-sm text-muted-foreground">
              Berakhir: {sub ? new Date(sub.current_period_end).toLocaleString("id-ID") : "-"}
              {!expired && ` (${daysLeft} hari lagi)`}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Plan selector */}
      <div id="pilih-paket" className="scroll-mt-20 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Pilih Paket</h2>
            <p className="text-xs text-muted-foreground">Hemat hingga {yearlySavingPct("grosir")}% jika bayar tahunan.</p>
          </div>
          <div className="inline-flex items-center rounded-full border bg-muted/50 p-1 text-xs font-medium">
            <button
              onClick={() => setPeriod("monthly")}
              className={`rounded-full px-3 py-1.5 transition ${period === "monthly" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >Bulanan</button>
            <button
              onClick={() => setPeriod("yearly")}
              className={`flex items-center gap-1 rounded-full px-3 py-1.5 transition ${period === "yearly" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              Tahunan
              <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">Hemat 2 bulan</span>
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(Object.values(PLANS)).map((p) => {
            const effectivePeriod: BillingPeriod = p.monthlyOnly ? "monthly" : period;
            const price = priceFor(p.id, effectivePeriod);
            const isCurrent = currentPlan === p.id;
            const isSelected = selectedPlan === p.id;
            return (
              <Card
                key={p.id}
                className={`relative overflow-hidden p-5 transition ${
                  p.highlight ? "border-primary/60 bg-primary/[0.03]" : ""
                } ${isSelected ? "ring-2 ring-primary" : ""}`}
              >
                {p.highlight && (
                  <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                    <Sparkles className="h-3 w-3" /> Populer
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                  {p.id === "grosir" ? <Zap className="h-4 w-4 text-primary" /> : <Store className="h-4 w-4" />}
                  {isCurrent && <Badge variant="secondary" className="text-[10px]">Paket Aktif</Badge>}
                </div>
                <h3 className="mt-1 text-xl font-bold">{p.name}</h3>
                <p className="text-xs text-muted-foreground">{p.tagline}</p>

                <div className="mt-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold tracking-tight">{formatRupiah(price)}</span>
                    <span className="text-sm text-muted-foreground">/ {effectivePeriod === "yearly" ? "tahun" : "bulan"}</span>
                  </div>
                  {p.monthlyOnly && (
                    <div className="mt-1 text-xs text-muted-foreground">Hanya tersedia bulanan</div>
                  )}
                  {!p.monthlyOnly && effectivePeriod === "yearly" && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      ≈ {formatRupiah(Math.round(price / 12))} / bulan
                      <span className="ml-2 rounded bg-emerald-500/15 px-1.5 py-0.5 font-semibold text-emerald-600">
                        Hemat {formatRupiah(p.monthly * 12 - p.yearly)}
                      </span>
                    </div>
                  )}
                </div>


                <ul className="mt-4 space-y-1.5 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className={`mt-0.5 h-4 w-4 flex-shrink-0 ${p.highlight ? "text-primary" : "text-emerald-600"}`} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {p.unlocks && p.unlocks.length > 0 && (
                  <div className="mt-4 rounded-md border bg-background/60 p-3">
                    <div className="mb-1 text-[11px] font-semibold uppercase text-primary">Khusus Paket Grosiran</div>
                    <div className="flex flex-wrap gap-1.5">
                      {p.unlocks.map((u) => (
                        <span key={u} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{u}</span>
                      ))}
                    </div>
                  </div>
                )}

                <Button
                  className="mt-5 w-full"
                  variant={p.highlight ? "default" : "outline"}
                  onClick={() => { setSelectedPlan(p.id); payMut.mutate({ plan: p.id }); }}
                  disabled={payMut.isPending}
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  {payMut.isPending && selectedPlan === p.id
                    ? "Memproses..."
                    : isCurrent && !expired
                      ? `Perpanjang ${effectivePeriod === "yearly" ? "1 Tahun" : "30 Hari"}`
                      : `Pilih ${p.name}`}
                </Button>
                {!snapReady && (
                  <p className="mt-2 text-center text-[11px] text-muted-foreground">Memuat sistem pembayaran...</p>
                )}
              </Card>
            );
          })}
        </div>

        <Card className="p-4">
          <Label className="text-xs">Kode Kupon (opsional)</Label>
          <Input
            placeholder="Contoh: PROMO50"
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
            className="mt-1 uppercase"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">Kupon berlaku untuk paket apa pun pada periode yang dipilih.</p>
        </Card>
      </div>

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
            <div className="overflow-x-auto">
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
            </div>
          )}
        </CardContent>
      </Card>

      <PlanAuditCard />

      {data.isSuperAdmin && (
        <div><Link to="/admin"><Button variant="outline">Buka Panel Super Admin</Button></Link></div>
      )}
    </div>
  );
}

function PlanAuditCard() {
  const listAudit = useServerFn(listPlanAudit);
  const { data, isLoading } = useQuery({
    queryKey: ["plan-audit", "self"],
    queryFn: () => listAudit({ data: {} }),
  });
  return (
    <Card>
      <CardHeader><CardTitle>Riwayat Perubahan Paket</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Memuat...</p>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada perubahan paket.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr><th className="py-2">Tanggal</th><th>Dari</th><th>Ke</th><th>Sumber</th><th>Oleh</th><th>Catatan</th></tr>
              </thead>
              <tbody>
                {data.map((r: any) => (
                  <tr key={r.id} className="border-t">
                    <td className="py-2">{new Date(r.created_at).toLocaleString("id-ID")}</td>
                    <td className="capitalize">{r.old_plan ?? "-"}</td>
                    <td className="capitalize font-medium">{r.new_plan}</td>
                    <td><Badge variant={r.source === "midtrans" ? "default" : "secondary"} className="text-[10px] uppercase">{r.source}</Badge></td>
                    <td className="text-xs text-muted-foreground">{r.changed_by_email ?? "-"}</td>
                    <td className="text-xs">{r.note ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
