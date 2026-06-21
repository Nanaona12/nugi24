import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Link, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Package, Receipt, LogOut, Store } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { user } = Route.useRouteContext();
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
          <div className="flex items-center gap-2 font-semibold">
            <Store className="h-5 w-5 text-primary" />
            <span className="hidden sm:inline">Warung Kasir</span>
          </div>
          <nav className="flex flex-1 items-center gap-1">
            <NavLink to="/kasir" icon={<ShoppingCart className="h-4 w-4" />} label="Kasir" />
            <NavLink to="/produk" icon={<Package className="h-4 w-4" />} label="Produk" />
            <NavLink to="/riwayat" icon={<Receipt className="h-4 w-4" />} label="Riwayat" />
          </nav>
          <div className="hidden text-xs text-sidebar-foreground/70 sm:block">{user.email}</div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-sidebar-foreground hover:bg-sidebar-accent">
            <LogOut className="h-4 w-4" />
            <span className="ml-1 hidden sm:inline">Keluar</span>
          </Button>
        </div>
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
