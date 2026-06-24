import { createFileRoute, Outlet, Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Package, Receipt, LogOut, Store, ClipboardList, TrendingUp, Wifi, CreditCard, Shield, Settings, Users, AlarmClock, Home } from "lucide-react";
import { toast } from "sonner";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

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
  const [tenantName, setTenantName] = useState<string>("");
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
          .select("id, name")
          .eq("owner_user_id", data.user.id)
          .maybeSingle();
        if (tenant) {
          setTenantName(tenant.name || "");
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

  useEffect(() => {
    if (!sub?.isSuperAdmin) return;
    if (!pathname.startsWith("/admin")) {
      router.navigate({ to: "/admin", replace: true });
    }
  }, [sub, pathname, router]);

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
      const { error } = await supabase.auth.signOut();
      if (error) {
        toast.error("Gagal keluar: " + error.message);
        return;
      }
      queryClient.clear();
      try { localStorage.removeItem("sb-auth-token"); } catch {}
      router.navigate({ to: "/auth", replace: true });
    } catch {
      toast.error("Gagal keluar. Coba lagi.");
    }
  };

  if (checking || !user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Memuat...</div>;
  }

  const daysLeft = sub ? Math.ceil((new Date(sub.current_period_end).getTime() - Date.now()) / 86400000) : 0;
  const showTrialBanner = sub && (sub.status === "trialing" || daysLeft <= 3) && daysLeft > 0;
  const expired = sub && new Date(sub.current_period_end) < new Date();

  const navItems = sub?.isSuperAdmin
    ? [{ to: "/admin", icon: Shield, label: "Admin" }]
    : [
        { to: "/kasir", icon: ShoppingCart, label: "Kasir" },
        { to: "/produk", icon: Package, label: "Produk" },
        { to: "/pelanggan", icon: Users, label: "Pelanggan" },
        { to: "/po", icon: ClipboardList, label: "PO" },
        { to: "/kadaluarsa", icon: AlarmClock, label: "Kadaluarsa" },
        { to: "/riwayat", icon: Receipt, label: "Riwayat" },
        { to: "/pengambilan", icon: Home, label: "Pengambilan" },
        { to: "/keuntungan", icon: TrendingUp, label: "Untung" },
        { to: "/cek-koneksi", icon: Wifi, label: "Koneksi" },
        { to: "/langganan", icon: CreditCard, label: "Langganan" },
        { to: "/pengaturan", icon: Settings, label: "Pengaturan" },
      ];

  const title = sub?.isSuperAdmin ? "Dagang Pintar" : (tenantName || "Toko Saya");

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <div className="flex items-center gap-2 px-2 py-2 font-semibold">
              <Store className="h-5 w-5 shrink-0 text-primary" />
              <span className="truncate group-data-[collapsible=icon]:hidden">{title}</span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Menu</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const active = pathname === item.to || pathname.startsWith(item.to + "/");
                    return (
                      <SidebarMenuItem key={item.to}>
                        <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                          <Link to={item.to}>
                            <Icon className="h-4 w-4" />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <div className="px-2 py-1 text-xs text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
              {sub?.isSuperAdmin && (
                <div className="mb-1 inline-block rounded bg-primary px-2 py-0.5 text-primary-foreground">SUPER ADMIN</div>
              )}
              <div className="truncate">{user.email}</div>
            </div>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="justify-start text-sidebar-foreground hover:bg-sidebar-accent">
              <LogOut className="h-4 w-4" />
              <span className="ml-2 group-data-[collapsible=icon]:hidden">Keluar</span>
            </Button>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background px-4">
            <SidebarTrigger />
            <div className="flex-1 truncate text-sm font-medium">{title}</div>
            <div className="hidden text-xs text-muted-foreground sm:block">{user.email}</div>
          </header>
          {!sub?.isSuperAdmin && (showTrialBanner || expired) && (
            <div className={`px-4 py-2 text-center text-sm ${expired ? "bg-destructive text-destructive-foreground" : "bg-amber-500 text-white"}`}>
              {expired ? (
                <>Langganan Anda berakhir. <Link to="/langganan" className="underline font-semibold">Perpanjang sekarang</Link></>
              ) : (
                <>Trial berakhir dalam {daysLeft} hari. <Link to="/langganan" className="underline font-semibold">Berlangganan Rp 14.900/bulan</Link></>
              )}
            </div>
          )}
          <main className="mx-auto w-full max-w-7xl px-4 py-6">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
