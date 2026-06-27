import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getMyBilling, updateMyTenant, changeMyPassword, getMyStaticQris, setMyStaticQris } from "@/lib/billing.functions";
import { getMyCashierCode, regenerateMyCashierCode } from "@/lib/cashier-auth.functions";
import { convertStaticToDynamicQris } from "@/lib/qris-static";
import jsQR from "jsqr";
import QRCode from "qrcode";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { User, KeyRound, Store, ArrowLeft, Mail, ShieldQuestion, RefreshCcw, Copy, Check, QrCode, Upload, Trash2 } from "lucide-react";


export const Route = createFileRoute("/_authenticated/pengaturan")({
  component: PengaturanPage,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6 text-sm">Tidak ditemukan</div>,
});

function PengaturanPage() {
  const qc = useQueryClient();
  const getBilling = useServerFn(getMyBilling);
  const updateTenant = useServerFn(updateMyTenant);
  const changePass = useServerFn(changeMyPassword);

  const { data } = useQuery({ queryKey: ["billing"], queryFn: () => getBilling() });
  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState({ name: "", phone: "", address: "" });
  const [pwd, setPwd] = useState({ current: "", next: "", confirm: "" });
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  useEffect(() => {
    if (data?.tenant) setProfile({
      name: data.tenant.name ?? "",
      phone: data.tenant.phone ?? "",
      address: data.tenant.address ?? "",
    });
  }, [data?.tenant]);

  const saveProfile = useMutation({
    mutationFn: () => updateTenant({ data: profile }),
    onSuccess: () => { toast.success("Profil toko tersimpan"); qc.invalidateQueries({ queryKey: ["billing"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const changePwd = useMutation({
    mutationFn: async () => {
      if (pwd.next.length < 6) throw new Error("Password baru minimal 6 karakter");
      if (pwd.next !== pwd.confirm) throw new Error("Konfirmasi password tidak cocok");
      // Verify current password by re-signing in
      const { error: verifyErr } = await supabase.auth.signInWithPassword({ email, password: pwd.current });
      if (verifyErr) throw new Error("Password saat ini salah");
      return changePass({ data: { new_password: pwd.next } });
    },
    onSuccess: () => { toast.success("Password berhasil diubah"); setPwd({ current: "", next: "", confirm: "" }); },
    onError: (e: any) => toast.error(e.message),
  });

  const sendResetEmail = async () => {
    if (!email) return;
    setResetting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetting(false);
    if (error) toast.error(error.message);
    else toast.success("Link reset password dikirim ke email Anda");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pengaturan Akun</h1>
        <Link to="/kasir"><Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-4 w-4" />Kembali</Button></Link>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><User className="h-5 w-5" />Akun</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Mail className="h-4 w-4 text-muted-foreground" /> <span className="font-medium">{email || "..."}</span>
          </div>
        </CardContent>
      </Card>

      {data?.tenant && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Store className="h-5 w-5" />Profil Toko</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Nama Toko</Label><Input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></div>
            <div><Label>No. WhatsApp</Label><Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></div>
            <div><Label>Alamat</Label><Input value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} /></div>
            <Button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending}>Simpan Profil</Button>
          </CardContent>
        </Card>
      )}

      <CashierCodeCard />

      <StaticQrisCard />



      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" />Ubah Password</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Password Saat Ini</Label><Input type="password" value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} /></div>
          <div><Label>Password Baru</Label><Input type="password" value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} /></div>
          <div><Label>Konfirmasi Password Baru</Label><Input type="password" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} /></div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => changePwd.mutate()} disabled={changePwd.isPending}>
              {changePwd.isPending ? "Menyimpan..." : "Ubah Password"}
            </Button>
            <Button variant="outline" onClick={sendResetEmail} disabled={resetting || !email}>
              {resetting ? "Mengirim..." : "Lupa password? Kirim link reset"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CashierCodeCard() {
  const getCode = useServerFn(getMyCashierCode);
  const regen = useServerFn(regenerateMyCashierCode);
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = (await getCode()) as any;
      setCode(res.code);
    } catch (e: any) {
      setCode(null);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const doCopy = async () => {
    if (!code) return;
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  const doRegen = async () => {
    if (!confirm("Ganti kode? Semua kasir wajib memakai kode baru saat login berikutnya.")) return;
    try {
      const res = (await regen()) as any;
      setCode(res.code);
      toast.success("Kode kasir diperbarui");
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldQuestion className="h-5 w-5" />Kode Login Kasir</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Berikan kode ini hanya kepada kasir Anda. Mereka memakainya untuk login mandiri di halaman login (pilih "Saya Kasir") tanpa perlu akun pemilik.
        </p>
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-md border bg-muted px-4 py-3 text-center text-2xl font-mono font-bold tracking-[0.3em]">
            {loading ? "..." : (code ?? "—")}
          </div>
          <Button variant="outline" size="icon" onClick={doCopy} disabled={!code} title="Salin">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="icon" onClick={doRegen} title="Ganti kode">
            <RefreshCcw className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StaticQrisCard() {
  const getFn = useServerFn(getMyStaticQris);
  const setFn = useServerFn(setMyStaticQris);
  const [payload, setPayload] = useState<string>("");
  const [preview, setPreview] = useState<string | null>(null);
  const [decoding, setDecoding] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = (await getFn()) as { payload: string | null };
        setPayload(r.payload ?? "");
        if (r.payload) {
          const url = await QRCode.toDataURL(r.payload, { width: 220, margin: 1 });
          setPreview(url);
        }
      } catch {}
    })();
  }, []);

  const decodeFromFile = async (file: File) => {
    setDecoding(true);
    try {
      const bmp = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = bmp.width; canvas.height = bmp.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bmp, 0, 0);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(img.data, img.width, img.height);
      if (!code?.data) throw new Error("QR tidak terbaca. Coba gambar yang lebih jelas / cropped.");
      const data = code.data.trim();
      if (!/^00\d{2}01/.test(data)) throw new Error("Bukan format QRIS yang dikenali.");
      setPayload(data);
      const url = await QRCode.toDataURL(data, { width: 220, margin: 1 });
      setPreview(url);
      toast.success("QRIS berhasil dibaca dari gambar");
    } catch (e: any) {
      toast.error(e.message || "Gagal membaca QR");
    } finally { setDecoding(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      await setFn({ data: { payload: payload || null } });
      toast.success("QRIS statis tersimpan");
      if (payload) {
        const url = await QRCode.toDataURL(payload, { width: 220, margin: 1 });
        setPreview(url);
      }
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const clear = async () => {
    if (!confirm("Hapus QRIS statis tersimpan?")) return;
    setPayload(""); setPreview(null);
    try { await setFn({ data: { payload: null } }); toast.success("QRIS statis dihapus"); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><QrCode className="h-5 w-5" />QRIS Statis Toko</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Upload QRIS statis milik toko (GoPay Merchant, OVO Merchant, BCA, Mandiri, dll). Saat kasir menerima pembayaran QRIS, sistem otomatis mengubahnya menjadi QRIS Dinamis dengan nominal sesuai transaksi — pelanggan tinggal scan & bayar persis. Konfirmasi pembayaran tetap manual (tidak ada notifikasi otomatis seperti Midtrans).
        </p>
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex-1 min-w-[260px] space-y-2">
            <Label className="flex items-center gap-1 text-xs"><Upload className="h-3 w-3" />Upload gambar QRIS</Label>
            <Input type="file" accept="image/*" disabled={decoding} onChange={(e) => {
              const f = e.target.files?.[0]; if (f) decodeFromFile(f); e.target.value = "";
            }} />
            <Label className="text-xs">Atau tempel kode QRIS (dimulai 0002…)</Label>
            <Textarea rows={3} value={payload} onChange={(e) => setPayload(e.target.value)} placeholder="00020101021126..." className="font-mono text-xs" />
          </div>
          {preview && (
            <div className="rounded-md border bg-white p-2">
              <img src={preview} alt="QRIS Tersimpan" className="h-40 w-40 object-contain" />
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={saving || !payload}>Simpan QRIS</Button>
          {payload && <Button variant="outline" onClick={clear}><Trash2 className="mr-1 h-4 w-4" />Hapus</Button>}
          {payload && <Button variant="ghost" onClick={() => {
            try {
              const test = convertStaticToDynamicQris(payload, 1000);
              if (test.length < 30) throw new Error("Hasil terlalu pendek");
              toast.success("QRIS valid — bisa diubah ke dinamis");
            } catch (e: any) { toast.error("Validasi gagal: " + e.message); }
          }}>Tes Validasi</Button>}
        </div>
      </CardContent>
    </Card>
  );
}


