import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const CONNECTOR_ID = "google_sheets";

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
];

export const BACKUP_TABLES: { name: string; label: string }[] = [
  { name: "products", label: "Produk" },
  { name: "product_units", label: "Satuan Produk" },
  { name: "product_price_tiers", label: "Tier Harga" },
  { name: "product_batches", label: "Batch Modal" },
  { name: "transactions", label: "Transaksi" },
  { name: "transaction_items", label: "Item Transaksi" },
  { name: "refunds", label: "Refund" },
  { name: "refund_items", label: "Item Refund" },
  { name: "customers", label: "Pelanggan" },
  { name: "debts", label: "Hutang" },
  { name: "debt_payments", label: "Bayar Hutang" },
  { name: "bookkeeping_entries", label: "Pembukuan" },
  { name: "cashiers", label: "Kasir" },
  { name: "cashier_shifts", label: "Shift" },
  { name: "shift_expenses", label: "Biaya Shift" },
  { name: "stock_movements", label: "Log Stok" },
  { name: "purchase_orders", label: "PO" },
  { name: "purchase_order_items", label: "Item PO" },
  { name: "promos", label: "Promo" },
  { name: "household_withdrawals", label: "Pengambilan" },
  { name: "profit_activity_log", label: "Log Keuntungan" },
];

// ---------- OAuth ----------

export const startGoogleSheetsConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientKey = process.env['GOOGLE_SHEETS_APP_USER_CONNECTOR_CLIENT_API_KEY'];
    if (!clientKey) throw new Error("Koneksi Google belum dikonfigurasi di proyek ini.");
    const request = getRequest();
    if (!request) throw new Error("OAuth harus dimulai dari aplikasi.");
    const url = new URL(request.url);
    const sandboxHost = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
    const returnUrl = new URL(
      "/oauth/google-sheets/return",
      sandboxHost ? `https://${sandboxHost}` : url.origin,
    ).toString();

    const { getConnectionKeyForUser } = await import("./app-user-connections.server");
    const { authorizeAppUserOAuth } = await import("@/integrations/lovable/appUserConnector");
    const existing = await getConnectionKeyForUser(context.userId, CONNECTOR_ID);

    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectorId: CONNECTOR_ID,
      appUserId: context.userId,
      clientAPIKey: clientKey,
      returnUrl,
      connectionAPIKey: existing ?? undefined,
      credentialsConfiguration: { scopes: GOOGLE_SCOPES },
    });
    return { authorizationUrl };
  });

async function resolveTenantId(supabase: any): Promise<string> {
  const { data, error } = await supabase.rpc("current_tenant_id");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Toko tidak ditemukan untuk akun ini.");
  return data as string;
}

export const completeGoogleSheetsConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string }) => {
    if (!input?.code || typeof input.code !== "string") throw new Error("Kode OAuth tidak valid");
    return { code: input.code };
  })
  .handler(async ({ data, context }) => {
    const { exchangeAppUserOAuthCode } = await import("@/integrations/lovable/appUserConnector");
    const { saveConnectionKeyForUser } = await import("./app-user-connections.server");
    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(
      GATEWAY_BASE_URL,
      data.code,
    );
    if (connectorId !== CONNECTOR_ID) throw new Error("Koneksi Google tidak sesuai.");
    await saveConnectionKeyForUser(context.userId, connectorId, connectionAPIKey);

    const tenantId = await resolveTenantId(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any)
      .from("tenant_backup_settings")
      .upsert(
        {
          tenant_id: tenantId,
          connected_user_id: context.userId,
          enabled: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id" },
      );
    return { ok: true };
  });

export const disconnectGoogleSheets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionKeyForUser, deleteConnectionForUser } = await import(
      "./app-user-connections.server"
    );
    const key = await getConnectionKeyForUser(context.userId, CONNECTOR_ID);
    if (key) {
      const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");
      try {
        await disconnectAppUser({
          gatewayBaseUrl: GATEWAY_BASE_URL,
          connectionAPIKey: key,
          connectorId: CONNECTOR_ID,
        });
      } catch (e) {
        console.error("disconnect gateway", e);
      }
      await deleteConnectionForUser(context.userId, CONNECTOR_ID);
    }
    const tenantId = await resolveTenantId(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any)
      .from("tenant_backup_settings")
      .update({ connected_user_id: null, enabled: false, updated_at: new Date().toISOString() })
      .eq("tenant_id", tenantId);
    return { ok: true };
  });

// ---------- Status ----------

export const getBackupStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenantId = await resolveTenantId(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings } = await (supabaseAdmin as any)
      .from("tenant_backup_settings")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const { data: runs } = await (supabaseAdmin as any)
      .from("tenant_backup_runs")
      .select("id, status, total_rows, error, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(10);

    const { getConnectionKeyForUser } = await import("./app-user-connections.server");
    const ownerId = settings?.connected_user_id ?? null;
    const key = ownerId ? await getConnectionKeyForUser(ownerId, CONNECTOR_ID) : null;

    return {
      connected: !!key,
      connectedByMe: ownerId === context.userId,
      enabled: settings?.enabled ?? false,
      spreadsheetId: settings?.spreadsheet_id ?? null,
      spreadsheetUrl: settings?.spreadsheet_url ?? null,
      googleEmail: settings?.google_email ?? null,
      lastBackupAt: settings?.last_backup_at ?? null,
      lastStatus: settings?.last_status ?? null,
      lastError: settings?.last_error ?? null,
      runs: runs ?? [],
    };
  });

export const setBackupEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { enabled: boolean }) => ({ enabled: !!input?.enabled }))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any)
      .from("tenant_backup_settings")
      .upsert(
        { tenant_id: tenantId, enabled: data.enabled, updated_at: new Date().toISOString() },
        { onConflict: "tenant_id" },
      );
    return { ok: true };
  });

export const setBackupSpreadsheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { url: string }) => ({ url: String(input?.url ?? "").trim() }))
  .handler(async ({ data, context }) => {
    const m = data.url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    const id = m?.[1] ?? (/^[a-zA-Z0-9-_]{20,}$/.test(data.url) ? data.url : null);
    if (!id) throw new Error("Link spreadsheet tidak valid.");
    const tenantId = await resolveTenantId(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any).from("tenant_backup_settings").upsert(
      {
        tenant_id: tenantId,
        spreadsheet_id: id,
        spreadsheet_url: `https://docs.google.com/spreadsheets/d/${id}/edit`,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" },
    );
    return { ok: true, spreadsheetId: id };
  });

// ---------- Sync ----------

function cellValue(v: unknown) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return v as string | number;
}

export const syncTenantBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenantId = await resolveTenantId(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { callAsAppUser } = await import("@/integrations/lovable/appUserConnector");
    const { getConnectionKeyForUser } = await import("./app-user-connections.server");

    const { data: settings } = await (supabaseAdmin as any)
      .from("tenant_backup_settings")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const ownerId = settings?.connected_user_id ?? context.userId;
    const connectionAPIKey = await getConnectionKeyForUser(ownerId, CONNECTOR_ID);
    if (!connectionAPIKey) throw new Error("Google Spreadsheet belum terhubung.");

    const sheetsCall = async (path: string, init?: RequestInit) => {
      const res = await callAsAppUser({
        gatewayBaseUrl: GATEWAY_BASE_URL,
        connectionAPIKey,
        connectorId: CONNECTOR_ID,
        path,
        init,
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`Google Sheets [${res.status}]: ${text.slice(0, 400)}`);
      return text ? JSON.parse(text) : {};
    };

    // 1. Ambil data per tabel
    const tableRows: Record<string, any[]> = {};
    let totalRows = 0;
    for (const t of BACKUP_TABLES) {
      const rows: any[] = [];
      const size = 1000;
      for (let from = 0; ; from += size) {
        const { data, error } = await (supabaseAdmin as any)
          .from(t.name)
          .select("*")
          .eq("tenant_id", tenantId)
          .range(from, from + size - 1);
        if (error) throw new Error(`${t.label}: ${error.message}`);
        rows.push(...(data || []));
        if (!data || data.length < size) break;
        if (rows.length >= 50000) break;
      }
      tableRows[t.name] = rows;
      totalRows += rows.length;
    }

    // 2. Pastikan spreadsheet ada
    let spreadsheetId: string | null = settings?.spreadsheet_id ?? null;
    let spreadsheetUrl: string | null = settings?.spreadsheet_url ?? null;

    const { data: tenant } = await (supabaseAdmin as any)
      .from("tenants")
      .select("name")
      .eq("id", tenantId)
      .maybeSingle();
    const title = `Backup ${tenant?.name || "Toko"}`;

    let meta: any = null;
    if (spreadsheetId) {
      try {
        meta = await sheetsCall(`/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties,spreadsheetUrl`);
      } catch {
        spreadsheetId = null;
      }
    }
    if (!spreadsheetId) {
      const created = await sheetsCall(`/v4/spreadsheets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ properties: { title } }),
      });
      spreadsheetId = created.spreadsheetId;
      spreadsheetUrl = created.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
      meta = await sheetsCall(`/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties,spreadsheetUrl`);
    }
    if (!spreadsheetUrl) {
      spreadsheetUrl = meta?.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
    }

    const existingTitles: string[] = (meta?.sheets ?? []).map((s: any) => s.properties?.title);
    const wanted = [...BACKUP_TABLES.map((t) => t.label), "Info Backup"];
    const missing = wanted.filter((w) => !existingTitles.includes(w));
    if (missing.length) {
      await sheetsCall(`/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: missing.map((t) => ({ addSheet: { properties: { title: t } } })),
        }),
      });
    }

    // 3. Tulis data
    const detail: Record<string, number> = {};
    for (const t of BACKUP_TABLES) {
      const rows = tableRows[t.name] ?? [];
      detail[t.name] = rows.length;
      const headers = rows.length ? Object.keys(rows[0]) : ["info"];
      const values: any[][] = [headers];
      for (const r of rows) values.push(headers.map((h) => cellValue(r[h])));
      if (!rows.length) values.push(["kosong"]);

      await sheetsCall(
        `/v4/spreadsheets/${spreadsheetId}/values/'${t.label}'!A1:ZZ:clear`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      );

      const chunk = 2000;
      for (let i = 0; i < values.length; i += chunk) {
        const part = values.slice(i, i + chunk);
        await sheetsCall(
          `/v4/spreadsheets/${spreadsheetId}/values/'${t.label}'!A${i + 1}?valueInputOption=RAW`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ values: part }),
          },
        );
      }
    }

    const now = new Date();
    const info: any[][] = [
      ["Backup terakhir", now.toISOString()],
      ["Total baris", totalRows],
      ["Tabel", "Jumlah baris"],
      ...BACKUP_TABLES.map((t) => [t.label, detail[t.name] ?? 0]),
    ];
    await sheetsCall(`/v4/spreadsheets/${spreadsheetId}/values/'Info Backup'!A1:B200:clear`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    await sheetsCall(
      `/v4/spreadsheets/${spreadsheetId}/values/'Info Backup'!A1?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: info }),
      },
    );

    await (supabaseAdmin as any).from("tenant_backup_settings").upsert(
      {
        tenant_id: tenantId,
        spreadsheet_id: spreadsheetId,
        spreadsheet_url: spreadsheetUrl,
        connected_user_id: ownerId,
        enabled: true,
        last_backup_at: now.toISOString(),
        last_status: "success",
        last_error: null,
        updated_at: now.toISOString(),
      },
      { onConflict: "tenant_id" },
    );
    await (supabaseAdmin as any).from("tenant_backup_runs").insert({
      tenant_id: tenantId,
      status: "success",
      total_rows: totalRows,
      detail,
    });

    return { ok: true, totalRows, spreadsheetUrl, detail };
  });

export const recordBackupFailure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { message: string }) => ({ message: String(input?.message ?? "").slice(0, 500) }))
  .handler(async ({ data, context }) => {
    const tenantId = await resolveTenantId(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any).from("tenant_backup_settings").upsert(
      {
        tenant_id: tenantId,
        last_status: "failed",
        last_error: data.message,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" },
    );
    await (supabaseAdmin as any)
      .from("tenant_backup_runs")
      .insert({ tenant_id: tenantId, status: "failed", error: data.message });
    return { ok: true };
  });
