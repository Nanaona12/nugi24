import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Supabase exchanges the recovery code in the URL hash and emits PASSWORD_RECOVERY.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    // Also check if there is already a session (link already exchanged).
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async () => {
    if (password.length < 6) { toast.error("Password minimal 6 karakter"); return; }
    if (password !== confirm) { toast.error("Konfirmasi password tidak cocok"); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Password berhasil diubah");
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-accent to-background px-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-lg">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <KeyRound className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold">Reset Kata Sandi</h1>
          <p className="text-sm text-muted-foreground">Masukkan kata sandi baru Anda</p>
        </div>

        {!ready ? (
          <p className="text-center text-sm text-muted-foreground">
            Memverifikasi link reset... Jika halaman ini tidak berubah, buka link reset dari email Anda kembali.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Kata Sandi Baru</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Konfirmasi Kata Sandi</Label>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <Button className="w-full" onClick={submit} disabled={loading}>
              {loading ? "Menyimpan..." : "Simpan Kata Sandi Baru"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
