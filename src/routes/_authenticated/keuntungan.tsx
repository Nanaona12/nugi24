import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatRupiah } from "@/lib/format";
import {
  TrendingUp, DollarSign, ShoppingBag, Calendar, PackageX,
  ShoppingCart, Download, AlertTriangle, FileSpreadsheet, FileText,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, Legend, PieChart, Pie, Cell,
} from "recharts";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/_authenticated/keuntungan")({
  component: KeuntunganPage,
});

type Item = {
  qty: number;
  unit_price: number;
  unit_cost: number;
  subtotal: number;
  product_name: string;
  transactions: { created_at: string } | null;
};

type Bucket = {
  key: string;
  label: string;
  revenue: number;
  cost: number;
  profit: number;
  count: number;
};

type LowStockProduct = {
  id: string;
  code: string;
  name: string;
  category: string | null;
  stock: number;
  price: number;
};

const LOW_STOCK_THRESHOLD = 5;
const CHART_COLORS = ["hsl(var(--primary))", "hsl(var(--destructive))", "#10b981", "#f59e0b", "#6366f1", "#ec4899", "#14b8a6", "#f97316"];

function KeuntunganPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [lowStock, setLowStock] = useState<LowStockProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [storeName, setStoreName] = useState<string>("Toko");
  const [exportingPdf, setExportingPdf] = useState(false);
  const chartsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const { data: t } = await supabase.from("tenants").select("name").limit(1).maybeSingle();
      if (t?.name) setStoreName(t.name);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const [itemsRes, lowRes] = await Promise.all([
        supabase
          .from("transaction_items")
          .select("qty, unit_price, unit_cost, subtotal, product_name, transactions(created_at)")
          .order("id", { ascending: false })
          .limit(5000),
        supabase
          .from("products")
          .select("id, code, name, category, stock, price")
          .lte("stock", LOW_STOCK_THRESHOLD)
          .order("stock", { ascending: true })
          .limit(100),
      ]);
      if (itemsRes.error) toast.error(itemsRes.error.message);
      else setItems((itemsRes.data || []) as unknown as Item[]);
      if (lowRes.error) toast.error(lowRes.error.message);
      else setLowStock((lowRes.data || []) as LowStockProduct[]);
      setLoading(false);
    })();
  }, []);

  const filteredItems = useMemo(() => {
    if (!fromDate && !toDate) return items;
    const from = fromDate ? new Date(fromDate + "T00:00:00") : null;
    const to = toDate ? new Date(toDate + "T23:59:59") : null;
    return items.filter((it) => {
      const at = it.transactions?.created_at;
      if (!at) return false;
      const d = new Date(at);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [items, fromDate, toDate]);

  const stats = useMemo(() => {
    const now = new Date();
    const todayKey = ymd(now);
    const monthKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
    const yearKey = String(now.getFullYear());

    let todayProfit = 0, todayRev = 0;
    let monthProfit = 0, monthRev = 0;
    let yearProfit = 0, yearRev = 0;
    let allProfit = 0, allRev = 0;
    let totalQty = 0;
    let txSet = new Set<string>();

    const dailyMap = new Map<string, Bucket>();
    const monthlyMap = new Map<string, Bucket>();
    const yearlyMap = new Map<string, Bucket>();
    const productMap = new Map<string, { name: string; qty: number; revenue: number; cost: number; profit: number }>();
    const lossMap = new Map<string, { name: string; qty: number; revenue: number; cost: number; loss: number; occurrences: number }>();

    for (const it of filteredItems) {
      const at = it.transactions?.created_at;
      if (!at) continue;
      const d = new Date(at);
      const dk = ymd(d);
      const mk = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      const yk = String(d.getFullYear());
      const rev = Number(it.subtotal);
      const cost = Number(it.unit_cost) * it.qty;
      const profit = rev - cost;

      allRev += rev; allProfit += profit; totalQty += it.qty;
      txSet.add(at);
      if (dk === todayKey) { todayRev += rev; todayProfit += profit; }
      if (mk === monthKey) { monthRev += rev; monthProfit += profit; }
      if (yk === yearKey) { yearRev += rev; yearProfit += profit; }

      bump(dailyMap, dk, dk, rev, cost, profit);
      bump(monthlyMap, mk, mk, rev, cost, profit);
      bump(yearlyMap, yk, yk, rev, cost, profit);

      const pm = productMap.get(it.product_name) || { name: it.product_name, qty: 0, revenue: 0, cost: 0, profit: 0 };
      pm.qty += it.qty; pm.revenue += rev; pm.cost += cost; pm.profit += profit;
      productMap.set(it.product_name, pm);

      if (profit < 0 && Number(it.unit_cost) > 0) {
        const lm = lossMap.get(it.product_name) || { name: it.product_name, qty: 0, revenue: 0, cost: 0, loss: 0, occurrences: 0 };
        lm.qty += it.qty; lm.revenue += rev; lm.cost += cost; lm.loss += profit; lm.occurrences += 1;
        lossMap.set(it.product_name, lm);
      }
    }

    const daily = Array.from(dailyMap.values()).sort((a, b) => a.key.localeCompare(b.key));
    const monthly = Array.from(monthlyMap.values()).sort((a, b) => a.key.localeCompare(b.key));
    const yearly = Array.from(yearlyMap.values()).sort((a, b) => a.key.localeCompare(b.key));
    const topProducts = Array.from(productMap.values()).sort((a, b) => b.profit - a.profit);
    const lossMakers = Array.from(lossMap.values()).sort((a, b) => a.loss - b.loss);

    return {
      todayProfit, todayRev, monthProfit, monthRev, yearProfit, yearRev,
      allProfit, allRev, totalQty, txCount: txSet.size,
      daily, monthly, yearly, topProducts, lossMakers,
    };
  }, [filteredItems]);

  function exportExcel() {
    const wb = XLSX.utils.book_new();

    const summary = [
      ["Laporan Keuntungan"],
      ["Diekspor", new Date().toLocaleString("id-ID")],
      ["Rentang", `${fromDate || "awal"} s/d ${toDate || "sekarang"}`],
      [],
      ["Metrik", "Nilai"],
      ["Total Omset", stats.allRev],
      ["Total Modal", stats.allRev - stats.allProfit],
      ["Total Keuntungan", stats.allProfit],
      ["Margin Rata-rata (%)", stats.allRev > 0 ? Number(((stats.allProfit / stats.allRev) * 100).toFixed(2)) : 0],
      ["Jumlah Transaksi", stats.txCount],
      ["Total Item Terjual", stats.totalQty],
      ["Keuntungan Hari Ini", stats.todayProfit],
      ["Omset Hari Ini", stats.todayRev],
      ["Keuntungan Bulan Ini", stats.monthProfit],
      ["Omset Bulan Ini", stats.monthRev],
      ["Keuntungan Tahun Ini", stats.yearProfit],
      ["Omset Tahun Ini", stats.yearRev],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Ringkasan");

    const bucketRows = (arr: Bucket[], labelFn: (k: string) => string) => [
      ["Periode", "Omset", "Modal", "Keuntungan", "Margin (%)", "Jumlah Item"],
      ...arr.map((r) => [
        labelFn(r.key), r.revenue, r.cost, r.profit,
        r.revenue > 0 ? Number(((r.profit / r.revenue) * 100).toFixed(2)) : 0,
        r.count,
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bucketRows(stats.daily, formatDate)), "Harian");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bucketRows(stats.monthly, formatMonth)), "Bulanan");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bucketRows(stats.yearly, (k) => k)), "Tahunan");

    const productRows = [
      ["Produk", "Qty Terjual", "Omset", "Modal", "Keuntungan", "Margin (%)"],
      ...stats.topProducts.map((p) => [
        p.name, p.qty, p.revenue, p.cost, p.profit,
        p.revenue > 0 ? Number(((p.profit / p.revenue) * 100).toFixed(2)) : 0,
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(productRows), "Produk");

    if (stats.lossMakers.length > 0) {
      const lossRows = [
        ["Produk", "Qty", "Omset", "Modal", "Total Kerugian", "Kejadian"],
        ...stats.lossMakers.map((l) => [l.name, l.qty, l.revenue, l.cost, l.loss, l.occurrences]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lossRows), "Rugi");
    }

    if (lowStock.length > 0) {
      const lowRows = [
        ["Kode", "Nama", "Kategori", "Sisa Stok", "Harga", "Status"],
        ...lowStock.map((p) => [p.code, p.name, p.category || "-", p.stock, Number(p.price), p.stock <= 0 ? "Habis" : "Menipis"]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lowRows), "Stok Menipis");
    }

    const ts = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Laporan-Keuntungan-${ts}.xlsx`);
    toast.success("Laporan Excel berhasil diunduh");
  }

  function exportCSV() {
    const header = ["Tanggal", "Omset", "Modal", "Keuntungan", "Margin %", "Jumlah Item"];
    const rows = stats.daily.map((r) => [
      formatDate(r.key), r.revenue, r.cost, r.profit,
      r.revenue > 0 ? ((r.profit / r.revenue) * 100).toFixed(2) : "0", r.count,
    ]);
    const csv = [header, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `Keuntungan-Harian-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV berhasil diunduh");
  }

  async function exportPDF() {
    setExportingPdf(true);
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 12;
      const now = new Date();
      const rangeText = `${fromDate || "Awal"} s/d ${toDate || ymd(now)}`;

      // ===== HEADER =====
      doc.setFillColor(234, 88, 12); // primary orange
      doc.rect(0, 0, pageW, 26, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(storeName, margin, 12);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text("Laporan Keuntungan", margin, 19);
      doc.setFontSize(8);
      doc.text(`Diekspor: ${now.toLocaleString("id-ID")}`, pageW - margin, 12, { align: "right" });
      doc.text(`Periode: ${rangeText}`, pageW - margin, 18, { align: "right" });

      let y = 34;
      doc.setTextColor(20, 20, 20);

      // ===== KPI CARDS =====
      const kpis = [
        { label: "Total Omset", value: formatRupiah(stats.allRev), color: [59, 130, 246] as [number, number, number] },
        { label: "Total Modal", value: formatRupiah(stats.allRev - stats.allProfit), color: [148, 163, 184] as [number, number, number] },
        { label: "Total Keuntungan", value: formatRupiah(stats.allProfit), color: stats.allProfit >= 0 ? [16, 185, 129] as [number, number, number] : [220, 38, 38] as [number, number, number] },
        { label: "Margin", value: `${stats.allRev > 0 ? ((stats.allProfit / stats.allRev) * 100).toFixed(1) : 0}%`, color: [234, 88, 12] as [number, number, number] },
      ];
      const cardW = (pageW - margin * 2 - 6) / 4;
      kpis.forEach((k, i) => {
        const x = margin + i * (cardW + 2);
        doc.setFillColor(245, 245, 245);
        doc.roundedRect(x, y, cardW, 22, 2, 2, "F");
        doc.setFillColor(k.color[0], k.color[1], k.color[2]);
        doc.rect(x, y, 2, 22, "F");
        doc.setFontSize(7);
        doc.setTextColor(100, 100, 100);
        doc.text(k.label.toUpperCase(), x + 4, y + 6);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(k.color[0], k.color[1], k.color[2]);
        doc.text(k.value, x + 4, y + 15);
        doc.setFont("helvetica", "normal");
      });
      y += 28;

      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`Transaksi: ${stats.txCount}   •   Item terjual: ${stats.totalQty}   •   Hari ini: ${formatRupiah(stats.todayProfit)}   •   Bulan ini: ${formatRupiah(stats.monthProfit)}`, margin, y);
      y += 6;

      // ===== CHARTS (capture from DOM) =====
      if (chartsRef.current) {
        try {
          const canvas = await html2canvas(chartsRef.current, { scale: 2, backgroundColor: "#ffffff", logging: false });
          const imgData = canvas.toDataURL("image/png");
          const imgW = pageW - margin * 2;
          const imgH = (canvas.height * imgW) / canvas.width;
          if (y + imgH > pageH - margin) { doc.addPage(); y = margin; }
          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.setTextColor(20, 20, 20);
          doc.text("Grafik Analitik", margin, y);
          y += 4;
          doc.addImage(imgData, "PNG", margin, y, imgW, Math.min(imgH, pageH - margin - y));
          y += Math.min(imgH, pageH - margin - y) + 6;
        } catch (e) {
          console.warn("chart capture failed", e);
        }
      }

      // ===== LOSS MAKERS (root cause) =====
      if (stats.lossMakers.length > 0) {
        if (y > pageH - 60) { doc.addPage(); y = margin; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(220, 38, 38);
        doc.text("Produk Dijual di Bawah Modal (Penyebab Rugi)", margin, y);
        y += 2;
        autoTable(doc, {
          startY: y + 2,
          head: [["Produk", "Qty", "Omset", "Modal", "Kerugian", "Kejadian"]],
          body: stats.lossMakers.slice(0, 15).map((l) => [
            l.name, l.qty, formatRupiah(l.revenue), formatRupiah(l.cost), formatRupiah(l.loss), `${l.occurrences}x`,
          ]),
          theme: "striped",
          headStyles: { fillColor: [220, 38, 38], textColor: 255, fontSize: 8 },
          bodyStyles: { fontSize: 8 },
          margin: { left: margin, right: margin },
          columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right", textColor: [220, 38, 38] }, 5: { halign: "right" } },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
      }

      // ===== TOP PRODUCTS =====
      if (stats.topProducts.length > 0) {
        if (y > pageH - 60) { doc.addPage(); y = margin; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(20, 20, 20);
        doc.text("Produk Terlaris (Top 20)", margin, y);
        autoTable(doc, {
          startY: y + 2,
          head: [["Produk", "Qty", "Omset", "Modal", "Untung", "Margin"]],
          body: stats.topProducts.slice(0, 20).map((p) => [
            p.name, p.qty, formatRupiah(p.revenue), formatRupiah(p.cost), formatRupiah(p.profit),
            `${p.revenue > 0 ? ((p.profit / p.revenue) * 100).toFixed(1) : 0}%`,
          ]),
          theme: "striped",
          headStyles: { fillColor: [234, 88, 12], textColor: 255, fontSize: 8 },
          bodyStyles: { fontSize: 8 },
          margin: { left: margin, right: margin },
          columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
      }

      // ===== DAILY =====
      if (stats.daily.length > 0) {
        if (y > pageH - 60) { doc.addPage(); y = margin; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(20, 20, 20);
        doc.text("Rincian Per Hari", margin, y);
        const dailyRows = [...stats.daily].reverse().slice(0, 60);
        autoTable(doc, {
          startY: y + 2,
          head: [["Tanggal", "Omset", "Modal", "Keuntungan", "Margin"]],
          body: dailyRows.map((r) => [
            formatDate(r.key), formatRupiah(r.revenue), formatRupiah(r.cost), formatRupiah(r.profit),
            `${r.revenue > 0 ? ((r.profit / r.revenue) * 100).toFixed(1) : 0}%`,
          ]),
          foot: [[
            "TOTAL",
            formatRupiah(dailyRows.reduce((s, r) => s + r.revenue, 0)),
            formatRupiah(dailyRows.reduce((s, r) => s + r.cost, 0)),
            formatRupiah(dailyRows.reduce((s, r) => s + r.profit, 0)),
            "",
          ]],
          theme: "striped",
          headStyles: { fillColor: [234, 88, 12], textColor: 255, fontSize: 8 },
          footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: "bold", fontSize: 8 },
          bodyStyles: { fontSize: 8 },
          margin: { left: margin, right: margin },
          columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
        });
      }

      // ===== FOOTER on every page =====
      const total = doc.getNumberOfPages();
      for (let i = 1; i <= total; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.text(`${storeName} • Laporan Keuntungan`, margin, pageH - 6);
        doc.text(`Halaman ${i} dari ${total}`, pageW - margin, pageH - 6, { align: "right" });
      }

      const fname = `Laporan-Keuntungan-${storeName.replace(/\s+/g, "-")}-${ymd(now)}.pdf`;
      doc.save(fname);
      toast.success("Laporan PDF berhasil diunduh");
    } catch (e) {
      console.error(e);
      toast.error("Gagal membuat PDF");
    } finally {
      setExportingPdf(false);
    }
  }


  if (loading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Memuat data keuntungan...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Filter + Export Toolbar */}
      <Card className="flex flex-wrap items-end gap-3 p-3">
        <div className="grid gap-1">
          <Label className="text-xs">Dari Tanggal</Label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 w-[160px]" />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Sampai Tanggal</Label>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9 w-[160px]" />
        </div>
        <Button variant="outline" size="sm" onClick={() => { setFromDate(""); setToDate(""); }}>Reset</Button>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={exportCSV}>
            <Download className="mr-1 h-4 w-4" /> CSV
          </Button>
          <Button size="sm" variant="secondary" onClick={exportPDF} disabled={exportingPdf}>
            <FileText className="mr-1 h-4 w-4" /> {exportingPdf ? "Membuat PDF..." : "Export PDF"}
          </Button>
          <Button size="sm" onClick={exportExcel}>
            <FileSpreadsheet className="mr-1 h-4 w-4" /> Export Excel
          </Button>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<Calendar className="h-5 w-5" />} label="Keuntungan Hari Ini" value={formatRupiah(stats.todayProfit)} sub={`Omset ${formatRupiah(stats.todayRev)}`} tone="primary" />
        <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Keuntungan Bulan Ini" value={formatRupiah(stats.monthProfit)} sub={`Omset ${formatRupiah(stats.monthRev)}`} tone="success" />
        <StatCard icon={<DollarSign className="h-5 w-5" />} label="Keuntungan Tahun Ini" value={formatRupiah(stats.yearProfit)} sub={`Omset ${formatRupiah(stats.yearRev)}`} />
        <StatCard icon={<ShoppingBag className="h-5 w-5" />} label="Total Keuntungan" value={formatRupiah(stats.allProfit)} sub={`${stats.txCount} transaksi • ${stats.totalQty} item`} />
      </div>

      {stats.lossMakers.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Penyebab Keuntungan Minus — {stats.lossMakers.length} produk dijual di bawah modal
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Produk berikut harga jualnya lebih rendah dari harga modal. Naikkan harga jual (terutama tier grosir/slove) atau perbaiki harga modal di menu Produk.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2">Produk</th>
                  <th className="p-2 text-right">Qty</th>
                  <th className="p-2 text-right">Omset</th>
                  <th className="p-2 text-right">Modal</th>
                  <th className="p-2 text-right">Kerugian</th>
                  <th className="p-2 text-right">Kejadian</th>
                </tr>
              </thead>
              <tbody>
                {stats.lossMakers.slice(0, 8).map((l) => (
                  <tr key={l.name} className="border-t">
                    <td className="p-2 font-medium">{l.name}</td>
                    <td className="p-2 text-right">{l.qty}</td>
                    <td className="p-2 text-right">{formatRupiah(l.revenue)}</td>
                    <td className="p-2 text-right text-muted-foreground">{formatRupiah(l.cost)}</td>
                    <td className="p-2 text-right font-semibold text-destructive">{formatRupiah(l.loss)}</td>
                    <td className="p-2 text-right">
                      <Badge variant="destructive">{l.occurrences}×</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {filteredItems.length === 0 && (
        <Card className="p-6 text-sm text-muted-foreground">
          Belum ada data transaksi pada rentang ini.
        </Card>
      )}

      {/* Charts */}
      {stats.daily.length > 0 && (
        <div ref={chartsRef} className="grid gap-3 lg:grid-cols-2">
          <Card className="p-4">
            <div className="mb-3 text-sm font-semibold">Tren Omset & Keuntungan Harian</div>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={stats.daily.slice(-30).map((d) => ({ tgl: d.key.slice(5), Omset: d.revenue, Keuntungan: d.profit }))}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="tgl" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatRupiah(v)} />
                <Legend />
                <Line type="monotone" dataKey="Omset" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Keuntungan" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-4">
            <div className="mb-3 text-sm font-semibold">Top 8 Produk Berdasarkan Keuntungan</div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stats.topProducts.slice(0, 8).map((p) => ({ name: p.name.length > 12 ? p.name.slice(0, 12) + "…" : p.name, Keuntungan: p.profit }))}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" fontSize={10} angle={-20} textAnchor="end" height={60} />
                <YAxis fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatRupiah(v)} />
                <Bar dataKey="Keuntungan" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {stats.monthly.length > 1 && (
            <Card className="p-4">
              <div className="mb-3 text-sm font-semibold">Perbandingan Modal vs Omset (Bulanan)</div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={stats.monthly.slice(-12).map((m) => ({ bln: m.key, Omset: m.revenue, Modal: m.cost, Keuntungan: m.profit }))}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="bln" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => formatRupiah(v)} />
                  <Legend />
                  <Bar dataKey="Omset" fill="hsl(var(--primary))" />
                  <Bar dataKey="Modal" fill="#f59e0b" />
                  <Bar dataKey="Keuntungan" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          {stats.topProducts.length > 0 && (
            <Card className="p-4">
              <div className="mb-3 text-sm font-semibold">Komposisi Omset Top 6 Produk</div>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={stats.topProducts.slice(0, 6).map((p) => ({ name: p.name, value: p.revenue }))}
                    dataKey="value" nameKey="name" outerRadius={90} label={(e) => e.name}
                  >
                    {stats.topProducts.slice(0, 6).map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatRupiah(v)} />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          )}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b bg-muted/40 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <PackageX className="h-4 w-4 text-destructive" />
            Produk Habis / Stok Menipis
            <Badge variant="secondary">{lowStock.length}</Badge>
          </div>
          <Button asChild size="sm" variant="default">
            <Link to="/po"><ShoppingCart className="mr-1 h-4 w-4" />Buat PO</Link>
          </Button>
        </div>
        {lowStock.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Semua produk masih memiliki stok aman (&gt; {LOW_STOCK_THRESHOLD}).
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Kode</th>
                  <th className="p-3">Nama Produk</th>
                  <th className="p-3">Kategori</th>
                  <th className="p-3 text-right">Sisa Stok</th>
                  <th className="p-3 text-right">Harga</th>
                  <th className="p-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.map((p) => (
                  <tr key={p.id} className="border-t hover:bg-muted/40">
                    <td className="p-3 font-mono text-xs">{p.code}</td>
                    <td className="p-3 font-medium">{p.name}</td>
                    <td className="p-3 text-muted-foreground">{p.category || "-"}</td>
                    <td className="p-3 text-right font-semibold">{p.stock}</td>
                    <td className="p-3 text-right">{formatRupiah(Number(p.price))}</td>
                    <td className="p-3 text-right">
                      {p.stock <= 0 ? <Badge variant="destructive">Habis</Badge> : <Badge variant="secondary">Menipis</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Tabs defaultValue="daily">
        <TabsList>
          <TabsTrigger value="daily">Per Hari</TabsTrigger>
          <TabsTrigger value="monthly">Per Bulan</TabsTrigger>
          <TabsTrigger value="yearly">Per Tahun</TabsTrigger>
          <TabsTrigger value="products">Produk Terlaris</TabsTrigger>
        </TabsList>

        <TabsContent value="daily">
          <BucketTable rows={[...stats.daily].reverse().slice(0, 60)} labelHeader="Tanggal" formatLabel={(k) => formatDate(k)} />
        </TabsContent>
        <TabsContent value="monthly">
          <BucketTable rows={[...stats.monthly].reverse().slice(0, 24)} labelHeader="Bulan" formatLabel={(k) => formatMonth(k)} />
        </TabsContent>
        <TabsContent value="yearly">
          <BucketTable rows={[...stats.yearly].reverse()} labelHeader="Tahun" formatLabel={(k) => k} />
        </TabsContent>
        <TabsContent value="products">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-3">Produk</th>
                    <th className="p-3 text-right">Qty Terjual</th>
                    <th className="p-3 text-right">Omset</th>
                    <th className="p-3 text-right">Keuntungan</th>
                    <th className="p-3 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.topProducts.length === 0 ? (
                    <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Belum ada data</td></tr>
                  ) : stats.topProducts.slice(0, 30).map((p) => {
                    const margin = p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0;
                    return (
                      <tr key={p.name} className="border-t hover:bg-muted/40">
                        <td className="p-3 font-medium">{p.name}</td>
                        <td className="p-3 text-right">{p.qty}</td>
                        <td className="p-3 text-right">{formatRupiah(p.revenue)}</td>
                        <td className={`p-3 text-right font-semibold ${p.profit < 0 ? "text-destructive" : "text-primary"}`}>{formatRupiah(p.profit)}</td>
                        <td className="p-3 text-right">
                          <Badge variant={margin >= 20 ? "default" : margin < 0 ? "destructive" : "secondary"}>{margin.toFixed(1)}%</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BucketTable({ rows, labelHeader, formatLabel }: { rows: Bucket[]; labelHeader: string; formatLabel: (k: string) => string }) {
  const totals = rows.reduce(
    (acc, r) => ({ revenue: acc.revenue + r.revenue, cost: acc.cost + r.cost, profit: acc.profit + r.profit, count: acc.count + r.count }),
    { revenue: 0, cost: 0, profit: 0, count: 0 },
  );
  const totalMargin = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;
  return (
    <Card className="overflow-hidden">
      {rows.length > 0 && (
        <div className="grid gap-3 border-b bg-muted/40 p-3 sm:grid-cols-4">
          <SummaryItem label="Total Omset" value={formatRupiah(totals.revenue)} />
          <SummaryItem label="Total Modal" value={formatRupiah(totals.cost)} muted />
          <SummaryItem label="Total Keuntungan" value={formatRupiah(totals.profit)} accent />
          <SummaryItem label="Margin Rata-rata" value={`${totalMargin.toFixed(1)}%`} />
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3">{labelHeader}</th>
              <th className="p-3 text-right">Omset</th>
              <th className="p-3 text-right">Modal</th>
              <th className="p-3 text-right">Keuntungan</th>
              <th className="p-3 text-right">Margin</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Belum ada data</td></tr>
            ) : rows.map((r) => {
              const margin = r.revenue > 0 ? (r.profit / r.revenue) * 100 : 0;
              return (
                <tr key={r.key} className="border-t hover:bg-muted/40">
                  <td className="p-3 font-medium">{formatLabel(r.key)}</td>
                  <td className="p-3 text-right">{formatRupiah(r.revenue)}</td>
                  <td className="p-3 text-right text-muted-foreground">{formatRupiah(r.cost)}</td>
                  <td className={`p-3 text-right font-semibold ${r.profit < 0 ? "text-destructive" : "text-primary"}`}>{formatRupiah(r.profit)}</td>
                  <td className="p-3 text-right">
                    <Badge variant={margin >= 20 ? "default" : margin < 0 ? "destructive" : "secondary"}>{margin.toFixed(1)}%</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-muted/60 font-semibold">
              <tr className="border-t">
                <td className="p-3">TOTAL</td>
                <td className="p-3 text-right">{formatRupiah(totals.revenue)}</td>
                <td className="p-3 text-right text-muted-foreground">{formatRupiah(totals.cost)}</td>
                <td className={`p-3 text-right ${totals.profit < 0 ? "text-destructive" : "text-primary"}`}>{formatRupiah(totals.profit)}</td>
                <td className="p-3 text-right">{totalMargin.toFixed(1)}%</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
  );
}

function SummaryItem({ label, value, accent, muted }: { label: string; value: string; accent?: boolean; muted?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-bold ${accent ? "text-primary" : muted ? "text-muted-foreground" : ""}`}>{value}</div>
    </div>
  );
}

function StatCard({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: "primary" | "success" }) {
  const toneCls = tone === "primary" ? "text-primary" : tone === "success" ? "text-success" : "text-foreground";
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
        <span className={toneCls}>{icon}</span>
        {label}
      </div>
      <div className={`mt-2 text-2xl font-bold ${toneCls}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}

function bump(m: Map<string, Bucket>, key: string, label: string, rev: number, cost: number, profit: number) {
  const b = m.get(key) || { key, label, revenue: 0, cost: 0, profit: 0, count: 0 };
  b.revenue += rev; b.cost += cost; b.profit += profit; b.count += 1;
  m.set(key, b);
}
function pad(n: number) { return String(n).padStart(2, "0"); }
function ymd(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function formatDate(k: string) {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}
function formatMonth(k: string) {
  const [y, m] = k.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}
