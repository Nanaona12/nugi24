import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Store } from "lucide-react";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [shopName, setShopName] = useState("");
  const [ready, setReady] = useState(false);

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
      options: {
        emailRedirectTo: window.location.origin,
        data: { shop_name: shopName.trim() },
      },
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else toast.success("Akun & toko dibuat. Anda dapat 7 hari trial gratis!");
  };

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Memuat...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-accent to-background px-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-lg">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Store className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold">Dagang Pintar</h1>
          <p className="text-sm text-muted-foreground">Manajemen usaha Anda</p>
        </div>

        <Tabs defaultValue="signin" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Masuk</TabsTrigger>
            <TabsTrigger value="signup">Daftar</TabsTrigger>
          </TabsList>
          <TabsContent value="signin" className="space-y-4 pt-4">
            <Field label="Email" value={email} onChange={setEmail} type="email" />
            <Field label="Kata Sandi" value={password} onChange={setPassword} type="password" />
            <Button className="w-full" onClick={signIn} disabled={loading}>
              {loading ? "Memproses..." : "Masuk"}
            </Button>
            <ForgotPasswordLink defaultEmail={email} />
          </TabsContent>
          <TabsContent value="signup" className="space-y-4 pt-4">
            <Field label="Nama Toko" value={shopName} onChange={setShopName} />
            <Field label="Email" value={email} onChange={setEmail} type="email" />
            <Field label="Kata Sandi (min. 6)" value={password} onChange={setPassword} type="password" />
            <Button className="w-full" onClick={signUp} disabled={loading}>
              {loading ? "Memproses..." : "Daftar — 7 Hari Gratis"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Setelah trial: Rp 14.900/bulan
            </p>
          </TabsContent>
        </Tabs>
      </div>
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
    else { toast.success("Link reset password telah dikirim. Cek email Anda."); setOpen(false); }
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
