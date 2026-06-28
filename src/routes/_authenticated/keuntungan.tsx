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
  TrendingUp,
  DollarSign,
  ShoppingBag,
  Calendar,
  Download,
  AlertTriangle,
  FileSpreadsheet,
  FileText,
  AlarmClock,
  Boxes,
  BarChart3,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
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

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--destructive))",
  "#10b981",
  "#f59e0b",
  "#6366f1",
  "#ec4899",
  "#14b8a6",
  "#f97316",
];

function KeuntunganPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [txs, setTxs] = useState<{ created_at: string; total: number; payment_method: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [storeName, setStoreName] = useState<string>("Toko");
  const [exportingPdf, setExportingPdf] = useState(false);
  const [actualCash, setActualCash] = useState<string>("");
  const [actualQris, setActualQris] = useState<string>("");
  const [expirySummary, setExpirySummary] = useState<{ expired: number; le30: number; le60: number; le90: number }>({
    expired: 0,
    le30: 0,
    le60: 0,
    le90: 0,
  });
  const [assetSummary, setAssetSummary] = useState<{
    totalValue: number;
    totalUnits: number;
    productCount: number;
    topProducts: { name: string; qty: number; value: number }[];
  }>({ totalValue: 0, totalUnits: 0, productCount: 0, topProducts: [] });
  const chartsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const { data: t } = await supabase.from("tenants").select("name").limit(1).maybeSingle();
      if (t?.name) setStoreName(t.name);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const [itemsRes, txRes] = await Promise.all([
        supabase
          .from("transaction_items")
          .select(
            "qty, unit_price, unit_cost, subtotal, product_name, product_id, products(category), transactions(created_at)",
          )
          .order("id", { ascending: false })
          .limit(5000),
        supabase
          .from("transactions")
          .select("created_at, total, payment_method")
          .order("created_at", { ascending: false })
          .limit(5000),
      ]);
      if (itemsRes.error) toast.error(itemsRes.error.message);
      else setItems((itemsRes.data || []) as unknown as Item[]);
      if (!txRes.error) setTxs((txRes.data || []) as { created_at: string; total: number; payment_method: string }[]);

      const { data: batches } = await (supabase as any).from("product_batches").select("product_id, qty, expiry_date");
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const sum = { expired: 0, le30: 0, le60: 0, le90: 0 };
      const batchQtyByProduct = new Map<string, number>();
      for (const b of (batches || []) as { product_id: string; qty: number; expiry_date: string }[]) {
        batchQtyByProduct.set(b.product_id, (batchQtyByProduct.get(b.product_id) || 0) + (Number(b.qty) || 0));
        const d = Math.ceil((new Date(b.expiry_date + "T00:00:00").getTime() - today.getTime()) / 86400000);
        if (d < 0) sum.expired++;
        else if (d <= 30) sum.le30++;
        else if (d <= 60) sum.le60++;
        else if (d <= 90) sum.le90++;
      }
      setExpirySummary(sum);

      // Total Aset: harga modal × qty (pakai batch kalau ada, fallback stok produk)
      const { data: allProducts } = await supabase.from("products").select("id, name, cost_price, stock");
      let totalValue = 0,
        totalUnits = 0,
        productCount = 0;
      const assetRows: { name: string; qty: number; value: number }[] = [];
      for (const p of (allProducts || []) as { id: string; name: string; cost_price: number; stock: number }[]) {
        const batchQty = batchQtyByProduct.get(p.id) || 0;
        const qty = batchQty > 0 ? batchQty : Number(p.stock) || 0;
        if (qty <= 0) continue;
        const value = (Number(p.cost_price) || 0) * qty;
        totalValue += value;
        totalUnits += qty;
        productCount++;
        assetRows.push({ name: p.name, qty, value });
      }
      assetRows.sort((a, b) => b.value - a.value);
      setAssetSummary({ totalValue, totalUnits, productCount, topProducts: assetRows.slice(0, 10) });

      setLoading(false);
    })();
  }, []);

  const reconcile = useMemo(() => {
    const from = fromDate ? new Date(fromDate + "T00:00:00") : null;
    const to = toDate ? new Date(toDate + "T23:59:59") : null;
    let cash = 0,
      qris = 0,
      other = 0,
      cashCount = 0,
      qrisCount = 0;
    for (const t of txs) {
      const d = new Date(t.created_at);
      if (from && d < from) continue;
      if (to && d > to) continue;
      const total = Number(t.total) || 0;
      const m = (t.payment_method || "cash").toLowerCase();
      if (m === "cash" || m === "tunai") {
        cash += total;
        cashCount++;
      } else if (m === "qris" || m === "qr") {
        qris += total;
        qrisCount++;
      } else other += total;
    }
    const aCash = Number(actualCash.replace(/[^\d-]/g, "")) || 0;
    const aQris = Number(actualQris.replace(/[^\d-]/g, "")) || 0;
    return {
      cash,
      qris,
      other,
      cashCount,
      qrisCount,
      actualCash: aCash,
      actualQris: aQris,
      diffCash: aCash - cash,
      diffQris: aQris - qris,
    };
  }, [txs, fromDate, toDate, actualCash, actualQris]);

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

    let todayProfit = 0,
      todayRev = 0;
    let monthProfit = 0,
      monthRev = 0;
    let yearProfit = 0,
      yearRev = 0;
    let allProfit = 0,
      allRev = 0;
    let totalQty = 0;
    let txSet = new Set<string>();

    const dailyMap = new Map<string, Bucket>();
    const monthlyMap = new Map<string, Bucket>();
    const yearlyMap = new Map<string, Bucket>();
    const productMap = new Map<string, { name: string; qty: number; revenue: number; cost: number; profit: number }>();
    const categoryMap = new Map<
      string | null,
      { category: string | null; revenue: number; cost: number; profit: number; count: number }
    >();
    const lossMap = new Map<
      string,
      { name: string; qty: number; revenue: number; cost: number; loss: number; occurrences: number }
    >();

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

      allRev += rev;
      allProfit += profit;
      totalQty += it.qty;
      txSet.add(at);
      if (dk === todayKey) {
        todayRev += rev;
        todayProfit += profit;
      }
      if (mk === monthKey) {
        monthRev += rev;
        monthProfit += profit;
      }
      if (yk === yearKey) {
        yearRev += rev;
        yearProfit += profit;
      }

      bump(dailyMap, dk, dk, rev, cost, profit);
      bump(monthlyMap, mk, mk, rev, cost, profit);
      bump(yearlyMap, yk, yk, rev, cost, profit);

      const pm = productMap.get(it.product_name) || { name: it.product_name, qty: 0, revenue: 0, cost: 0, profit: 0 };
      pm.qty += it.qty;
      pm.revenue += rev;
      pm.cost += cost;
      pm.profit += profit;
      productMap.set(it.product_name, pm);

      // category aggregation (if available)
      const cat = (it as any).products?.category ?? null;
      const cm = categoryMap.get(cat) || { category: cat, revenue: 0, cost: 0, profit: 0, count: 0 };
      cm.revenue += rev;
      cm.cost += cost;
      cm.profit += profit;
      cm.count += it.qty;
      categoryMap.set(cat, cm);

      if (profit < 0 && Number(it.unit_cost) > 0) {
        const lm = lossMap.get(it.product_name) || {
          name: it.product_name,
          qty: 0,
          revenue: 0,
          cost: 0,
          loss: 0,
          occurrences: 0,
        };
        lm.qty += it.qty;
        lm.revenue += rev;
        lm.cost += cost;
        lm.loss += profit;
        lm.occurrences += 1;
        lossMap.set(it.product_name, lm);
      }
    }

    const daily = Array.from(dailyMap.values()).sort((a, b) => a.key.localeCompare(b.key));
    const monthly = Array.from(monthlyMap.values()).sort((a, b) => a.key.localeCompare(b.key));
    const yearly = Array.from(yearlyMap.values()).sort((a, b) => a.key.localeCompare(b.key));
    const topProducts = Array.from(productMap.values()).sort((a, b) => b.profit - a.profit);
    const categories = Array.from(categoryMap.values()).sort((a, b) => b.revenue - a.revenue);
    const lossMakers = Array.from(lossMap.values()).sort((a, b) => a.loss - b.loss);

    return {
      todayProfit,
      todayRev,
      monthProfit,
      monthRev,
      yearProfit,
      yearRev,
      categories,
      allProfit,
      allRev,
      totalQty,
      txCount: txSet.size,
      daily,
      monthly,
      yearly,
      topProducts,
      lossMakers,
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
        labelFn(r.key),
        r.revenue,
        r.cost,
        r.profit,
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
        p.name,
        p.qty,
        p.revenue,
        p.cost,
        p.profit,
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

    const ts = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Laporan-Keuntungan-${ts}.xlsx`);
    toast.success("Laporan Excel berhasil diunduh");
  }

  function exportCSV() {
    const header = ["Tanggal", "Omset", "Modal", "Keuntungan", "Margin %", "Jumlah Item"];
    const rows = stats.daily.map((r) => [
      formatDate(r.key),
      r.revenue,
      r.cost,
      r.profit,
      r.revenue > 0 ? ((r.profit / r.revenue) * 100).toFixed(2) : "0",
      r.count,
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Keuntungan-Harian-${new Date().toISOString().slice(0, 10)}.csv`;
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
        {
          label: "Total Modal",
          value: formatRupiah(stats.allRev - stats.allProfit),
          color: [148, 163, 184] as [number, number, number],
        },
        {
          label: "Total Keuntungan",
          value: formatRupiah(stats.allProfit),
          color:
            stats.allProfit >= 0
              ? ([16, 185, 129] as [number, number, number])
              : ([220, 38, 38] as [number, number, number]),
        },
        {
          label: "Margin",
          value: `${stats.allRev > 0 ? ((stats.allProfit / stats.allRev) * 100).toFixed(1) : 0}%`,
          color: [234, 88, 12] as [number, number, number],
        },
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
      doc.text(
        `Transaksi: ${stats.txCount}   •   Item terjual: ${stats.totalQty}   •   Hari ini: ${formatRupiah(stats.todayProfit)}   •   Bulan ini: ${formatRupiah(stats.monthProfit)}`,
        margin,
        y,
      );
      y += 6;

      // ===== CHARTS (capture from DOM) =====
      if (chartsRef.current) {
        try {
          const canvas = await html2canvas(chartsRef.current, { scale: 2, backgroundColor: "#ffffff", logging: false });
          const imgData = canvas.toDataURL("image/png");
          const imgW = pageW - margin * 2;
          const imgH = (canvas.height * imgW) / canvas.width;
          if (y + imgH > pageH - margin) {
            doc.addPage();
            y = margin;
          }
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
        if (y > pageH - 60) {
          doc.addPage();
          y = margin;
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(220, 38, 38);
        doc.text("Produk Dijual di Bawah Modal (Penyebab Rugi)", margin, y);
        y += 2;
        autoTable(doc, {
          startY: y + 2,
          head: [["Produk", "Qty", "Omset", "Modal", "Kerugian", "Kejadian"]],
          body: stats.lossMakers
            .slice(0, 15)
            .map((l) => [
              l.name,
              l.qty,
              formatRupiah(l.revenue),
              formatRupiah(l.cost),
              formatRupiah(l.loss),
              `${l.occurrences}x`,
            ]),
          theme: "striped",
          headStyles: { fillColor: [220, 38, 38], textColor: 255, fontSize: 8 },
          bodyStyles: { fontSize: 8 },
          margin: { left: margin, right: margin },
          columnStyles: {
            1: { halign: "right" },
            2: { halign: "right" },
            3: { halign: "right" },
            4: { halign: "right", textColor: [220, 38, 38] },
            5: { halign: "right" },
          },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
      }

      // ===== TOP PRODUCTS =====
      if (stats.topProducts.length > 0) {
        if (y > pageH - 60) {
          doc.addPage();
          y = margin;
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(20, 20, 20);
        doc.text("Produk Terlaris (Top 20)", margin, y);
        autoTable(doc, {
          startY: y + 2,
          head: [["Produk", "Qty", "Omset", "Modal", "Untung", "Margin"]],
          body: stats.topProducts
            .slice(0, 20)
            .map((p) => [
              p.name,
              p.qty,
              formatRupiah(p.revenue),
              formatRupiah(p.cost),
              formatRupiah(p.profit),
              `${p.revenue > 0 ? ((p.profit / p.revenue) * 100).toFixed(1) : 0}%`,
            ]),
          theme: "striped",
          headStyles: { fillColor: [234, 88, 12], textColor: 255, fontSize: 8 },
          bodyStyles: { fontSize: 8 },
          margin: { left: margin, right: margin },
          columnStyles: {
            1: { halign: "right" },
            2: { halign: "right" },
            3: { halign: "right" },
            4: { halign: "right" },
            5: { halign: "right" },
          },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
      }

      // ===== DAILY =====
      if (stats.daily.length > 0) {
        if (y > pageH - 60) {
          doc.addPage();
          y = margin;
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(20, 20, 20);
        doc.text("Rincian Per Hari", margin, y);
        const dailyRows = [...stats.daily].reverse().slice(0, 60);
        autoTable(doc, {
          startY: y + 2,
          head: [["Tanggal", "Omset", "Modal", "Keuntungan", "Margin"]],
          body: dailyRows.map((r) => [
            formatDate(r.key),
            formatRupiah(r.revenue),
            formatRupiah(r.cost),
            formatRupiah(r.profit),
            `${r.revenue > 0 ? ((r.profit / r.revenue) * 100).toFixed(1) : 0}%`,
          ]),
          foot: [
            [
              "TOTAL",
              formatRupiah(dailyRows.reduce((s, r) => s + r.revenue, 0)),
              formatRupiah(dailyRows.reduce((s, r) => s + r.cost, 0)),
              formatRupiah(dailyRows.reduce((s, r) => s + r.profit, 0)),
              "",
            ],
          ],
          theme: "striped",
          headStyles: { fillColor: [234, 88, 12], textColor: 255, fontSize: 8 },
          footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: "bold", fontSize: 8 },
          bodyStyles: { fontSize: 8 },
          margin: { left: margin, right: margin },
          columnStyles: {
            1: { halign: "right" },
            2: { halign: "right" },
            3: { halign: "right" },
            4: { halign: "right" },
          },
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setFromDate("");
            setToDate("");
          }}
        >
          Reset
        </Button>
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

      {/* Omset per Kategori */}
      {stats.categories && stats.categories.length > 0 && (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <BarChart3 className="h-4 w-4 text-primary" />
              Omset per Kategori
            </div>
            <div className="text-xs text-muted-foreground">Ringkasan omset berdasarkan kategori produk</div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {stats.categories.slice(0, 8).map((c: any) => (
              <div key={c.category ?? "-"} className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">{c.category || "Lainnya"}</div>
                <div className="mt-1 text-lg font-semibold">{formatRupiah(c.revenue)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Calendar className="h-5 w-5" />}
          label="Keuntungan Hari Ini"
          value={formatRupiah(stats.todayProfit)}
          sub={`Omset ${formatRupiah(stats.todayRev)}`}
          tone="primary"
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Keuntungan Bulan Ini"
          value={formatRupiah(stats.monthProfit)}
          sub={`Omset ${formatRupiah(stats.monthRev)}`}
          tone="success"
        />
        <StatCard
          icon={<DollarSign className="h-5 w-5" />}
          label="Keuntungan Tahun Ini"
          value={formatRupiah(stats.yearProfit)}
          sub={`Omset ${formatRupiah(stats.yearRev)}`}
        />
        <StatCard
          icon={<ShoppingBag className="h-5 w-5" />}
          label="Total Keuntungan"
          value={formatRupiah(stats.allProfit)}
          sub={`${stats.txCount} transaksi • ${stats.totalQty} item`}
        />
      </div>

      {/* Total Aset (Nilai Inventori) */}
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Boxes className="h-4 w-4 text-primary" />
            Total Aset Inventori (Harga Modal × Stok)
          </div>
          <div className="text-[11px] text-muted-foreground">
            Memakai jumlah batch kadaluarsa bila tersedia, fallback ke stok produk. Otomatis ikut barang masuk baru.
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border bg-primary/5 p-3">
            <div className="text-xs uppercase text-muted-foreground">Nilai Aset</div>
            <div className="mt-1 text-2xl font-bold text-primary">{formatRupiah(assetSummary.totalValue)}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs uppercase text-muted-foreground">Total Unit</div>
            <div className="mt-1 text-2xl font-bold">{assetSummary.totalUnits.toLocaleString("id-ID")}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs uppercase text-muted-foreground">Jenis Produk</div>
            <div className="mt-1 text-2xl font-bold">{assetSummary.productCount}</div>
          </div>
        </div>
        {assetSummary.topProducts.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <div className="mb-2 text-xs font-semibold text-muted-foreground">Top 10 Produk Berdasarkan Nilai Aset</div>
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2">Produk</th>
                  <th className="p-2 text-right">Qty</th>
                  <th className="p-2 text-right">Nilai Aset</th>
                </tr>
              </thead>
              <tbody>
                {assetSummary.topProducts.map((p) => (
                  <tr key={p.name} className="border-t">
                    <td className="p-2 font-medium">{p.name}</td>
                    <td className="p-2 text-right">{p.qty}</td>
                    <td className="p-2 text-right font-semibold text-primary">{formatRupiah(p.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Ringkasan Kadaluarsa */}
      {expirySummary.expired + expirySummary.le30 + expirySummary.le60 + expirySummary.le90 > 0 && (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <AlarmClock className="h-4 w-4 text-amber-500" />
              Barang Mendekati Kadaluarsa
            </div>
            <Link to="/kadaluarsa" className="text-xs font-medium text-primary hover:underline">
              Kelola batch →
            </Link>
          </div>
          <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
            <ExpiryStat label="Expired" count={expirySummary.expired} tone="destructive" />
            <ExpiryStat label="≤ 30 hari" count={expirySummary.le30} tone="red" />
            <ExpiryStat label="31 – 60 hari" count={expirySummary.le60} tone="orange" />
            <ExpiryStat label="61 – 90 hari" count={expirySummary.le90} tone="amber" />
          </div>
        </Card>
      )}

      {/* Rekonsiliasi Kas */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <DollarSign className="h-4 w-4 text-primary" />
          Rekonsiliasi Kas — Cocokkan uang fisik dengan data
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Masukkan jumlah uang fisik (cash di laci) dan saldo masuk QRIS pada rentang tanggal di atas. Sistem akan
          menghitung selisihnya dengan data transaksi.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <ReconRow
            label="CASH / Tunai"
            count={reconcile.cashCount}
            system={reconcile.cash}
            actual={actualCash}
            onChange={setActualCash}
            diff={reconcile.diffCash}
            tone="primary"
          />
          <ReconRow
            label="QRIS"
            count={reconcile.qrisCount}
            system={reconcile.qris}
            actual={actualQris}
            onChange={setActualQris}
            diff={reconcile.diffQris}
            tone="success"
          />
        </div>
        {reconcile.other > 0 && (
          <div className="mt-3 rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
            Metode lain (transfer/dll):{" "}
            <span className="font-semibold text-foreground">{formatRupiah(reconcile.other)}</span>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setActualCash("");
              setActualQris("");
            }}
          >
            Reset Input
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setActualCash(String(reconcile.cash));
              setActualQris(String(reconcile.qris));
            }}
          >
            Isi dari Data
          </Button>
        </div>
      </Card>

      {stats.lossMakers.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Penyebab Keuntungan Minus — {stats.lossMakers.length} produk dijual di bawah modal
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Produk berikut harga jualnya lebih rendah dari harga modal. Naikkan harga jual (terutama tier grosir/slove)
            atau perbaiki harga modal di menu Produk.
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
        <Card className="p-6 text-sm text-muted-foreground">Belum ada data transaksi pada rentang ini.</Card>
      )}

      {/* Charts */}
      {stats.daily.length > 0 && (
        <div ref={chartsRef} className="grid gap-3 lg:grid-cols-2">
          <Card className="p-4">
            <div className="mb-3 text-sm font-semibold">Tren Omset & Keuntungan Harian</div>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart
                data={stats.daily
                  .slice(-30)
                  .map((d) => ({ tgl: d.key.slice(5), Omset: d.revenue, Keuntungan: d.profit }))}
              >
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
              <BarChart
                data={stats.topProducts
                  .slice(0, 8)
                  .map((p) => ({
                    name: p.name.length > 12 ? p.name.slice(0, 12) + "…" : p.name,
                    Keuntungan: p.profit,
                  }))}
              >
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
                <BarChart
                  data={stats.monthly
                    .slice(-12)
                    .map((m) => ({ bln: m.key, Omset: m.revenue, Modal: m.cost, Keuntungan: m.profit }))}
                >
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
                    dataKey="value"
                    nameKey="name"
                    outerRadius={90}
                    label={(e) => e.name}
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

      <Tabs defaultValue="daily">
        <TabsList>
          <TabsTrigger value="daily">Per Hari</TabsTrigger>
          <TabsTrigger value="monthly">Per Bulan</TabsTrigger>
          <TabsTrigger value="yearly">Per Tahun</TabsTrigger>
          <TabsTrigger value="products">Produk Terlaris</TabsTrigger>
        </TabsList>

        <TabsContent value="daily">
          <BucketTable
            rows={[...stats.daily].reverse().slice(0, 60)}
            labelHeader="Tanggal"
            formatLabel={(k) => formatDate(k)}
          />
        </TabsContent>
        <TabsContent value="monthly">
          <BucketTable
            rows={[...stats.monthly].reverse().slice(0, 24)}
            labelHeader="Bulan"
            formatLabel={(k) => formatMonth(k)}
          />
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
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-muted-foreground">
                        Belum ada data
                      </td>
                    </tr>
                  ) : (
                    stats.topProducts.slice(0, 30).map((p) => {
                      const margin = p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0;
                      return (
                        <tr key={p.name} className="border-t hover:bg-muted/40">
                          <td className="p-3 font-medium">{p.name}</td>
                          <td className="p-3 text-right">{p.qty}</td>
                          <td className="p-3 text-right">{formatRupiah(p.revenue)}</td>
                          <td
                            className={`p-3 text-right font-semibold ${p.profit < 0 ? "text-destructive" : "text-primary"}`}
                          >
                            {formatRupiah(p.profit)}
                          </td>
                          <td className="p-3 text-right">
                            <Badge variant={margin >= 20 ? "default" : margin < 0 ? "destructive" : "secondary"}>
                              {margin.toFixed(1)}%
                            </Badge>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BucketTable({
  rows,
  labelHeader,
  formatLabel,
}: {
  rows: Bucket[];
  labelHeader: string;
  formatLabel: (k: string) => string;
}) {
  const totals = rows.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue,
      cost: acc.cost + r.cost,
      profit: acc.profit + r.profit,
      count: acc.count + r.count,
    }),
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
              <tr>
                <td colSpan={5} className="p-8 text-center text-muted-foreground">
                  Belum ada data
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const margin = r.revenue > 0 ? (r.profit / r.revenue) * 100 : 0;
                return (
                  <tr key={r.key} className="border-t hover:bg-muted/40">
                    <td className="p-3 font-medium">{formatLabel(r.key)}</td>
                    <td className="p-3 text-right">{formatRupiah(r.revenue)}</td>
                    <td className="p-3 text-right text-muted-foreground">{formatRupiah(r.cost)}</td>
                    <td
                      className={`p-3 text-right font-semibold ${r.profit < 0 ? "text-destructive" : "text-primary"}`}
                    >
                      {formatRupiah(r.profit)}
                    </td>
                    <td className="p-3 text-right">
                      <Badge variant={margin >= 20 ? "default" : margin < 0 ? "destructive" : "secondary"}>
                        {margin.toFixed(1)}%
                      </Badge>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-muted/60 font-semibold">
              <tr className="border-t">
                <td className="p-3">TOTAL</td>
                <td className="p-3 text-right">{formatRupiah(totals.revenue)}</td>
                <td className="p-3 text-right text-muted-foreground">{formatRupiah(totals.cost)}</td>
                <td className={`p-3 text-right ${totals.profit < 0 ? "text-destructive" : "text-primary"}`}>
                  {formatRupiah(totals.profit)}
                </td>
                <td className="p-3 text-right">{totalMargin.toFixed(1)}%</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
  );
}

function ExpiryStat({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "destructive" | "red" | "orange" | "amber";
}) {
  const cls: Record<string, string> = {
    destructive: "border-destructive/50 bg-destructive/10 text-destructive",
    red: "border-red-500/50 bg-red-500/10 text-red-600",
    orange: "border-orange-500/50 bg-orange-500/10 text-orange-600",
    amber: "border-amber-500/50 bg-amber-500/10 text-amber-700",
  };
  return (
    <div className={`rounded-md border p-2 ${cls[tone]}`}>
      <div className="text-[11px] font-medium">{label}</div>
      <div className="mt-0.5 text-xl font-bold">{count}</div>
      <div className="text-[10px] opacity-70">batch</div>
    </div>
  );
}

function SummaryItem({
  label,
  value,
  accent,
  muted,
}: {
  label: string;
  value: string;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-bold ${accent ? "text-primary" : muted ? "text-muted-foreground" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "primary" | "success";
}) {
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
  b.revenue += rev;
  b.cost += cost;
  b.profit += profit;
  b.count += 1;
  m.set(key, b);
}
function pad(n: number) {
  return String(n).padStart(2, "0");
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function formatDate(k: string) {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
function formatMonth(k: string) {
  const [y, m] = k.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}

function ReconRow({
  label,
  count,
  system,
  actual,
  onChange,
  diff,
  tone,
}: {
  label: string;
  count: number;
  system: number;
  actual: string;
  onChange: (v: string) => void;
  diff: number;
  tone?: "primary" | "success";
}) {
  const toneCls = tone === "primary" ? "text-primary" : tone === "success" ? "text-emerald-600" : "";
  const hasInput = actual.trim() !== "";
  const diffCls = !hasInput
    ? "text-muted-foreground"
    : diff === 0
      ? "text-emerald-600"
      : diff > 0
        ? "text-amber-600"
        : "text-destructive";
  const diffLabel = !hasInput
    ? "—"
    : diff === 0
      ? "Cocok ✓"
      : diff > 0
        ? `Lebih ${formatRupiah(diff)}`
        : `Kurang ${formatRupiah(Math.abs(diff))}`;
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className={`text-sm font-semibold ${toneCls}`}>{label}</div>
        <Badge variant="secondary" className="text-[10px]">
          {count} transaksi
        </Badge>
      </div>
      <div className="grid gap-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Menurut Data</span>
          <span className="font-semibold tabular-nums">{formatRupiah(system)}</span>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs text-muted-foreground">Uang Fisik / Saldo Diterima</Label>
          <Input
            type="number"
            inputMode="numeric"
            placeholder="0"
            value={actual}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 tabular-nums"
          />
        </div>
        <div className="flex justify-between border-t pt-2">
          <span className="text-muted-foreground">Selisih</span>
          <span className={`font-bold tabular-nums ${diffCls}`}>{diffLabel}</span>
        </div>
      </div>
    </div>
  );
}
