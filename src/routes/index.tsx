import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatRupiah } from "@/lib/format";
import {
  ShoppingCart, Package, BarChart3, Receipt, Smartphone, ShieldCheck,
  CheckCircle2, Star, MessageSquare, ArrowRight, Zap,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nugi24 — Aplikasi Kasir Online untuk UMKM Indonesia" },
      { name: "description", content: "Kelola toko Anda dengan mudah: kasir, stok, laporan keuntungan, dan struk WhatsApp. Mulai hanya Rp14.900/bulan." },
      { property: "og:title", content: "Nugi24 — Aplikasi Kasir Online untuk UMKM" },
      { property: "og:description", content: "Aplikasi kasir lengkap untuk UMKM: stok, transaksi, laporan, dan struk WhatsApp." },
    ],
  }),
  component: LandingPage,
});

const feedbackSchema = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi").max(100),
  email: z.string().trim().email("Email tidak valid").max(255).optional().or(z.literal("")),
  message: z.string().trim().min(5, "Pesan minimal 5 karakter").max(2000),
  rating: z.number().min(1).max(5).nullable(),
});

function LandingPage() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header signedIn={signedIn} />
      <Hero signedIn={signedIn} />
      <Features />
      <Pricing signedIn={signedIn} />
      <FeedbackSection />
      <Footer />
    </div>
  );
}

function Header({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground font-bold">N</div>
          <span className="text-lg font-bold">Nugi24</span>
        </div>
        <nav className="hidden gap-6 text-sm md:flex">
          <a href="#fitur" className="text-muted-foreground hover:text-foreground">Fitur</a>
          <a href="#harga" className="text-muted-foreground hover:text-foreground">Harga</a>
          <a href="#feedback" className="text-muted-foreground hover:text-foreground">Feedback</a>
        </nav>
        <div className="flex gap-2">
          {signedIn ? (
            <Link to="/kasir"><Button size="sm">Buka Aplikasi</Button></Link>
          ) : (
            <>
              <Link to="/auth"><Button size="sm" variant="ghost">Masuk</Button></Link>
              <Link to="/auth"><Button size="sm">Daftar</Button></Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/30" aria-hidden />
      <div className="relative mx-auto max-w-6xl px-4 py-20 text-center md:py-28">
        <Badge variant="secondary" className="mb-4"><Zap className="mr-1 h-3 w-3" /> Kasir Online untuk UMKM</Badge>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
          Kelola Toko Anda <span className="text-primary">Lebih Mudah</span> & Cepat
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground md:text-lg">
          Aplikasi kasir, manajemen stok, dan laporan keuntungan dalam satu tempat.
          Cocok untuk warung, toko kelontong, kuliner, dan UMKM lainnya.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {signedIn ? (
            <Link to="/kasir"><Button size="lg">Buka Aplikasi <ArrowRight className="ml-2 h-4 w-4" /></Button></Link>
          ) : (
            <>
              <Link to="/auth"><Button size="lg">Mulai Sekarang <ArrowRight className="ml-2 h-4 w-4" /></Button></Link>
              <a href="#fitur"><Button size="lg" variant="outline">Lihat Fitur</Button></a>
            </>
          )}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Hanya {formatRupiah(14900)}/bulan • Tersedia kode kupon diskon hingga 100%
        </p>
      </div>
    </section>
  );
}

const FEATURES = [
  { icon: ShoppingCart, title: "Kasir Cepat", desc: "Scan barcode, hitung kembalian, simpan transaksi dalam hitungan detik." },
  { icon: Package, title: "Manajemen Stok", desc: "Pantau stok masuk-keluar, harga grosir & eceran, dan kode produk otomatis." },
  { icon: BarChart3, title: "Laporan Keuntungan", desc: "Lihat omzet, laba, dan produk terlaris setiap hari, minggu, atau bulan." },
  { icon: Receipt, title: "Struk WhatsApp", desc: "Kirim struk pembelian otomatis ke pelanggan via WhatsApp." },
  { icon: Smartphone, title: "Akses di HP & Laptop", desc: "Web-based, jalan di Android, iOS, dan komputer manapun." },
  { icon: ShieldCheck, title: "Aman & Cloud", desc: "Data tersimpan aman di cloud, otomatis backup tiap saat." },
];

function Features() {
  return (
    <section id="fitur" className="mx-auto max-w-6xl px-4 py-20">
      <div className="text-center">
        <h2 className="text-3xl font-bold md:text-4xl">Semua yang Toko Anda Butuhkan</h2>
        <p className="mt-3 text-muted-foreground">Fitur lengkap dengan harga terjangkau untuk UMKM.</p>
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <Card key={f.title} className="border-border/60 transition hover:border-primary/40 hover:shadow-md">
            <CardContent className="pt-6">
              <div className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function Pricing({ signedIn }: { signedIn: boolean }) {
  const benefits = [
    "Transaksi & produk tanpa batas",
    "Laporan keuntungan otomatis",
    "Struk WhatsApp ke pelanggan",
    "Backup cloud otomatis",
    "Dukungan via WhatsApp",
  ];
  return (
    <section id="harga" className="border-y bg-muted/30 py-20">
      <div className="mx-auto max-w-3xl px-4 text-center">
        <h2 className="text-3xl font-bold md:text-4xl">Harga Sederhana, Fitur Lengkap</h2>
        <p className="mt-3 text-muted-foreground">Satu paket untuk semua kebutuhan toko Anda.</p>
        <Card className="mx-auto mt-8 max-w-sm border-primary/50 shadow-lg">
          <CardContent className="pt-8">
            <Badge className="mb-2">Paket Basic</Badge>
            <div className="text-5xl font-bold">{formatRupiah(14900)}</div>
            <div className="text-sm text-muted-foreground">per bulan</div>
            <ul className="mt-6 space-y-2 text-left text-sm">
              {benefits.map((b) => (
                <li key={b} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> {b}
                </li>
              ))}
            </ul>
            <Link to={signedIn ? "/langganan" : "/auth"}>
              <Button className="mt-6 w-full" size="lg">
                {signedIn ? "Aktifkan Sekarang" : "Daftar & Mulai"}
              </Button>
            </Link>
            <p className="mt-3 text-xs text-muted-foreground">Punya kode kupon? Bisa diskon hingga 100%.</p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function FeedbackSection() {
  const [form, setForm] = useState({ name: "", email: "", message: "", rating: 0 });
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const parsed = feedbackSchema.safeParse({
      name: form.name,
      email: form.email,
      message: form.message,
      rating: form.rating > 0 ? form.rating : null,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("feedback").insert({
      name: parsed.data.name,
      email: parsed.data.email || null,
      message: parsed.data.message,
      rating: parsed.data.rating,
    });
    setSubmitting(false);
    if (error) { toast.error("Gagal mengirim: " + error.message); return; }
    toast.success("Terima kasih atas masukannya!");
    setForm({ name: "", email: "", message: "", rating: 0 });
  };

  return (
    <section id="feedback" className="mx-auto max-w-2xl px-4 py-20">
      <div className="text-center">
        <Badge variant="secondary" className="mb-3"><MessageSquare className="mr-1 h-3 w-3" />Masukan Anda</Badge>
        <h2 className="text-3xl font-bold md:text-4xl">Bantu Kami Berkembang</h2>
        <p className="mt-3 text-muted-foreground">
          Punya saran, kritik, atau permintaan fitur? Kami sangat menghargai masukan Anda.
        </p>
      </div>
      <Card className="mt-8">
        <CardContent className="pt-6 space-y-4">
          <div>
            <Label>Nama *</Label>
            <Input value={form.name} maxLength={100} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nama Anda" />
          </div>
          <div>
            <Label>Email (opsional)</Label>
            <Input type="email" value={form.email} maxLength={255} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@contoh.com" />
          </div>
          <div>
            <Label>Rating</Label>
            <div className="mt-1 flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setForm({ ...form, rating: n === form.rating ? 0 : n })}
                  className="rounded p-1 transition hover:scale-110"
                  aria-label={`Rating ${n}`}
                >
                  <Star className={`h-6 w-6 ${n <= form.rating ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Pesan *</Label>
            <Textarea
              value={form.message}
              maxLength={2000}
              rows={4}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder="Tulis saran, kritik, atau fitur yang Anda inginkan..."
            />
            <p className="mt-1 text-xs text-muted-foreground">{form.message.length}/2000</p>
          </div>
          <Button onClick={submit} disabled={submitting} className="w-full">
            {submitting ? "Mengirim..." : "Kirim Feedback"}
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Nugi24. Aplikasi kasir untuk UMKM Indonesia.
      </div>
    </footer>
  );
}
