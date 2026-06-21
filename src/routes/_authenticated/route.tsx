import { createFileRoute, Outlet, Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Package, Receipt, LogOut, Store, ClipboardList, TrendingUp, Wifi, CreditCard, Shield, Settings } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  component: AuthedLayout,
});

type SubInfo = { status: string; current_period_end: string; isSuperAdmin: boolean } | null;

function AuthedLayout() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [user, setUser] = useState<{ id: string; email: string | null } | null>(null);
  const [sub, setSub] = useState<SubInfo>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!mounted) return;
      if (error || !data.user) {
        router.navigate({ to: "/auth", replace: true });
        return;
      }
      setUser({ id: data.user.id, email: data.user.email ?? null });

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id);
      const isSuperAdmin = (roles ?? []).some((r) => r.role === "super_admin");

      if (isSuperAdmin) {
        setSub({ status: "active", current_period_end: "2999-12-31", isSuperAdmin: true });
      } else {
        const { data: tenant } = await supabase
          .from("tenants")
          .select("id")
          .eq("owner_user_id", data.user.id)
          .maybeSingle();
        if (tenant) {
          const { data: s } = await supabase
            .from("subscriptions")
            .select("status, current_period_end")
            .eq("tenant_id", tenant.id)
            .maybeSingle();
          if (s) setSub({ status: s.status, current_period_end: s.current_period_end, isSuperAdmin: false });
        }
      }
      setChecking(false);
    })();

    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) router.navigate({ to: "/auth", replace: true });
    });
    return () => { mounted = false; authSub.subscription.unsubscribe(); };
  }, [router]);

  // Super admin: lock down to /admin area only (no kasir/produk access)
  useEffect(() => {
    if (!sub?.isSuperAdmin) return;
    if (!pathname.startsWith("/admin")) {
      router.navigate({ to: "/admin", replace: true });
    }
  }, [sub, pathname, router]);

  // Tenant gate: redirect to /langganan if expired
  useEffect(() => {
    if (!sub || sub.isSuperAdmin) return;
    const expired = new Date(sub.current_period_end) < new Date();
    if (expired && !pathname.startsWith("/langganan")) {
      router.navigate({ to: "/langganan", replace: true });
    }
  }, [sub, pathname, router]);

  const handleLogout = async () => {
    try {
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
    } catch (e) {
      console.error("Logout error:", e);
    } finally {
      try { localStorage.clear(); } catch {}
      window.location.href = "/auth";
    }
  };

  if (checking || !user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Memuat...</div>;
  }

  const daysLeft = sub ? Math.ceil((new Date(sub.current_period_end).getTime() - Date.now()) / 86400000) : 0;
  const showTrialBanner = sub && (sub.status === "trialing" || daysLeft <= 3) && daysLeft > 0;
  const expired = sub && new Date(sub.current_period_end) < new Date();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
          <div className="flex items-center gap-2 font-semibold">
            <Store className="h-5 w-5 text-primary" />
            <span className="hidden sm:inline">Nugi Vidy 24</span>
          </div>
          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
            {sub?.isSuperAdmin ? (
              <NavLink to="/admin" icon={<Shield className="h-4 w-4" />} label="Admin" />
            ) : (
              <>
                <NavLink to="/kasir" icon={<ShoppingCart className="h-4 w-4" />} label="Kasir" />
                <NavLink to="/produk" icon={<Package className="h-4 w-4" />} label="Produk" />
                <NavLink to="/po" icon={<ClipboardList className="h-4 w-4" />} label="PO" />
                <NavLink to="/riwayat" icon={<Receipt className="h-4 w-4" />} label="Riwayat" />
                <NavLink to="/keuntungan" icon={<TrendingUp className="h-4 w-4" />} label="Untung" />
                <NavLink to="/cek-koneksi" icon={<Wifi className="h-4 w-4" />} label="Koneksi" />
                <NavLink to="/langganan" icon={<CreditCard className="h-4 w-4" />} label="Langganan" />
                <NavLink to="/pengaturan" icon={<Settings className="h-4 w-4" />} label="Pengaturan" />
              </>
            )}
          </nav>
          <div className="hidden text-xs text-sidebar-foreground/70 sm:block">
            {sub?.isSuperAdmin && <span className="mr-2 rounded bg-primary px-2 py-0.5 text-primary-foreground">SUPER ADMIN</span>}
            {user.email}
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-sidebar-foreground hover:bg-sidebar-accent">
            <LogOut className="h-4 w-4" />
            <span className="ml-1 hidden sm:inline">Keluar</span>
          </Button>
        </div>
        {!sub?.isSuperAdmin && (showTrialBanner || expired) && (
          <div className={`px-4 py-2 text-center text-sm ${expired ? "bg-destructive text-destructive-foreground" : "bg-amber-500 text-white"}`}>
            {expired ? (
              <>Langganan Anda berakhir. <Link to="/langganan" className="underline font-semibold">Perpanjang sekarang</Link></>
            ) : (
              <>Trial berakhir dalam {daysLeft} hari. <Link to="/langganan" className="underline font-semibold">Berlangganan Rp 14.900/bulan</Link></>
            )}
          </div>
        )}
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

function NavLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition hover:bg-sidebar-accent hover:text-sidebar-foreground [&.active]:bg-primary [&.active]:text-primary-foreground"
      activeProps={{ className: "active" }}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}

