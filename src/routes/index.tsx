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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "sonner";
import { formatRupiah } from "@/lib/format";
import { PLANS, yearlySavingPct, type PlanDef } from "@/lib/plans";
import {
  ShoppingCart, Package, BarChart3, Receipt, Smartphone, ShieldCheck,
  CheckCircle2, Star, MessageSquare, ArrowRight, Zap, TrendingUp, Users, Store, Sparkles, Clock, Wifi,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dagang Pintar — Aplikasi Kasir Online untuk UMKM Indonesia" },
      { name: "description", content: "Kelola toko Anda dengan mudah: kasir, stok, laporan keuntungan, dan struk WhatsApp. Mulai hanya Rp14.900/bulan." },
      { property: "og:title", content: "Dagang Pintar — Aplikasi Kasir Online untuk UMKM" },
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
      <Stats />
      <Features />
      <HowItWorks />
      <Testimonials />
      <Pricing signedIn={signedIn} />
      <FAQ />
      <CTA signedIn={signedIn} />
      <FeedbackSection />
      <Footer />
    </div>
  );
}

function Header({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/70 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 animate-fade-in">
          <div className="grid h-8 w-8 place-items-center rounded-lg gradient-primary text-primary-foreground font-bold shadow-elegant">D</div>
          <span className="text-lg font-bold">Dagang Pintar</span>
        </div>
        <nav className="hidden gap-6 text-sm md:flex">
          <a href="#fitur" className="story-link text-muted-foreground hover:text-foreground">Fitur</a>
          <a href="#cara-kerja" className="story-link text-muted-foreground hover:text-foreground">Cara Kerja</a>
          <a href="#harga" className="story-link text-muted-foreground hover:text-foreground">Harga</a>
          <a href="#faq" className="story-link text-muted-foreground hover:text-foreground">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {signedIn ? (
            <Link to="/kasir"><Button size="sm" className="hover-scale">Buka Aplikasi</Button></Link>
          ) : (
            <>
              <Link to="/auth"><Button size="sm" variant="ghost">Masuk</Button></Link>
              <Link to="/auth"><Button size="sm" className="hover-scale">Daftar</Button></Link>
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
      {/* Animated background blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-primary/20 blur-3xl animate-blob" />
        <div className="absolute -top-10 right-0 h-[28rem] w-[28rem] rounded-full bg-primary/10 blur-3xl animate-blob animation-delay-2000" />
        <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-accent/40 blur-3xl animate-blob animation-delay-4000" />
      </div>
      <div className="relative mx-auto max-w-6xl px-4 py-20 text-center md:py-28">
        <Badge variant="secondary" className="mb-4 animate-fade-in"><Sparkles className="mr-1 h-3 w-3" /> Kasir Online untuk UMKM</Badge>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl animate-fade-in">
          Kelola Toko Anda{" "}
          <span className="bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
            Lebih Mudah
          </span>{" "}
          & Cepat
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground md:text-lg animate-fade-in" style={{ animationDelay: "100ms" }}>
          Aplikasi kasir, manajemen stok, dan laporan keuntungan dalam satu tempat.
          Cocok untuk warung, toko kelontong, kuliner, dan UMKM lainnya.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3 animate-fade-in" style={{ animationDelay: "200ms" }}>
          {signedIn ? (
            <Link to="/kasir"><Button size="lg" className="hover-scale shadow-elegant">Buka Aplikasi <ArrowRight className="ml-2 h-4 w-4" /></Button></Link>
          ) : (
            <>
              <Link to="/auth"><Button size="lg" className="hover-scale shadow-elegant">Mulai Gratis 7 Hari <ArrowRight className="ml-2 h-4 w-4" /></Button></Link>
              <a href="#fitur"><Button size="lg" variant="outline" className="hover-scale">Lihat Fitur</Button></a>
            </>
          )}
        </div>
        <p className="mt-4 text-xs text-muted-foreground animate-fade-in" style={{ animationDelay: "300ms" }}>
          Mulai dari {formatRupiah(14900)}/bulan • Tanpa kartu kredit • Batal kapan saja
        </p>

        {/* Trust badges */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs text-muted-foreground animate-fade-in" style={{ animationDelay: "400ms" }}>
          <div className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-primary" /> Data aman & terenkripsi</div>
          <div className="flex items-center gap-1.5"><Wifi className="h-4 w-4 text-primary" /> Sinkron realtime</div>
          <div className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-primary" /> Setup &lt; 5 menit</div>
        </div>
      </div>
    </section>
  );
}

const STATS = [
  { icon: Store, value: "500+", label: "Toko aktif" },
  { icon: Receipt, value: "1 Juta+", label: "Transaksi diproses" },
  { icon: Users, value: "98%", label: "Pengguna puas" },
  { icon: TrendingUp, value: "30%", label: "Rata-rata kenaikan profit" },
];

function Stats() {
  return (
    <section className="border-y bg-card/50">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-10 md:grid-cols-4">
        {STATS.map((s, i) => (
          <div key={s.label} className="flex flex-col items-center text-center animate-fade-in hover-scale" style={{ animationDelay: `${i * 80}ms` }}>
            <div className="mb-2 grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
              <s.icon className="h-5 w-5" />
            </div>
            <div className="text-2xl font-bold md:text-3xl">{s.value}</div>
            <div className="text-xs text-muted-foreground md:text-sm">{s.label}</div>
          </div>
        ))}
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
        <Badge variant="secondary" className="mb-3"><Zap className="mr-1 h-3 w-3" /> Fitur Lengkap</Badge>
        <h2 className="text-3xl font-bold md:text-4xl">Semua yang Toko Anda Butuhkan</h2>
        <p className="mt-3 text-muted-foreground">Fitur lengkap dengan harga terjangkau untuk UMKM.</p>
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <Card
            key={f.title}
            className="group border-border/60 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-elegant animate-fade-in"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <CardContent className="pt-6">
              <div className="mb-3 grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
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

const STEPS = [
  { n: "1", title: "Daftar Akun", desc: "Buat akun dalam hitungan detik, gratis tanpa kartu kredit." },
  { n: "2", title: "Input Produk", desc: "Tambah produk satu per satu atau import dari Excel." },
  { n: "3", title: "Mulai Berjualan", desc: "Jalankan transaksi, pantau stok, dan lihat untung secara realtime." },
];

function HowItWorks() {
  return (
    <section id="cara-kerja" className="border-y bg-muted/30 py-20">
      <div className="mx-auto max-w-6xl px-4">
        <div className="text-center">
          <Badge variant="secondary" className="mb-3">Cara Kerja</Badge>
          <h2 className="text-3xl font-bold md:text-4xl">Mulai dalam 3 Langkah Mudah</h2>
        </div>
        <div className="relative mt-12 grid gap-8 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.n} className="relative animate-fade-in" style={{ animationDelay: `${i * 120}ms` }}>
              <div className="relative z-10 grid h-14 w-14 place-items-center rounded-full gradient-primary text-2xl font-bold text-primary-foreground shadow-elegant">
                {s.n}
              </div>
              <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
              {i < STEPS.length - 1 && (
                <div className="absolute left-14 top-7 hidden h-0.5 w-[calc(100%-3.5rem)] bg-gradient-to-r from-primary/40 to-transparent md:block" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const TESTIMONIALS = [
  { name: "Bu Siti", role: "Warung Sembako, Bandung", text: "Stok ga pernah hilang lagi. Sekarang tau persis barang mana yang paling laku.", rating: 5 },
  { name: "Pak Andi", role: "Toko Kelontong, Surabaya", text: "Kirim struk via WhatsApp bikin pelanggan makin percaya. Recommended!", rating: 5 },
  { name: "Mbak Rina", role: "Kedai Kopi, Jakarta", text: "Setup-nya cepat, anak-anak kasir gampang pakainya. Laporan untungnya jelas.", rating: 5 },
];

function Testimonials() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20">
      <div className="text-center">
        <Badge variant="secondary" className="mb-3"><Star className="mr-1 h-3 w-3" /> Testimoni</Badge>
        <h2 className="text-3xl font-bold md:text-4xl">Dipercaya Pemilik Toko di Seluruh Indonesia</h2>
      </div>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {TESTIMONIALS.map((t, i) => (
          <Card
            key={t.name}
            className="border-border/60 transition-all duration-300 hover:-translate-y-1 hover:shadow-elegant animate-fade-in"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <CardContent className="pt-6">
              <div className="mb-3 flex gap-0.5">
                {Array.from({ length: t.rating }).map((_, j) => (
                  <Star key={j} className="h-4 w-4 fill-primary text-primary" />
                ))}
              </div>
              <p className="text-sm leading-relaxed">"{t.text}"</p>
              <div className="mt-4 flex items-center gap-3 border-t pt-4">
                <div className="grid h-9 w-9 place-items-center rounded-full gradient-primary text-sm font-semibold text-primary-foreground">
                  {t.name.charAt(t.name.indexOf(" ") + 1)}
                </div>
                <div>
                  <div className="text-sm font-semibold">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.role}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function Pricing({ signedIn }: { signedIn: boolean }) {
  const [period, setPeriod] = useState<"monthly" | "yearly">("yearly");
  return (
    <section id="harga" className="border-y bg-muted/30 py-20">
      <div className="mx-auto max-w-5xl px-4">
        <div className="text-center">
          <Badge variant="secondary" className="mb-3">Harga</Badge>
          <h2 className="text-3xl font-bold md:text-4xl">Pilih Paket yang Sesuai</h2>
          <p className="mt-3 text-muted-foreground">Hemat hingga {yearlySavingPct("grosir")}% jika bayar tahunan.</p>
        </div>

        <div className="mt-6 flex justify-center">
          <div className="inline-flex items-center rounded-full border bg-background p-1 text-xs font-medium shadow-soft">
            <button
              type="button"
              onClick={() => setPeriod("monthly")}
              className={`rounded-full px-3 py-1.5 transition ${period === "monthly" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"}`}
            >Bulanan</button>
            <button
              type="button"
              onClick={() => setPeriod("yearly")}
              className={`flex items-center gap-1 rounded-full px-3 py-1.5 transition ${period === "yearly" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              Tahunan
              <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">Hemat 2 bln</span>
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {(Object.values(PLANS) as PlanDef[]).map((p, i) => {
            const effectivePeriod = p.monthlyOnly ? "monthly" : period;
            const price = effectivePeriod === "yearly" ? p.yearly : p.monthly;
            return (
              <Card
                key={p.id}
                className={`relative animate-fade-in transition-all duration-300 hover:-translate-y-1 ${p.highlight ? "border-primary/60 shadow-elegant" : "hover:shadow-soft"}`}
                style={{ animationDelay: `${i * 100}ms` }}
              >
                {p.highlight && (
                  <div className="absolute right-3 top-3 rounded-full gradient-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground shadow-elegant">Populer</div>
                )}
                <CardContent className="pt-8">
                  <Badge variant={p.highlight ? "default" : "secondary"} className="mb-2">{p.name}</Badge>
                  <p className="text-xs text-muted-foreground">{p.tagline}</p>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-4xl font-bold">{formatRupiah(price)}</span>
                    <span className="text-sm text-muted-foreground">/ {effectivePeriod === "yearly" ? "tahun" : "bulan"}</span>
                  </div>
                  {p.monthlyOnly && (
                    <div className="mt-1 text-xs text-muted-foreground">Hanya tersedia bulanan</div>
                  )}
                  {!p.monthlyOnly && effectivePeriod === "yearly" && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      ≈ {formatRupiah(Math.round(price / 12))} / bulan
                    </div>
                  )}
                  <ul className="mt-5 space-y-2 text-left text-sm">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" /> <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Link to={signedIn ? "/langganan" : "/auth"}>
                    <Button className="mt-6 w-full hover-scale" size="lg" variant={p.highlight ? "default" : "outline"}>
                      {signedIn ? `Pilih ${p.name}` : "Daftar & Mulai"}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>

      </div>
    </section>
  );
}

const FAQS = [
  { q: "Apakah ada masa uji coba?", a: "Ya, Anda dapat mencoba aplikasi gratis selama 7 hari tanpa perlu kartu kredit." },
  { q: "Apakah bisa digunakan tanpa internet?", a: "Aplikasi berbasis web dan butuh internet. Namun ringan sehingga dapat dijalankan di koneksi lambat." },
  { q: "Apakah bisa untuk lebih dari 1 kasir?", a: "Bisa! Paket Grosiran mendukung beberapa akun kasir dengan PIN masing-masing dan fitur closing shift." },
  { q: "Bagaimana cara pembayarannya?", a: "Pembayaran via Midtrans (QRIS, transfer bank, e-wallet). Otomatis aktif setelah pembayaran berhasil." },
  { q: "Bisa pindah paket kapan saja?", a: "Ya, Anda bisa upgrade ke Paket Grosiran kapan saja dari halaman Langganan." },
  { q: "Apakah data saya aman?", a: "Data tersimpan terenkripsi di cloud dengan backup otomatis. Hanya Anda yang dapat mengaksesnya." },
];

function FAQ() {
  return (
    <section id="faq" className="mx-auto max-w-3xl px-4 py-20">
      <div className="text-center">
        <Badge variant="secondary" className="mb-3">FAQ</Badge>
        <h2 className="text-3xl font-bold md:text-4xl">Pertanyaan yang Sering Ditanyakan</h2>
      </div>
      <Accordion type="single" collapsible className="mt-8">
        {FAQS.map((f, i) => (
          <AccordionItem key={f.q} value={`item-${i}`}>
            <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

function CTA({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <div className="relative overflow-hidden rounded-2xl gradient-primary p-10 text-center text-primary-foreground shadow-elegant md:p-16">
        <div className="pointer-events-none absolute -top-20 -right-20 h-72 w-72 rounded-full bg-white/10 blur-3xl animate-blob" aria-hidden />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-72 w-72 rounded-full bg-white/10 blur-3xl animate-blob animation-delay-2000" aria-hidden />
        <div className="relative">
          <h2 className="text-3xl font-bold md:text-4xl">Siap Membuat Toko Anda Lebih Pintar?</h2>
          <p className="mx-auto mt-3 max-w-xl opacity-90">
            Gabung bersama ratusan UMKM yang sudah merasakan kemudahan kelola toko dengan Dagang Pintar.
          </p>
          <div className="mt-6 flex justify-center">
            <Link to={signedIn ? "/kasir" : "/auth"}>
              <Button size="lg" variant="secondary" className="hover-scale">
                {signedIn ? "Buka Aplikasi" : "Mulai Gratis Sekarang"} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
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
      <Card className="mt-8 shadow-soft">
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
          <Button onClick={submit} disabled={submitting} className="w-full hover-scale">
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
        © {new Date().getFullYear()} Dagang Pintar. Aplikasi kasir untuk UMKM Indonesia.
      </div>
    </footer>
  );
}
