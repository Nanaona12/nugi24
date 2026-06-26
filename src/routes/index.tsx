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
  CheckCircle2, Star, MessageSquare, ArrowRight, Zap, TrendingUp, Users, Sparkles, Clock, Wifi,
  Lock, Fingerprint, Eye, ArrowUpRight, ArrowDownRight, Wallet, QrCode, CreditCard, PiggyBank, Bell, LineChart,
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
      <AccountOverview />
      <Features />
      <TransactionsSection />
      <SecuritySection />
      <ProfitSection />
      <MobileSection />
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

function BrandMark({ size = "md" }: { size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-8 w-8" : "h-9 w-9";
  return (
    <div className={`grid ${dim} place-items-center rounded-xl gradient-primary text-primary-foreground shadow-elegant`}>
      <ShoppingCart className="h-4 w-4" strokeWidth={2.5} />
    </div>
  );
}

function Header({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="sticky top-0 z-50 px-4 pt-3">
      <header className="nav-float mx-auto flex max-w-5xl items-center justify-between rounded-2xl px-3 py-2.5 animate-fade-in">
        <Link to="/" className="flex items-center gap-2.5">
          <BrandMark size="sm" />
          <span className="text-base font-semibold tracking-tight">Dagang Pintar</span>
        </Link>

        <nav className="hidden items-center gap-1 text-sm font-medium md:flex">
          <a href="#fitur" className="nav-float-link rounded-lg px-3 py-1.5 transition-colors">Fitur</a>
          <a href="#keamanan" className="nav-float-link rounded-lg px-3 py-1.5 transition-colors">Keamanan</a>
          <a href="#harga" className="nav-float-link rounded-lg px-3 py-1.5 transition-colors">Harga</a>
          <a href="#faq" className="nav-float-link rounded-lg px-3 py-1.5 transition-colors">FAQ</a>
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>
          {signedIn ? (
            <Link to="/kasir">
              <Button size="sm" className="nav-float-cta hover-scale shadow-soft">
                Buka Aplikasi
              </Button>
            </Link>
          ) : (
            <>
              <Link to="/auth" className="hidden sm:block">
                <Button size="sm" variant="ghost" className="nav-float-ghost">
                  Masuk
                </Button>
              </Link>
              <Link to="/auth">
                <Button size="sm" className="nav-float-cta hover-scale shadow-soft">
                  Daftar
                </Button>
              </Link>
            </>
          )}
        </div>
      </header>
    </div>
  );
}



function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-primary/25 blur-3xl animate-blob" />
        <div className="absolute -top-10 right-0 h-[28rem] w-[28rem] rounded-full bg-primary/15 blur-3xl animate-blob animation-delay-2000" />
        <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-accent/50 blur-3xl animate-blob animation-delay-4000" />
        <div className="absolute inset-0 [background:radial-gradient(circle_at_50%_-20%,color-mix(in_oklab,var(--color-primary)_10%,transparent),transparent_55%)]" />
      </div>

      <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-20 md:py-28 lg:grid-cols-2 lg:items-center">
        <div className="text-center lg:text-left">
          <Badge variant="secondary" className="mb-4 animate-fade-in">
            <Sparkles className="mr-1 h-3 w-3" /> Kasir digital generasi baru
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl animate-fade-in">
            Kelola Toko Anda{" "}
            <span className="bg-gradient-to-r from-primary via-primary to-primary-glow bg-clip-text text-transparent">
              Seperti Bank Digital
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted-foreground md:text-lg animate-fade-in mx-auto lg:mx-0" style={{ animationDelay: "100ms" }}>
            Kasir, stok, dan laporan keuntungan dalam satu dashboard elegan.
            Aman, realtime, dan dirancang untuk UMKM modern.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3 animate-fade-in lg:justify-start" style={{ animationDelay: "200ms" }}>
            {signedIn ? (
              <Link to="/kasir"><Button size="lg" className="hover-scale shadow-elegant">Buka Aplikasi <ArrowRight className="ml-2 h-4 w-4" /></Button></Link>
            ) : (
              <>
                <Link to="/auth"><Button size="lg" className="hover-scale shadow-elegant">Mulai Gratis 7 Hari <ArrowRight className="ml-2 h-4 w-4" /></Button></Link>
                <a href="#fitur"><Button size="lg" variant="outline" className="hover-scale glass">Lihat Fitur</Button></a>
              </>
            )}
          </div>
          <p className="mt-4 text-xs text-muted-foreground animate-fade-in" style={{ animationDelay: "300ms" }}>
            Mulai dari {formatRupiah(14900)}/bulan • Tanpa kartu kredit • Batal kapan saja
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-xs text-muted-foreground animate-fade-in lg:justify-start" style={{ animationDelay: "400ms" }}>
            <div className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-primary" /> Enkripsi end-to-end</div>
            <div className="flex items-center gap-1.5"><Wifi className="h-4 w-4 text-primary" /> Sinkron realtime</div>
            <div className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-primary" /> Setup &lt; 5 menit</div>
          </div>
        </div>

        {/* Glass dashboard preview */}
        <div className="relative animate-fade-in" style={{ animationDelay: "200ms" }}>
          <HeroDashboardPreview />
        </div>
      </div>
    </section>
  );
}

function HeroDashboardPreview() {
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none">
      {/* Floating mini cards */}
      <div className="absolute -left-6 top-10 z-20 hidden animate-float-slow md:block">
        <div className="glass rounded-2xl px-3 py-2 shadow-elegant">
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <ArrowUpRight className="h-3.5 w-3.5" />
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground">Omzet hari ini</div>
              <div className="text-sm font-semibold">{formatRupiah(2450000)}</div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -right-4 bottom-16 z-20 hidden animate-float-slow md:block" style={{ animationDelay: "1.2s" }}>
        <div className="glass rounded-2xl px-3 py-2 shadow-elegant">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <div className="text-xs">
              <span className="font-semibold">Stok rendah</span>
              <span className="text-muted-foreground"> · Indomie Goreng</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main card */}
      <div className="glass-strong relative rounded-3xl p-5 shadow-elegant">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BrandMark size="sm" />
            <div>
              <div className="text-xs text-muted-foreground">Toko Anda</div>
              <div className="text-sm font-semibold">Warung Berkah</div>
            </div>
          </div>
          <Badge variant="secondary" className="text-[10px]">Live</Badge>
        </div>

        {/* Balance / Omzet */}
        <div className="mt-5 rounded-2xl gradient-primary p-5 text-primary-foreground shadow-elegant">
          <div className="text-xs opacity-80">Saldo Keuntungan</div>
          <div className="mt-1 text-3xl font-bold tracking-tight">{formatRupiah(18750000)}</div>
          <div className="mt-1 flex items-center gap-1 text-xs opacity-90">
            <TrendingUp className="h-3 w-3" /> +12,4% vs minggu lalu
          </div>

          {/* mini bars */}
          <div className="mt-4 flex h-10 items-end gap-1.5">
            {[40, 65, 35, 78, 58, 88, 72].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-md bg-primary-foreground/30"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
          {[
            { icon: QrCode, label: "QRIS" },
            { icon: Receipt, label: "Struk" },
            { icon: Package, label: "Stok" },
            { icon: LineChart, label: "Laporan" },
          ].map((a) => (
            <div key={a.label} className="rounded-xl border border-border/50 bg-background/40 p-2">
              <div className="mx-auto grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <a.icon className="h-4 w-4" />
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">{a.label}</div>
            </div>
          ))}
        </div>

        {/* Recent transactions */}
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold">Transaksi terbaru</span>
            <span className="text-muted-foreground">Hari ini</span>
          </div>
          {[
            { name: "Indomie Goreng × 3", time: "10:24", amount: 9000, in: true },
            { name: "Aqua 600ml × 2", time: "10:18", amount: 7000, in: true },
            { name: "Setoran kas awal", time: "08:00", amount: -200000, in: false },
          ].map((t, i) => (
            <div key={i} className="flex items-center justify-between rounded-xl border border-border/40 bg-background/40 px-3 py-2">
              <div className="flex items-center gap-2">
                <div className={`grid h-7 w-7 place-items-center rounded-lg ${t.in ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-orange-500/15 text-orange-600 dark:text-orange-400"}`}>
                  {t.in ? <ArrowDownRight className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                </div>
                <div>
                  <div className="text-xs font-medium">{t.name}</div>
                  <div className="text-[10px] text-muted-foreground">{t.time}</div>
                </div>
              </div>
              <div className={`text-xs font-semibold ${t.in ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`}>
                {t.in ? "+" : ""}{formatRupiah(Math.abs(t.amount))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const STATS = [
  { icon: Users, value: "500+", label: "Toko aktif" },
  { icon: Receipt, value: "1 Juta+", label: "Transaksi diproses" },
  { icon: ShieldCheck, value: "99.9%", label: "Uptime" },
  { icon: TrendingUp, value: "30%", label: "Kenaikan profit" },
];

function Stats() {
  return (
    <section className="border-y border-border/50 bg-card/40">
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

function AccountOverview() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20">
      <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
        <div className="order-2 lg:order-1">
          <div className="relative">
            <div className="absolute -inset-6 -z-10 rounded-3xl bg-gradient-to-br from-primary/15 to-transparent blur-2xl" />
            <div className="glass-strong rounded-3xl p-6 shadow-elegant">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground">Ringkasan Toko</div>
                  <div className="text-lg font-semibold">Bulan ini</div>
                </div>
                <Badge variant="secondary">Realtime</Badge>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <OverviewTile icon={Wallet} label="Total Omzet" value={formatRupiah(48250000)} delta="+18%" positive />
                <OverviewTile icon={PiggyBank} label="Laba Bersih" value={formatRupiah(12340000)} delta="+12%" positive />
                <OverviewTile icon={Package} label="Produk Aktif" value="248" delta="+6 baru" positive />
                <OverviewTile icon={Receipt} label="Transaksi" value="1.284" delta="+9%" positive />
              </div>
              <div className="mt-5 rounded-2xl border border-border/40 bg-background/40 p-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold">Penjualan 7 hari</span>
                  <span className="text-muted-foreground">Trend naik</span>
                </div>
                <svg viewBox="0 0 300 80" className="mt-3 h-20 w-full">
                  <defs>
                    <linearGradient id="lg" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.62 0.16 245)" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="oklch(0.62 0.16 245)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M0,60 C40,40 70,55 110,35 C150,15 180,50 220,30 C250,15 280,25 300,18 L300,80 L0,80 Z" fill="url(#lg)" />
                  <path d="M0,60 C40,40 70,55 110,35 C150,15 180,50 220,30 C250,15 280,25 300,18" fill="none" stroke="oklch(0.62 0.16 245)" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <Badge variant="secondary" className="mb-3"><BarChart3 className="mr-1 h-3 w-3" /> Account Overview</Badge>
          <h2 className="text-3xl font-bold md:text-4xl">Dashboard yang Memberi Anda Kendali Penuh</h2>
          <p className="mt-4 text-muted-foreground">
            Lihat omzet, laba, dan performa produk dalam satu tampilan yang elegan.
            Setiap angka diperbarui secara realtime — sama mudahnya dengan membuka aplikasi mobile banking.
          </p>
          <ul className="mt-6 space-y-3 text-sm">
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" /> Rekap harian, mingguan, dan bulanan otomatis.</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" /> Produk terlaris & analisa margin per item.</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" /> Notifikasi stok menipis & barang mendekati kadaluarsa.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function OverviewTile({ icon: Icon, label, value, delta, positive }: { icon: any; label: string; value: string; delta: string; positive?: boolean }) {
  return (
    <div className="rounded-2xl border border-border/40 bg-background/50 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" /> {label}
      </div>
      <div className="mt-1 text-base font-semibold">{value}</div>
      <div className={`text-[11px] ${positive ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>{delta}</div>
    </div>
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
    <section id="fitur" className="border-y border-border/50 bg-muted/30 py-20">
      <div className="mx-auto max-w-6xl px-4">
        <div className="text-center">
          <Badge variant="secondary" className="mb-3"><Zap className="mr-1 h-3 w-3" /> Fitur Lengkap</Badge>
          <h2 className="text-3xl font-bold md:text-4xl">Semua yang Toko Anda Butuhkan</h2>
          <p className="mt-3 text-muted-foreground">Dirancang seperti aplikasi banking — rapi, cepat, dan dapat diandalkan.</p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Card
              key={f.title}
              className="group glass border-border/40 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-elegant animate-fade-in"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <CardContent className="pt-6">
                <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function TransactionsSection() {
  const items = [
    { icon: QrCode, title: "Bayar QRIS", desc: "Terima pembayaran dari semua dompet digital tanpa ribet." },
    { icon: CreditCard, title: "Multi Metode", desc: "Tunai, transfer, QRIS — semua tercatat otomatis." },
    { icon: Receipt, title: "Struk Digital", desc: "Kirim struk via WhatsApp langsung ke pelanggan." },
    { icon: Users, title: "Pelanggan & Poin", desc: "Bangun loyalitas dengan sistem poin pelanggan." },
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 py-20">
      <div className="grid gap-10 lg:grid-cols-5 lg:items-center">
        <div className="lg:col-span-2">
          <Badge variant="secondary" className="mb-3"><Receipt className="mr-1 h-3 w-3" /> Transaksi</Badge>
          <h2 className="text-3xl font-bold md:text-4xl">Transaksi Selancar Mobile Banking</h2>
          <p className="mt-4 text-muted-foreground">
            Setiap penjualan tercatat rapi dan langsung tersinkron ke laporan keuntungan.
            Mudah dibaca, mudah dilacak, mudah dikirim.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-3">
          {items.map((it, i) => (
            <div
              key={it.title}
              className="glass rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-elegant animate-fade-in"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <it.icon className="h-5 w-5" />
              </div>
              <div className="mt-3 font-semibold">{it.title}</div>
              <div className="mt-1 text-sm text-muted-foreground">{it.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SecuritySection() {
  const items = [
    { icon: Lock, title: "Enkripsi end-to-end", desc: "Setiap transaksi & data toko dienkripsi dalam transmisi & penyimpanan." },
    { icon: Fingerprint, title: "Akses berbasis peran", desc: "Owner, kasir, dan admin punya hak akses berbeda — aman dari penyalahgunaan." },
    { icon: Eye, title: "Audit log lengkap", desc: "Setiap perubahan paket, harga, dan stok tercatat untuk transparansi." },
    { icon: ShieldCheck, title: "Backup otomatis", desc: "Data Anda dicadangkan setiap saat, tanpa perlu Anda lakukan apa-apa." },
  ];
  return (
    <section id="keamanan" className="border-y border-border/50 bg-muted/30 py-20">
      <div className="mx-auto max-w-6xl px-4">
        <div className="text-center">
          <Badge variant="secondary" className="mb-3"><ShieldCheck className="mr-1 h-3 w-3" /> Keamanan</Badge>
          <h2 className="text-3xl font-bold md:text-4xl">Standar Keamanan Tingkat Perbankan</h2>
          <p className="mt-3 mx-auto max-w-xl text-muted-foreground">
            Kami memperlakukan data toko Anda seperti data nasabah bank — dilindungi berlapis.
          </p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((it, i) => (
            <div
              key={it.title}
              className="glass-strong rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-elegant animate-fade-in"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="grid h-11 w-11 place-items-center rounded-xl gradient-primary text-primary-foreground shadow-elegant">
                <it.icon className="h-5 w-5" />
              </div>
              <div className="mt-3 font-semibold">{it.title}</div>
              <div className="mt-1 text-sm text-muted-foreground">{it.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProfitSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20">
      <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
        <div>
          <Badge variant="secondary" className="mb-3"><TrendingUp className="mr-1 h-3 w-3" /> Profit Insight</Badge>
          <h2 className="text-3xl font-bold md:text-4xl">Lihat Keuntungan, Bukan Sekadar Omzet</h2>
          <p className="mt-4 text-muted-foreground">
            Pisahkan modal, biaya, dan laba bersih. Pahami produk mana yang benar-benar untung —
            lalu rekonsiliasi kas fisik & QRIS dengan data sistem.
          </p>
          <ul className="mt-6 space-y-3 text-sm">
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" /> Total aset otomatis dari modal × stok.</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" /> Rekonsiliasi kas fisik vs catatan sistem.</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" /> Closing shift kasir dengan ringkasan otomatis.</li>
          </ul>
        </div>

        <div className="relative">
          <div className="absolute -inset-6 -z-10 rounded-3xl bg-gradient-to-tr from-primary/20 to-transparent blur-2xl" />
          <div className="glass-strong rounded-3xl p-6 shadow-elegant">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground">Laba bersih bulan ini</div>
                <div className="text-2xl font-bold">{formatRupiah(12340000)}</div>
              </div>
              <Badge variant="secondary" className="text-emerald-600 dark:text-emerald-400">+12%</Badge>
            </div>

            <div className="mt-5 space-y-2">
              {[
                { name: "Sembako", pct: 78, color: "bg-primary" },
                { name: "Minuman", pct: 62, color: "bg-emerald-500" },
                { name: "Snack", pct: 48, color: "bg-amber-500" },
                { name: "Rokok", pct: 34, color: "bg-rose-500" },
              ].map((c) => (
                <div key={c.name}>
                  <div className="flex justify-between text-xs">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-muted-foreground">{c.pct}%</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full ${c.color} relative`} style={{ width: `${c.pct}%` }}>
                      <div className="absolute inset-0 animate-shimmer-bar" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-border/40 bg-background/50 p-3">
                <div className="text-[10px] text-muted-foreground">Kas Fisik</div>
                <div className="text-sm font-semibold">{formatRupiah(3450000)}</div>
              </div>
              <div className="rounded-xl border border-border/40 bg-background/50 p-3">
                <div className="text-[10px] text-muted-foreground">QRIS</div>
                <div className="text-sm font-semibold">{formatRupiah(2180000)}</div>
              </div>
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3">
                <div className="text-[10px] text-muted-foreground">Selisih</div>
                <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Rp 0</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MobileSection() {
  return (
    <section className="border-y border-border/50 bg-muted/30 py-20">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 lg:grid-cols-2 lg:items-center">
        <div className="relative flex justify-center">
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-3xl" />
          </div>
          {/* Phone mockup */}
          <div className="relative h-[560px] w-[280px] rounded-[2.5rem] border border-border/60 bg-background p-3 shadow-elegant animate-float-slow">
            <div className="absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-foreground/80" />
            <div className="h-full w-full overflow-hidden rounded-[2rem] gradient-surface p-4">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>09:41</span>
                <span className="flex items-center gap-1"><Wifi className="h-3 w-3" /> 5G</span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <BrandMark size="sm" />
                <div>
                  <div className="text-[10px] text-muted-foreground">Selamat pagi,</div>
                  <div className="text-sm font-semibold">Pak Andi</div>
                </div>
              </div>

              <div className="mt-4 rounded-2xl gradient-primary p-4 text-primary-foreground shadow-elegant">
                <div className="text-[10px] opacity-80">Omzet hari ini</div>
                <div className="text-2xl font-bold">{formatRupiah(2450000)}</div>
                <div className="mt-1 text-[10px] opacity-90">+8,2% vs kemarin</div>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                {[QrCode, ShoppingCart, Package, BarChart3].map((Ic, i) => (
                  <div key={i} className="rounded-xl bg-background/60 p-2">
                    <div className="mx-auto grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Ic className="h-3.5 w-3.5" />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 space-y-2">
                {[
                  { n: "Indomie × 2", v: 6000 },
                  { n: "Aqua × 1", v: 3500 },
                  { n: "Teh Pucuk × 3", v: 12000 },
                ].map((t, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl border border-border/40 bg-background/50 px-3 py-2 text-[11px]">
                    <span>{t.n}</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">+{formatRupiah(t.v)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div>
          <Badge variant="secondary" className="mb-3"><Smartphone className="mr-1 h-3 w-3" /> Mobile First</Badge>
          <h2 className="text-3xl font-bold md:text-4xl">Toko Anda di Saku, Kapan Saja</h2>
          <p className="mt-4 text-muted-foreground">
            Pantau penjualan, cek stok, dan kirim struk langsung dari HP.
            Tidak butuh install — buka browser dan langsung jalan.
          </p>
          <ul className="mt-6 space-y-3 text-sm">
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" /> Bekerja di Android, iOS, dan desktop.</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" /> Scan barcode pakai kamera HP.</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" /> Notifikasi realtime untuk transaksi & stok.</li>
          </ul>
        </div>
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
    <section id="cara-kerja" className="mx-auto max-w-6xl px-4 py-20">
      <div className="text-center">
        <Badge variant="secondary" className="mb-3">Cara Kerja</Badge>
        <h2 className="text-3xl font-bold md:text-4xl">Mulai dalam 3 Langkah Mudah</h2>
      </div>
      <div className="relative mt-12 grid gap-8 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <div key={s.n} className="relative animate-fade-in" style={{ animationDelay: `${i * 120}ms` }}>
            <div className="relative z-10 grid h-14 w-14 place-items-center rounded-2xl gradient-primary text-2xl font-bold text-primary-foreground shadow-elegant">
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
    <section className="border-y border-border/50 bg-muted/30 py-20">
      <div className="mx-auto max-w-6xl px-4">
        <div className="text-center">
          <Badge variant="secondary" className="mb-3"><Star className="mr-1 h-3 w-3" /> Testimoni</Badge>
          <h2 className="text-3xl font-bold md:text-4xl">Dipercaya Pemilik Toko di Seluruh Indonesia</h2>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <Card
              key={t.name}
              className="glass border-border/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-elegant animate-fade-in"
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
      </div>
    </section>
  );
}

function Pricing({ signedIn }: { signedIn: boolean }) {
  const [period, setPeriod] = useState<"monthly" | "yearly">("yearly");
  return (
    <section id="harga" className="py-20">
      <div className="mx-auto max-w-5xl px-4">
        <div className="text-center">
          <Badge variant="secondary" className="mb-3">Harga</Badge>
          <h2 className="text-3xl font-bold md:text-4xl">Pilih Paket yang Sesuai</h2>
          <p className="mt-3 text-muted-foreground">Hemat hingga {yearlySavingPct("grosir")}% jika bayar tahunan.</p>
        </div>

        <div className="mt-6 flex justify-center">
          <div className="glass inline-flex items-center rounded-full p-1 text-xs font-medium shadow-soft">
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
                className={`relative glass animate-fade-in transition-all duration-300 hover:-translate-y-1 ${p.highlight ? "border-primary/60 shadow-elegant" : "hover:shadow-soft"}`}
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
    <section id="faq" className="border-y border-border/50 bg-muted/30 py-20">
      <div className="mx-auto max-w-3xl px-4">
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
      </div>
    </section>
  );
}

function CTA({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <div className="relative overflow-hidden rounded-3xl gradient-primary p-10 text-center text-primary-foreground shadow-elegant md:p-16">
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
      <Card className="glass mt-8 shadow-soft">
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
    <footer className="border-t border-border/50 bg-muted/30">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted-foreground md:flex-row">
        <div className="flex items-center gap-2">
          <BrandMark size="sm" />
          <span className="font-semibold text-foreground">Dagang Pintar</span>
        </div>
        <div>© {new Date().getFullYear()} Dagang Pintar. Aplikasi kasir untuk UMKM Indonesia.</div>
      </div>
    </footer>
  );
}
