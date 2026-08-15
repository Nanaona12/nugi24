import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, DatabaseBackup } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/backup")({
  head: () => ({
    meta: [
      { title: "Backup Data ke Spreadsheet - Dagang Pintar" },
      { name: "description", content: "Unduh cadangan seluruh data toko (produk, transaksi, hutang, pembukuan) ke file spreadsheet Excel." },
      { property: "og:title", content: "Backup Data ke Spreadsheet" },
      { property: "og:description", content: "Unduh cadangan seluruh data toko ke file spreadsheet Excel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BackupPage,
});

const TABLES: { name: string; label: string }[] = [
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

async function fetchAll(table: string) {
  const rows: any[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await (supabase as any)
      .from(table)
      .select("*")
      .range(from, from + size - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < size) break;
  }
  return rows;
}

function flatten(rows: any[]) {
  return rows.map((r) => {
    const o: Record<string, any> = {};
    for (const [k, v] of Object.entries(r)) {
      o[k] = v && typeof v === "object" ? JSON.stringify(v) : v;
    }
    return o;
  });
}

function BackupPage() {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [counts, setCounts] = useState<Record<string, number>>({});

  const runBackup = async (format: "xlsx" | "csv") => {
    setBusy(true);
    setProgress("Menyiapkan...");
    try {
      const wb = XLSX.utils.book_new();
      const nextCounts: Record<string, number> = {};
      for (const t of TABLES) {
        setProgress(`Mengambil ${t.label}...`);
        let rows: any[] = [];
        try {
          rows = await fetchAll(t.name);
        } catch (e: any) {
          console.warn(e);
        }
        nextCounts[t.name] = rows.length;
        const ws = XLSX.utils.json_to_sheet(rows.length ? flatten(rows) : [{ info: "kosong" }]);
        XLSX.utils.book_append_sheet(wb, ws, t.label.slice(0, 31));
      }
      setCounts(nextCounts);
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      if (format === "xlsx") {
        XLSX.writeFile(wb, `backup-dagangpintar-${stamp}.xlsx`);
      } else {
        // CSV: satu file gabungan per sheet dipisah header
        let out = "";
        for (const sheet of wb.SheetNames) {
          out += `### ${sheet}\n${XLSX.utils.sheet_to_csv(wb.Sheets[sheet]!)}\n\n`;
        }
        const blob = new Blob([out], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `backup-dagangpintar-${stamp}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      }
      toast.success("Backup berhasil diunduh");
    } catch (e: any) {
      toast.error(e?.message || "Gagal membuat backup");
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DatabaseBackup className="h-5 w-5 text-primary" /> Backup Data ke Spreadsheet
          </CardTitle>
          <CardDescription>
            Unduh seluruh data toko Anda menjadi satu file Excel (tiap tabel jadi satu sheet). Simpan file ini di Google
            Drive / Spreadsheet sebagai cadangan bila sewaktu-waktu ada data yang hilang. Untuk masuk ke Google
            Spreadsheet: buka Google Sheets → File → Impor → unggah file hasil unduhan ini.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => runBackup("xlsx")} disabled={busy}>
              <Download className="mr-1 h-4 w-4" /> {busy ? progress || "Memproses..." : "Unduh Excel (.xlsx)"}
            </Button>
            <Button variant="outline" onClick={() => runBackup("csv")} disabled={busy}>
              <Download className="mr-1 h-4 w-4" /> Unduh CSV
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {TABLES.map((t) => (
              <Badge key={t.name} variant="secondary" className="font-normal">
                {t.label}
                {counts[t.name] !== undefined ? `: ${counts[t.name]}` : ""}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Data yang diunduh hanya milik toko Anda. Lakukan backup rutin (mis. seminggu sekali).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
