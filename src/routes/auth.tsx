import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Store, ShieldCheck, ShoppingCart, ArrowLeft, KeyRound, UserCircle2, Loader2 } from "lucide-react";
import { listCashiersByCode, cashierSignIn } from "@/lib/cashier-auth.functions";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

type Mode = "pick" | "admin" | "cashier";

function AuthPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>("pick");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.navigate({ to: "/kasir", replace: true });
      else setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") router.navigate({ to: "/kasir", replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Memuat...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-accent to-background px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-lg">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Store className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold">Dagang Pintar</h1>
          <p className="text-sm text-muted-foreground">
            {mode === "pick" ? "Pilih cara masuk" : mode === "admin" ? "Login Pemilik / Admin" : "Login Kasir"}
          </p>
        </div>

        {mode === "pick" && <ModePicker onPick={setMode} />}
        {mode === "admin" && <AdminPanel onBack={() => setMode("pick")} />}
        {mode === "cashier" && <CashierPanel onBack={() => setMode("pick")} onSignedIn={() => router.navigate({ to: "/kasir", replace: true })} />}
      </div>
    </div>
  );
}

function ModePicker({ onPick }: { onPick: (m: Mode) => void }) {
  return (
    <div className="grid gap-3">
      <button
        type="button"
        onClick={() => onPick("cashier")}
        className="group flex items-center gap-4 rounded-xl border-2 border-border bg-background p-4 text-left transition hover:border-primary hover:bg-accent"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ShoppingCart className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <div className="font-semibold">Saya Kasir</div>
          <div className="text-xs text-muted-foreground">Masukkan kode toko + PIN</div>
        </div>
      </button>
      <button
        type="button"
        onClick={() => onPick("admin")}
        className="group flex items-center gap-4 rounded-xl border-2 border-border bg-background p-4 text-left transition hover:border-primary hover:bg-accent"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <div className="font-semibold">Saya Pemilik / Admin</div>
          <div className="text-xs text-muted-foreground">Email & kata sandi</div>
        </div>
      </button>
    </div>
  );
}

function AdminPanel({ onBack }: { onBack: () => void }) {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [shopName, setShopName] = useState("");

  const signIn = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) toast.error(error.message);
    else toast.success("Selamat datang!");
  };

  const signUp = async () => {
    if (!shopName.trim()) { toast.error("Nama toko wajib diisi"); return; }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin, data: { shop_name: shopName.trim() } },
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else toast.success("Akun & toko dibuat.");
  };

  return (
    <div>
      <button onClick={onBack} className="mb-3 inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-1 h-3 w-3" /> Kembali
      </button>
      <Tabs defaultValue="signin" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="signin">Masuk</TabsTrigger>
          <TabsTrigger value="signup">Daftar</TabsTrigger>
        </TabsList>
        <TabsContent value="signin" className="pt-4">
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!loading) signIn(); }}>
            <Field label="Email" value={email} onChange={setEmail} type="email" />
            <Field label="Kata Sandi" value={password} onChange={setPassword} type="password" />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Memproses..." : "Masuk"}
            </Button>
            <ForgotPasswordLink defaultEmail={email} />
          </form>
        </TabsContent>
        <TabsContent value="signup" className="pt-4">
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!loading) signUp(); }}>
            <Field label="Nama Toko" value={shopName} onChange={setShopName} />
            <Field label="Email" value={email} onChange={setEmail} type="email" />
            <Field label="Kata Sandi (min. 6)" value={password} onChange={setPassword} type="password" />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Memproses..." : "Daftar"}
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CashierPanel({ onBack, onSignedIn }: { onBack: () => void; onSignedIn: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [code, setCode] = useState("");
  const [tenant, setTenant] = useState<{ id: string; name: string } | null>(null);
  const [cashiers, setCashiers] = useState<{ id: string; name: string }[]>([]);
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  const listFn = useServerFn(listCashiersByCode);
  const signFn = useServerFn(cashierSignIn);

  const submitCode = async () => {
    const c = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (c.length < 6) { toast.error("Kode minimal 6 karakter"); return; }
    setLoading(true);
    try {
      const res = (await listFn({ data: { code: c } })) as any;
      setTenant(res.tenant);
      setCashiers(res.cashiers || []);
      if (!res.cashiers || res.cashiers.length === 0) {
        toast.error("Belum ada kasir aktif di toko ini.");
      } else {
        setStep(2);
      }
    } catch (e: any) {
      toast.error(e.message || "Kode salah");
    } finally { setLoading(false); }
  };

  const submitPin = async () => {
    if (!picked || !tenant) return;
    if (!/^\d{4,6}$/.test(pin)) { toast.error("PIN harus 4-6 angka"); return; }
    setLoading(true);
    try {
      const res = (await signFn({
        data: { code: code.toUpperCase().replace(/[^A-Z0-9]/g, ""), cashier_id: picked.id, pin },
      })) as any;
      // Establish session in browser
      const { error } = await supabase.auth.setSession({
        access_token: res.access_token,
        refresh_token: res.refresh_token,
      });
      if (error) throw error;
      // Persist active cashier & (if any) active shift
      try {
        localStorage.setItem("dp.active_cashier", JSON.stringify(res.cashier));
        if (res.open_shift) {
          localStorage.setItem("dp.active_shift", JSON.stringify({
            shift_id: res.open_shift.shift_id,
            cashier_id: res.cashier.id,
            cashier_name: res.cashier.name,
            opening_cash: res.open_shift.opening_cash,
            opened_at: res.open_shift.opened_at,
          }));
        } else {
          localStorage.removeItem("dp.active_shift");
        }
      } catch {}
      toast.success(`Halo ${res.cashier.name}!`);
      onSignedIn();
    } catch (e: any) {
      toast.error(e.message || "Gagal masuk");
      setPin("");
    } finally { setLoading(false); }
  };

  return (
    <div>
      <button
        onClick={() => { if (step === 1) onBack(); else setStep((step - 1) as 1 | 2); }}
        className="mb-3 inline-flex items-center text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 h-3 w-3" /> Kembali
      </button>

      {step === 1 && (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!loading) submitCode(); }}>
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-xs">
              <KeyRound className="h-3.5 w-3.5" /> Kode Rahasia Toko
            </Label>
            <Input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              maxLength={12}
              placeholder="Mis. K9F3M2A4"
              className="text-center text-2xl tracking-[0.3em] font-mono uppercase"
            />
            <p className="text-xs text-muted-foreground">
              Minta kode ini ke pemilik toko (ada di menu Pengaturan).
            </p>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Lanjut
          </Button>
        </form>
      )}

      {step === 2 && tenant && (
        <div className="space-y-3">
          <div className="rounded-md bg-muted px-3 py-2 text-center text-xs">
            Toko: <span className="font-semibold">{tenant.name}</span>
          </div>
          <div className="text-xs font-medium">Pilih nama Anda:</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {cashiers.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => { setPicked(c); setPin(""); setStep(3); }}
                className="flex flex-col items-center gap-1 rounded-lg border p-3 text-center transition hover:border-primary hover:bg-accent"
              >
                <UserCircle2 className="h-7 w-7 text-muted-foreground" />
                <span className="line-clamp-2 text-xs font-medium">{c.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 3 && picked && (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!loading) submitPin(); }}>
          <div className="rounded-md bg-muted px-3 py-2 text-center text-xs">
            Masuk sebagai <span className="font-semibold">{picked.name}</span>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">PIN</Label>
            <Input
              autoFocus
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="••••"
              className="text-center text-2xl tracking-[0.5em]"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading || !pin}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Masuk
          </Button>
        </form>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function ForgotPasswordLink({ defaultEmail }: { defaultEmail: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setEmail(defaultEmail); }, [defaultEmail]);

  const send = async () => {
    if (!email.trim()) { toast.error("Masukkan email Anda"); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else { toast.success("Link reset password telah dikirim."); setOpen(false); }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="block w-full text-center text-xs text-primary hover:underline">
        Lupa kata sandi?
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border bg-muted/40 p-3">
      <Label className="text-xs">Email untuk reset password</Label>
      <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@anda.com" />
      <div className="flex gap-2">
        <Button size="sm" onClick={send} disabled={loading} className="flex-1">
          {loading ? "Mengirim..." : "Kirim Link Reset"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Batal</Button>
      </div>
    </div>
  );
}
