import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getTodayRevenueAndCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tid } = await supabaseAdmin.rpc("current_tenant_id");
    const tenantId = tid as string | null;
    if (!tenantId) return { todayTotal: 0, totalAllTime: 0, byCategory: [] };

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const { data: txs } = await supabaseAdmin
      .from("transactions")
      .select("id, total, created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString());

    const txIds = (txs || []).map((t: any) => t.id);
    const todayTotal = (txs || []).reduce((s: number, t: any) => s + Number(t.total || 0), 0);

    // total all time
    const { data: allTx } = await supabaseAdmin
      .from("transactions")
      .select("total")
      .eq("tenant_id", tenantId);
    const totalAllTime = (allTx || []).reduce((s: number, t: any) => s + Number(t.total || 0), 0);

    let byCategory: { category: string | null; revenue: number }[] = [];
    if (txIds.length > 0) {
      const { data: items } = await supabaseAdmin
        .from("transaction_items")
        .select("subtotal, products(category)")
        .in("transaction_id", txIds);
      const map = new Map<string|null, number>();
      for (const it of (items || []) as any[]) {
        const cat = (it.products && it.products.category) || null;
        map.set(cat, (map.get(cat) || 0) + Number(it.subtotal || 0));
      }
      byCategory = Array.from(map.entries()).map(([category, revenue]) => ({ category, revenue }));
      byCategory.sort((a, b) => b.revenue - a.revenue);
    }

    return { todayTotal, totalAllTime, byCategory };
  });
