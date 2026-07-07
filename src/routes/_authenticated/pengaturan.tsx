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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { User, KeyRound, Store, ArrowLeft, Mail, ShieldQuestion, RefreshCcw, Copy, Check, QrCode, Upload, Trash2, Globe, ExternalLink } from "lucide-react";
import { PrinterSettingsCard } from "@/components/PrinterSettingsCard";
import { Switch } from "@/components/ui/switch";


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

      <ShowcaseCard />

      <StaticQrisCard />

      <PrinterSettingsCard />




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

  const [showDelete, setShowDelete] = useState(false);
  const [delPwd, setDelPwd] = useState("");
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!delPwd) { toast.error("Masukkan password toko"); return; }
    setDeleting(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const email = u.user?.email;
      if (!email) throw new Error("Sesi tidak ditemukan. Hanya pemilik toko yang bisa menghapus.");
      const { error: verifyErr } = await supabase.auth.signInWithPassword({ email, password: delPwd });
      if (verifyErr) throw new Error("Password toko salah");
      await setFn({ data: { payload: null } });
      setPayload(""); setPreview(null);
      toast.success("QRIS statis dihapus");
      setShowDelete(false); setDelPwd("");
    } catch (e: any) { toast.error(e.message); }
    finally { setDeleting(false); }
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
          {payload && <Button variant="outline" onClick={() => setShowDelete(true)}><Trash2 className="mr-1 h-4 w-4" />Hapus</Button>}
          {payload && <Button variant="ghost" onClick={() => {
            try {
              const test = convertStaticToDynamicQris(payload, 1000);
              if (test.length < 30) throw new Error("Hasil terlalu pendek");
              toast.success("QRIS valid — bisa diubah ke dinamis");
            } catch (e: any) { toast.error("Validasi gagal: " + e.message); }
          }}>Tes Validasi</Button>}
        </div>
      </CardContent>

      <AlertDialog open={showDelete} onOpenChange={(o) => { setShowDelete(o); if (!o) setDelPwd(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus QRIS statis?</AlertDialogTitle>
            <AlertDialogDescription>
              Demi keamanan, masukkan password akun toko Anda untuk menghapus QRIS statis tersimpan. QRIS akan tetap tersimpan selama tidak dihapus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label>Password Toko</Label>
            <Input type="password" value={delPwd} autoFocus
              onChange={(e) => setDelPwd(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmDelete(); }}
              placeholder="Password akun pemilik toko" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmDelete(); }} disabled={deleting || !delPwd}>
              {deleting ? "Memverifikasi..." : "Ya, Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function ShowcaseCard() {
  const qc = useQueryClient();
  const getBilling = useServerFn(getMyBilling);
  const updateTenant = useServerFn(updateMyTenant);
  const { data } = useQuery({ queryKey: ["billing"], queryFn: () => getBilling() });
  const tenant = (data as any)?.tenant as { name: string; slug?: string | null; showcase_enabled?: boolean; showcase_description?: string | null } | null;

  const [enabled, setEnabled] = useState(false);
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!tenant) return;
    setEnabled(!!tenant.showcase_enabled);
    setSlug(tenant.slug ?? "");
    setDescription(tenant.showcase_description ?? "");
  }, [tenant?.slug, tenant?.showcase_enabled, tenant?.showcase_description]);

  if (!tenant) return null;

  const url = slug ? `${typeof window !== "undefined" ? window.location.origin : ""}/showcase/${slug}` : "";

  const save = async () => {
    setSaving(true);
    try {
      await updateTenant({ data: {
        name: tenant.name,
        showcase_enabled: enabled,
        slug: slug || null,
        showcase_description: description || null,
      } });
      toast.success("Galeri tersimpan");
      qc.invalidateQueries({ queryKey: ["billing"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally { setSaving(false); }
  };

  const doCopy = async () => {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" />Galeri Toko Publik</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Aktifkan agar pelanggan bisa melihat daftar produk, stok, dan harga per satuan lewat link publik. Harga modal tidak ditampilkan.
        </p>
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <div className="text-sm font-medium">Aktifkan galeri publik</div>
            <div className="text-[11px] text-muted-foreground">Bisa diakses siapa saja tanpa login.</div>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <div>
          <Label>URL Toko (slug)</Label>
          <div className="flex gap-2">
            <div className="flex flex-1 items-center overflow-hidden rounded-md border">
              <span className="border-r bg-muted px-2 py-2 text-xs text-muted-foreground">/showcase/</span>
              <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                placeholder="nama-toko-anda" className="border-0 focus-visible:ring-0" />
            </div>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">Huruf kecil, angka, dan tanda "-" saja.</div>
        </div>
        <div>
          <Label>Deskripsi singkat (opsional)</Label>
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Toko kelontong murah di Jl. Merdeka, buka 07:00–22:00" />
        </div>
        {enabled && url && (
          <div className="rounded-md border bg-primary/5 p-3">
            <div className="text-[11px] text-muted-foreground">Link galeri toko Anda:</div>
            <div className="mt-1 flex items-center gap-2">
              <div className="flex-1 truncate font-mono text-xs">{url}</div>
              <Button variant="outline" size="icon" onClick={doCopy} title="Salin">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
              <a href={url} target="_blank" rel="noreferrer">
                <Button variant="outline" size="icon" title="Buka"><ExternalLink className="h-4 w-4" /></Button>
              </a>
            </div>
          </div>
        )}
        <Button onClick={save} disabled={saving}>{saving ? "Menyimpan..." : "Simpan Galeri"}</Button>
      </CardContent>
    </Card>
  );
}



