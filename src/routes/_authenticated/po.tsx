import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { formatRupiah, parseNumber } from "@/lib/format";
import {
  Plus,
  Trash2,
  Search,
  ClipboardList,
  Eye,
  CheckCircle2,
  XCircle,
  Download,
  AlertTriangle,
  PackageX,
  Sparkles,
  ImageIcon,
  X as XIcon,
  CalendarIcon,
  ChevronsUpDown,
} from "lucide-react";
import { AIInvoiceCapture } from "@/components/AIInvoiceCapture";
import type { AiInvoiceResult } from "@/lib/ai-vision.functions";
import { ReceivingDialog } from "@/components/ReceivingDialog";
import { PackageCheck } from "lucide-react";
import { loadUnitsForProducts, type ProductUnit } from "@/lib/product-pricing";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";



export const Route = createFileRoute("/_authenticated/po")({
  component: POPage,
});

type Product = {
  id: string;
  code: string;
  barcode: string | null;
  name: string;
  price: number;
  cost_price: number;
  stock: number;
  min_stock: number | null;
  category?: string | null;
};


type PO = {
  id: string;
  supplier: string;
  status: string;
  notes: string | null;
  total: number;
  item_count: number;
  created_at: string;
  receipt_image_path?: string | null;
};


type POItem = {
  id: string;
  po_id: string;
  product_id: string | null;
  product_code: string;
  product_name: string;
  qty: number;
  unit_cost: number;
  subtotal: number;
  sell_price?: number | null;
  unit_name?: string | null;
  unit_conversion?: number | null;
  category?: string | null;
};

type DraftItem = {
  product_id: string | null;
  product_code: string;
  product_name: string;
  qty: string;
  unit_cost: string;
  sell_price: string;
  unit_name: string;      // "pcs" | "slove" | "dus" | ...
  unit_conversion: string; // berapa pcs per 1 satuan (default 1)
  category: string;
};




const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  ordered: "Dipesan",
  received: "Diterima",
  cancelled: "Dibatalkan",
};

function POPage() {
  const [pos, setPos] = useState<PO[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [unitsByProduct, setUnitsByProduct] = useState<Record<string, ProductUnit[]>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState<PO | null>(null);
  const [detailItems, setDetailItems] = useState<POItem[]>([]);
  const [query, setQuery] = useState("");
  const [lowThreshold, setLowThreshold] = useState<number>(() => {
    const v = parseInt(localStorage.getItem("po_low_threshold") || "5", 10);
    return isNaN(v) ? 5 : v;
  });

  // Form
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [pickQuery, setPickQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [receiveFor, setReceiveFor] = useState<PO | null>(null);
  const [editingPoId, setEditingPoId] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string>("");
  const [existingReceiptPath, setExistingReceiptPath] = useState<string | null>(null);
  const [receiptViewOpen, setReceiptViewOpen] = useState<{ url: string; supplier: string } | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const poActionsRef = useRef<HTMLDivElement>(null);



  const load = async () => {
    const [{ data: poData, error: e1 }, { data: pData, error: e2 }] = await Promise.all([
      supabase.from("purchase_orders").select("*").order("created_at", { ascending: false }),
      supabase.from("products").select("id,code,barcode,name,price,cost_price,stock,min_stock,category").order("name"),
    ]);
    if (e1) toast.error(e1.message);
    else setPos((poData || []) as PO[]);
    if (e2) toast.error(e2.message);
    else {
      const prods = (pData || []) as Product[];
      setProducts(prods);
      try {
        const map = await loadUnitsForProducts(prods.map((p) => p.id));
        setUnitsByProduct(map);
      } catch (err: any) {
        // non-fatal
        console.warn("loadUnitsForProducts:", err?.message || err);
      }
    }
  };

  useEffect(() => { load(); }, []);

  const filteredPos = pos.filter((p) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      p.supplier.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      (p.notes || "").toLowerCase().includes(q)
    );
  });

  const filteredProducts = useMemo(() => {
    const q = pickQuery.trim().toLowerCase();
    if (!q) return products.slice(0, 20);
    return products
      .filter((p) => p.code.toLowerCase().includes(q) || (p.barcode || "").toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
      .slice(0, 20);
  }, [products, pickQuery]);

  const total = items.reduce(
    (s, it) => s + parseNumber(it.qty) * parseNumber(it.unit_cost),
    0,
  );
  const itemCount = items.reduce((s, it) => s + (parseInt(it.qty || "0", 10) || 0), 0);
  const totalProfitExpected = items.reduce((s, it) => {
    const qty = parseInt(it.qty || "0", 10) || 0;
    const conv = Math.max(1, parseInt(it.unit_conversion || "1", 10) || 1);
    const cost = parseNumber(it.unit_cost);
    const sellPerPcs = parseNumber(it.sell_price);
    if (!sellPerPcs || !cost) return s;
    return s + (sellPerPcs - cost / conv) * qty * conv;
  }, 0);

  const resetForm = () => {
    setSupplier("");
    setNotes("");
    setItems([]);
    setPickQuery("");
    setEditingPoId(null);
    setReceiptFile(null);
    setReceiptPreview("");
    setExistingReceiptPath(null);
  };



  const effectiveThreshold = (p: Product) =>
    p.min_stock != null && p.min_stock >= 0 ? p.min_stock : lowThreshold;

  const lowStockProducts = useMemo(() => {
    return products
      .filter((p) => (p.stock ?? 0) <= effectiveThreshold(p))
      .sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, lowThreshold]);

  const outOfStockCount = lowStockProducts.filter((p) => (p.stock ?? 0) <= 0).length;
  const customThresholdCount = products.filter((p) => p.min_stock != null).length;


  const pricingIssueProducts = useMemo(() => {
    return products.filter((p) => {
      const cost = Number(p.cost_price || 0);
      const price = Number(p.price || 0);
      if (!cost || cost <= 0) return true;
      if (cost > price && price > 0) return true;
      if (price <= 0) return true;
      const m = (price - cost) / cost;
      return m < 0.03 || m > 2;
    });
  }, [products]);

  const addProduct = (p: Product) => {
    if (items.some((it) => it.product_id === p.id)) {
      toast.info("Sudah ada di daftar");
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        product_id: p.id,
        product_code: p.code,
        product_name: p.name,
        qty: "1",
        unit_cost: String(p.cost_price || p.price),
        sell_price: String(p.price),
        unit_name: "pcs",
        unit_conversion: "1",
        category: p.category || "",
      },

    ]);
  };

  const buildDraftItem = (p: Product, suggestedQty: number): DraftItem => ({
    product_id: p.id,
    product_code: p.code,
    product_name: p.name,
    qty: String(Math.max(1, suggestedQty)),
    unit_cost: String(p.cost_price || p.price),
    sell_price: String(p.price),
    unit_name: "pcs",
    unit_conversion: "1",
    category: p.category || "",
  });



  const openCreateForLowStock = (mode: "out" | "low") => {
    const pool = mode === "out"
      ? lowStockProducts.filter((p) => (p.stock ?? 0) <= 0)
      : lowStockProducts;
    if (pool.length === 0) {
      toast.info("Tidak ada produk yang perlu di-restock");
      return;
    }
    resetForm();
    setItems(pool.map((p) => {
      const target = Math.max(effectiveThreshold(p) * 2, 10);
      return buildDraftItem(p, target - (p.stock ?? 0));
    }));

    setCreateOpen(true);
  };

  const addLowStockToDraft = (p: Product) => {
    const target = Math.max(effectiveThreshold(p) * 2, 10);

    const qty = Math.max(1, target - (p.stock ?? 0));
    if (!createOpen) {
      resetForm();
      setItems([buildDraftItem(p, qty)]);
      setCreateOpen(true);
    } else {
      if (items.some((it) => it.product_id === p.id)) {
        toast.info("Sudah ada di daftar");
        return;
      }
      setItems((prev) => [...prev, buildDraftItem(p, qty)]);
      toast.success(`${p.name} ditambahkan ke PO`);
    }
  };

  const addManual = () => {
    setItems((prev) => [
      ...prev,
      { product_id: null, product_code: "", product_name: "", qty: "1", unit_cost: "0", sell_price: "0", unit_name: "pcs", unit_conversion: "1", category: "" },
    ]);
  };


  const applyInvoiceResult = (r: AiInvoiceResult) => {
    if (r.supplier && !supplier.trim()) setSupplier(r.supplier);
    if (r.invoice_no) {
      const note = `Faktur ${r.invoice_no}${r.invoice_date ? ` (${r.invoice_date})` : ""}`;
      setNotes((n) => n ? n : note);
    }
    const newItems: DraftItem[] = r.items.map((it) => {
      let matched: Product | undefined;
      if (it.matched_product_id) matched = products.find((p) => p.id === it.matched_product_id);
      if (!matched && it.barcode) matched = products.find((p) => p.barcode === it.barcode);
      if (!matched) matched = products.find((p) => p.name.toLowerCase() === it.name.toLowerCase());
      return {
        product_id: matched?.id ?? null,
        product_code: matched?.code ?? "",
        product_name: matched?.name ?? it.name,
        qty: String(Math.max(1, it.qty)),
        unit_cost: String(Math.round(it.cost_price || 0)),
        sell_price: String(Math.round(it.sell_price ?? matched?.price ?? 0)),
        unit_name: "pcs",
        unit_conversion: "1",
        category: (it.category || matched?.category || "").toString(),
      };
    });

    setItems((prev) => [...prev, ...newItems]);
    setCreateOpen(true);
    toast.success(`${newItems.length} item dari struk ditambahkan`);
    window.setTimeout(() => {
      setCreateOpen(true);
      if (window.matchMedia("(max-width: 767px)").matches) {
        poActionsRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }
    }, 100);
    window.setTimeout(() => {
      setCreateOpen(true);
      if (window.matchMedia("(max-width: 767px)").matches) {
        poActionsRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }
    }, 450);
  };





  const updateItem = (i: number, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  };

  const pickExistingProduct = (i: number, p: Product) => {
    if (items.some((it, idx) => idx !== i && it.product_id === p.id)) {
      toast.info("Produk ini sudah ada di daftar");
      return;
    }
    updateItem(i, {
      product_id: p.id,
      product_code: p.code,
      product_name: p.name,
      category: p.category || "",
    });
  };


  /** Ganti satuan pada baris. Jika satuan cocok dengan unit produk, isi conversion otomatis. */
  const changeUnit = (i: number, unitName: string) => {
    const it = items[i];
    if (!it) return;
    const patch: Partial<DraftItem> = { unit_name: unitName };
    const units = it.product_id ? unitsByProduct[it.product_id] : undefined;
    const matched = units?.find((u) => u.name.toLowerCase() === unitName.toLowerCase());
    if (matched) {
      const newConv = String(Math.max(1, Math.floor(matched.conversion || 1)));
      patch.unit_conversion = newConv;
      // sesuaikan modal per satuan berdasarkan modal/pcs produk (kalau ada)
      const prod = products.find((p) => p.id === it.product_id);
      const oldCostPcs = prod ? Number(prod.cost_price || 0) : 0;
      if (oldCostPcs > 0) {
        patch.unit_cost = String(Math.round(oldCostPcs * matched.conversion));
      }
    }
    updateItem(i, patch);
  };

  const removeItem = (i: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  };

  const saveDraft = async (status: "draft" | "ordered") => {
    if (!supplier.trim()) return toast.error("Nama supplier wajib diisi");
    if (items.length === 0) return toast.error("Tambahkan minimal 1 item");
    const valid = items.filter(
      (it) => it.product_name.trim() && parseNumber(it.qty) > 0,
    );
    if (valid.length === 0) return toast.error("Item tidak valid");

    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return toast.error("Sesi habis, login ulang");
    }

    let poId = editingPoId;
    if (editingPoId) {
      const { error: uErr } = await supabase
        .from("purchase_orders")
        .update({
          supplier: supplier.trim(),
          status,
          notes: notes.trim() || null,
          total,
          item_count: itemCount,
        })
        .eq("id", editingPoId);
      if (uErr) {
        setSaving(false);
        return toast.error(uErr.message);
      }
      await supabase.from("purchase_order_items").delete().eq("po_id", editingPoId);
    } else {
      const { data: po, error: e1 } = await supabase
        .from("purchase_orders")
        .insert({
          user_id: user.id,
          supplier: supplier.trim(),
          status,
          notes: notes.trim() || null,
          total,
          item_count: itemCount,
        })
        .select()
        .single();
      if (e1 || !po) {
        setSaving(false);
        return toast.error(e1?.message || "Gagal simpan");
      }
      poId = po.id;
    }

    const rows = valid.map((it) => {
      const qty = parseInt(it.qty || "0", 10) || 0;
      const unit_cost = parseNumber(it.unit_cost);
      const sell_price = parseNumber(it.sell_price);
      const unit_conversion = Math.max(1, parseInt(it.unit_conversion || "1", 10) || 1);
      const unit_name = (it.unit_name || "pcs").trim() || "pcs";
      const prod = it.product_id ? products.find((p) => p.id === it.product_id) : null;
      return {
        po_id: poId!,
        product_id: it.product_id,
        product_code: it.product_code || "-",
        product_barcode: prod?.barcode || null,
        product_name: it.product_name,
        qty,
        unit_cost,
        sell_price: sell_price > 0 ? sell_price : null,
        subtotal: qty * unit_cost,
        unit_name,
        unit_conversion,
        category: it.category?.trim() || null,
      };
    });


    const { error: e2 } = await (supabase as any).from("purchase_order_items").insert(rows);
    if (e2) { setSaving(false); return toast.error(e2.message); }

    // Upload struk (opsional)
    if (receiptFile && poId) {
      try {
        const { data: tid } = await (supabase as any).rpc("current_tenant_id");
        if (tid) {
          const ext = (receiptFile.name.split(".").pop() || "jpg").toLowerCase();
          const path = `${tid}/po/${poId}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("receipts")
            .upload(path, receiptFile, { upsert: true, contentType: receiptFile.type || "image/jpeg" });
          if (upErr) {
            toast.error("Struk gagal diunggah: " + upErr.message);
          } else {
            await supabase.from("purchase_orders").update({ receipt_image_path: path } as any).eq("id", poId);
          }
        }
      } catch (e: any) {
        toast.error("Struk gagal diunggah: " + (e?.message || ""));
      }
    }

    setSaving(false);
    toast.success(
      editingPoId
        ? "Draft PO diperbarui"
        : `PO ${status === "draft" ? "disimpan sebagai draft" : "dibuat"}`,
    );
    setCreateOpen(false);
    resetForm();
    load();
  };



  const openDetail = async (po: PO) => {
    setDetailOpen(po);
    const { data } = await supabase
      .from("purchase_order_items")
      .select("*")
      .eq("po_id", po.id);
    setDetailItems((data || []) as POItem[]);
  };

  const openReceipt = async (po: PO) => {
    const path = (po as any).receipt_image_path as string | null;
    if (!path) { toast.info("Struk PO ini belum diunggah"); return; }
    setReceiptLoading(true);
    const { data, error } = await supabase.storage.from("receipts").createSignedUrl(path, 60 * 30);
    setReceiptLoading(false);
    if (error || !data?.signedUrl) { toast.error(error?.message || "Gagal buka struk"); return; }
    setReceiptViewOpen({ url: data.signedUrl, supplier: po.supplier });
  };



  const editDraft = async (po: PO) => {
    if (po.status !== "draft") {
      toast.info("Hanya PO berstatus Draft yang bisa diedit");
      return;
    }
    const { data, error } = await supabase
      .from("purchase_order_items")
      .select("*")
      .eq("po_id", po.id);
    if (error) return toast.error(error.message);
    const drafted: DraftItem[] = ((data || []) as POItem[]).map((it) => ({
      product_id: it.product_id,
      product_code: it.product_code || "",
      product_name: it.product_name,
      qty: String(it.qty ?? 0),
      unit_cost: String(it.unit_cost ?? 0),
      sell_price: it.sell_price != null ? String(it.sell_price) : "",
      unit_name: it.unit_name || "pcs",
      unit_conversion: String(it.unit_conversion ?? 1),
      category: it.category || "",
    }));

    setSupplier(po.supplier);
    setNotes(po.notes || "");
    setItems(drafted);
    setEditingPoId(po.id);
    setReceiptFile(null);
    setReceiptPreview("");
    setExistingReceiptPath((po as any).receipt_image_path || null);
    setDetailOpen(null);
    setCreateOpen(true);
  };



  const updateStatus = async (po: PO, status: string) => {
    const { error } = await supabase
      .from("purchase_orders")
      .update({ status })
      .eq("id", po.id);
    if (error) return toast.error(error.message);

    // When received, increment stock for items mapped to products
    if (status === "received") {
      const { data: poItems } = await supabase
        .from("purchase_order_items")
        .select("product_id, qty, unit_cost, sell_price, unit_conversion")
        .eq("po_id", po.id);
      for (const it of (poItems as { product_id: string | null; qty: number; unit_cost: number | null; sell_price: number | null; unit_conversion: number | null }[]) || []) {
        if (!it.product_id) continue;
        const { data: prod } = await supabase
          .from("products")
          .select("stock")
          .eq("id", it.product_id)
          .single();
        if (prod) {
          const conv = Math.max(1, Number(it.unit_conversion || 1));
          const addStock = (it.qty || 0) * conv;
          const perPcsCost = it.unit_cost && it.unit_cost > 0 ? Number(it.unit_cost) / conv : 0;
          const upd: { stock: number; cost_price?: number; price?: number } = { stock: (prod.stock || 0) + addStock };
          if (perPcsCost > 0) upd.cost_price = perPcsCost;
          if (it.sell_price && it.sell_price > 0) upd.price = it.sell_price;
          await supabase.from("products").update(upd).eq("id", it.product_id);
        }

      }

      toast.success("PO diterima — stok & harga diperbarui");

    } else {
      toast.success(`Status: ${STATUS_LABEL[status] || status}`);
    }
    setDetailOpen(null);
    load();
  };

  const removePO = async (po: PO) => {
    if (!confirm(`Hapus PO untuk "${po.supplier}"?`)) return;
    const { error } = await supabase.from("purchase_orders").delete().eq("id", po.id);
    if (error) return toast.error(error.message);
    toast.success("PO dihapus");
    if (detailOpen?.id === po.id) setDetailOpen(null);
    load();
  };

  const printPO = (po: PO, lines: POItem[]) => {
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return;
    const rows = lines
      .map(
        (it) => {
          const conv = Math.max(1, Number(it.unit_conversion || 1));
          const unitName = it.unit_name || "pcs";
          const qtyLabel = conv > 1 ? `${it.qty} ${unitName} × ${conv} = ${it.qty * conv} pcs` : `${it.qty} ${unitName}`;
          return `
        <tr>
          <td>${it.product_code}</td>
          <td>${it.product_name}</td>
          <td style="text-align:right">${qtyLabel}</td>
          <td style="text-align:right">${formatRupiah(Number(it.unit_cost))}</td>
          <td style="text-align:right">${formatRupiah(Number(it.subtotal))}</td>
        </tr>`;
        },

      )
      .join("");
    w.document.write(`
      <html><head><title>PO #${po.id.slice(0, 8)}</title>
      <style>
        body{font-family:system-ui,sans-serif;padding:24px;color:#222}
        h1{margin:0 0 4px;font-size:20px}
        table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
        th,td{border:1px solid #ddd;padding:6px 8px}
        th{background:#f6f6f6;text-align:left}
        .meta{font-size:13px;color:#555;margin-bottom:8px}
        .total{margin-top:12px;text-align:right;font-size:15px;font-weight:600}
      </style></head><body>
      <h1>Purchase Order</h1>
      <div class="meta">No: #${po.id.slice(0, 8)} • ${new Date(po.created_at).toLocaleString("id-ID")}</div>
      <div class="meta"><b>Supplier:</b> ${po.supplier}</div>
      <div class="meta"><b>Status:</b> ${STATUS_LABEL[po.status] || po.status}</div>
      ${po.notes ? `<div class="meta"><b>Catatan:</b> ${po.notes}</div>` : ""}
      <table>
        <thead><tr><th>Kode</th><th>Nama</th><th style="text-align:right">Qty</th><th style="text-align:right">Harga</th><th style="text-align:right">Subtotal</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="total">Total: ${formatRupiah(Number(po.total))}</div>
      <script>window.onload=()=>window.print()</script>
      </body></html>
    `);
    w.document.close();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cari supplier / catatan..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => { resetForm(); setCreateOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Buat PO
        </Button>
      </div>

      {pricingIssueProducts.length > 0 && (
        <Card className="border-orange-400/50 bg-orange-50/60 dark:bg-orange-950/20 p-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-semibold">
                {pricingIssueProducts.length} produk perlu cek modal vs harga jual
              </div>
              <div className="text-xs text-muted-foreground mb-2">
                Modal kosong/0, lebih besar dari harga jual, atau margin tidak wajar (&lt; 3% atau &gt; 200%). Perbaiki di halaman Produk sebelum membuat PO agar perhitungan untung akurat.
              </div>
              <div className="flex flex-wrap gap-1.5">
                {pricingIssueProducts.slice(0, 10).map((p) => {
                  const cost = Number(p.cost_price || 0);
                  const price = Number(p.price || 0);
                  const tag = !cost ? "Modal 0" : cost > price ? "Modal>Jual" : (price - cost) / cost < 0.03 ? "Margin kecil" : "Margin besar";
                  return (
                    <span key={p.id} className="rounded bg-orange-500/15 text-orange-700 dark:text-orange-300 px-2 py-0.5 text-[11px]" title={`Modal Rp${cost.toLocaleString("id-ID")} • Jual Rp${price.toLocaleString("id-ID")}`}>
                      {p.name} <span className="opacity-70">• {tag}</span>
                    </span>
                  );
                })}
                {pricingIssueProducts.length > 10 && (
                  <span className="text-[11px] text-muted-foreground self-center">+{pricingIssueProducts.length - 10} lainnya</span>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}


      {/* Produk Habis / Stok Menipis */}
      {lowStockProducts.length > 0 && (
        <Card className="overflow-hidden border-destructive/40">
          <div className="flex flex-wrap items-center gap-2 border-b bg-destructive/5 p-3">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div className="flex-1 min-w-[180px]">
              <div className="text-sm font-semibold">
                Produk Habis / Stok Menipis
              </div>
              <div className="text-xs text-muted-foreground">
                {outOfStockCount} habis • {lowStockProducts.length - outOfStockCount} menipis
                {" • "}batas default ≤ {lowThreshold}
                {customThresholdCount > 0 && ` • ${customThresholdCount} produk pakai batas sendiri`}
              </div>

            </div>
            <div className="flex items-center gap-1.5">
              <Label className="text-xs whitespace-nowrap">Batas default</Label>
              <Input
                type="number"
                min={0}
                value={lowThreshold}
                onChange={(e) => {
                  const v = Math.max(0, parseInt(e.target.value || "0", 10) || 0);
                  setLowThreshold(v);
                  localStorage.setItem("po_low_threshold", String(v));
                }}
                className="h-8 w-16 text-xs"
                title="Dipakai untuk produk yang belum diatur batas sendiri"
              />

            </div>
            {outOfStockCount > 0 && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => openCreateForLowStock("out")}
              >
                <PackageX className="mr-2 h-4 w-4" /> Buat PO Habis ({outOfStockCount})
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => openCreateForLowStock("low")}
            >
              <Plus className="mr-2 h-4 w-4" /> Buat PO Semua ({lowStockProducts.length})
            </Button>
          </div>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2">Kode</th>
                  <th className="p-2">Nama</th>
                  <th className="p-2 text-right">Stok</th>
                  <th className="p-2 text-right w-24">Batas</th>
                  <th className="p-2 text-right">Harga</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {lowStockProducts.map((p) => {
                  const out = (p.stock ?? 0) <= 0;
                  const eff = effectiveThreshold(p);
                  const isCustom = p.min_stock != null;
                  return (
                    <tr key={p.id} className="border-t hover:bg-muted/40">
                      <td className="p-2 font-mono text-xs">{p.code}</td>
                      <td className="p-2 font-medium">{p.name}</td>
                      <td className="p-2 text-right">
                        <Badge variant={out ? "destructive" : "secondary"}>
                          {out ? "Habis" : `${p.stock} tersisa`}
                        </Badge>
                      </td>
                      <td className="p-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Input
                            type="number"
                            min={0}
                            defaultValue={isCustom ? String(p.min_stock) : ""}
                            placeholder={String(lowThreshold)}
                            onBlur={async (e) => {
                              const raw = e.target.value.trim();
                              const newVal = raw === "" ? null : Math.max(0, parseInt(raw, 10) || 0);
                              if (newVal === (p.min_stock ?? null)) return;
                              const { error } = await supabase
                                .from("products")
                                .update({ min_stock: newVal } as any)
                                .eq("id", p.id);
                              if (error) { toast.error(error.message); return; }
                              setProducts((prev) => prev.map((x) => x.id === p.id ? { ...x, min_stock: newVal } : x));
                              toast.success(newVal == null ? `Batas ${p.name}: pakai default` : `Batas ${p.name} = ${newVal}`);
                            }}
                            className="h-8 w-16 text-xs text-right"
                            title={isCustom ? "Batas khusus produk ini" : "Kosong = pakai batas default"}
                          />
                          <span className="text-[10px] text-muted-foreground w-4">{isCustom ? "•" : ""}</span>
                        </div>
                      </td>
                      <td className="p-2 text-right">{formatRupiah(p.price)}</td>
                      <td className="p-2 text-right">
                        <Button
                          size="sm"
                          variant={out ? "destructive" : "outline"}
                          onClick={() => addLowStockToDraft(p)}
                        >
                          <Plus className="mr-1 h-3.5 w-3.5" /> PO
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

            </table>
          </div>
        </Card>
      )}

      <ProductPurchaseHistoryCard products={products} />

      <Card className="overflow-hidden">

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Tanggal</th>
                <th className="p-3">No.</th>
                <th className="p-3">Supplier</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Item</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filteredPos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-muted-foreground">
                    <ClipboardList className="mx-auto mb-3 h-12 w-12 opacity-30" />
                    <div>Belum ada Purchase Order.</div>
                    <div className="text-xs">Klik "Buat PO" untuk membuat pesanan ke supplier.</div>
                  </td>
                </tr>
              ) : (
                filteredPos.map((po) => (
                  <tr key={po.id} className="border-t hover:bg-muted/40">
                    <td className="p-3">{new Date(po.created_at).toLocaleString("id-ID")}</td>
                    <td className="p-3 font-mono text-xs">#{po.id.slice(0, 8)}</td>
                    <td className="p-3 font-medium">{po.supplier}</td>
                    <td className="p-3"><StatusBadge status={po.status} /></td>
                    <td className="p-3 text-right">{po.item_count}</td>
                    <td className="p-3 text-right font-semibold">{formatRupiah(Number(po.total))}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openDetail(po)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removePO(po)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create PO Dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open && aiOpen) {
            setCreateOpen(true);
            return;
          }
          setCreateOpen(open);
          if (!open) { setAiOpen(false); resetForm(); }
        }}
      >
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] w-[98vw] max-w-[98vw] sm:max-w-[96vw] overflow-y-auto pb-4"
          onInteractOutside={(e) => { if (aiOpen) e.preventDefault(); }}
          onPointerDownOutside={(e) => { if (aiOpen) e.preventDefault(); }}
          onFocusOutside={(e) => { if (aiOpen) e.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle>{editingPoId ? "Edit Draft PO" : "Buat Purchase Order"}</DialogTitle>
            <DialogDescription>
              {editingPoId ? "Ubah item / harga / catatan draft PO ini." : "Pilih produk dari katalog atau tambahkan manual."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Supplier *</Label>
              <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Nama supplier" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Catatan</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opsional" />
            </div>
          </div>

          {/* Struk / Foto Nota (opsional) */}
          <div className="mt-3 rounded-md border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-primary" />
              <div className="text-sm font-semibold">Foto Struk / Nota (opsional)</div>
              {existingReceiptPath && !receiptFile && (
                <Badge variant="secondary" className="ml-auto">Sudah ada — pilih file baru untuk ganti</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setReceiptFile(f);
                  if (f) {
                    const reader = new FileReader();
                    reader.onload = () => setReceiptPreview(String(reader.result || ""));
                    reader.readAsDataURL(f);
                  } else {
                    setReceiptPreview("");
                  }
                }}
                className="h-9 text-xs max-w-xs"
              />
              {(receiptPreview || existingReceiptPath) && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => { setReceiptFile(null); setReceiptPreview(""); }}
                >
                  <XIcon className="mr-1 h-3.5 w-3.5" /> Batalkan pilihan
                </Button>
              )}
            </div>
            {receiptPreview && (
              <img src={receiptPreview} alt="Preview struk" className="max-h-40 rounded border" />
            )}
            <div className="text-[11px] text-muted-foreground">
              Foto disimpan pribadi per toko dan bisa dibuka lagi dari detail PO.
            </div>
          </div>


          <div className="mt-3 grid gap-4 md:grid-cols-[240px_1fr]">
            {/* Product picker */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Cari produk..."
                  value={pickQuery}
                  onChange={(e) => setPickQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="max-h-64 overflow-auto rounded border">
                {filteredProducts.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">Tidak ada produk</div>
                ) : (
                  filteredProducts.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => addProduct(p)}
                      className="block w-full border-b p-3 text-left text-sm hover:bg-muted last:border-b-0"
                    >
                      <div className="font-semibold">{p.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {p.code}{p.barcode ? ` • ${p.barcode}` : ""} • Stok {p.stock} • {formatRupiah(p.price)}
                      </div>
                    </button>
                  ))
                )}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="outline" size="default" onClick={addManual} className="flex-1">
                  <Plus className="mr-2 h-5 w-5" /> Item Manual
                </Button>
                <Button type="button" size="default" onClick={() => setAiOpen((v) => !v)} className="flex-1">
                  <Sparkles className="mr-2 h-5 w-5" /> {aiOpen ? "Tutup Scan" : "Scan Struk/Faktur"}
                </Button>
              </div>
            </div>


            {/* Items - Mobile cards */}
            <div className="space-y-2 md:hidden">
              {items.length === 0 ? (
                <div className="rounded border p-6 text-center text-sm text-muted-foreground">Belum ada item</div>
              ) : (
                items.map((it, i) => {
                  const sub = parseNumber(it.qty) * parseNumber(it.unit_cost);
                  return (
                    <div key={i} className="rounded-lg border bg-card p-3 space-y-2 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <ProductNameCombobox
                            value={it.product_name}
                            disabled={!!it.product_id}
                            products={products}
                            onPick={(p) => pickExistingProduct(i, p)}
                            onChangeText={(v) => updateItem(i, { product_name: v })}
                            className="h-10 text-sm font-semibold pr-9"
                            placeholder="Nama barang / pilih"
                          />
                          <Input
                            value={it.product_code}
                            onChange={(e) => updateItem(i, { product_code: e.target.value })}
                            className="h-9 text-sm"
                            placeholder="Kode"
                            disabled={!!it.product_id}
                          />
                        </div>
                        <Button size="icon" variant="ghost" onClick={() => removeItem(i)} className="h-9 w-9 text-destructive shrink-0">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Qty</div>
                          <Input type="number" inputMode="decimal" value={it.qty} onChange={(e) => updateItem(i, { qty: e.target.value })} className="h-10 text-sm text-right" />
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Satuan</div>
                          {(() => {
                            const units = it.product_id ? unitsByProduct[it.product_id] : undefined;
                            if (units && units.length > 0) {
                              const known = units.some((u) => u.name.toLowerCase() === (it.unit_name || "").toLowerCase());
                              return (
                                <select
                                  className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                                  value={known ? it.unit_name : "__custom"}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    if (v === "__custom") { updateItem(i, { unit_name: "", unit_conversion: "1" }); return; }
                                    changeUnit(i, v);
                                  }}
                                >
                                  {units.map((u) => (
                                    <option key={u.id || u.name} value={u.name}>{u.name} (isi {u.conversion})</option>
                                  ))}
                                  <option value="__custom">Satuan lain…</option>
                                </select>
                              );
                            }
                            return <Input list="po-units" value={it.unit_name} onChange={(e) => updateItem(i, { unit_name: e.target.value })} className="h-10 text-sm" placeholder="pcs/dus/rcg" />;
                          })()}
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Isi (pcs)</div>
                          <Input type="number" inputMode="numeric" value={it.unit_conversion} onChange={(e) => updateItem(i, { unit_conversion: e.target.value })} className="h-10 text-sm text-right" />
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Modal/{it.unit_name || "satuan"}</div>
                          <Input type="number" inputMode="decimal" value={it.unit_cost} onChange={(e) => updateItem(i, { unit_cost: e.target.value })} className="h-10 text-sm text-right" />
                          {(parseInt(it.unit_conversion || "1", 10) || 1) > 1 && (
                            <div className="mt-1 text-[10px] text-right text-muted-foreground">= {formatRupiah(parseNumber(it.unit_cost) / Math.max(1, parseInt(it.unit_conversion || "1", 10) || 1))}/pcs</div>
                          )}
                          {(() => {
                            const existingProd = it.product_id ? products.find((p) => p.id === it.product_id) : null;
                            const oldCostPcs = existingProd ? Number(existingProd.cost_price || 0) : 0;
                            const conv2 = Math.max(1, parseInt(it.unit_conversion || "1", 10) || 1);
                            const newCostPcs = parseNumber(it.unit_cost) / conv2;
                            if (!oldCostPcs || !newCostPcs) return null;
                            const diff = newCostPcs - oldCostPcs;
                            return (
                              <div className="mt-0.5 text-[10px] text-right text-muted-foreground">
                                Lama: {formatRupiah(oldCostPcs)}/pcs
                                {diff !== 0 && <span className={`ml-1 font-semibold ${diff > 0 ? "text-destructive" : "text-emerald-600"}`}>{diff > 0 ? "+" : ""}{formatRupiah(diff)}</span>}
                              </div>
                            );
                          })()}
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Modal/pcs</div>
                          <Input
                            type="number"
                            inputMode="decimal"
                            value={((): string => {
                              const conv = Math.max(1, parseInt(it.unit_conversion || "1", 10) || 1);
                              const perPcs = parseNumber(it.unit_cost) / conv;
                              return perPcs > 0 ? String(Math.round(perPcs * 100) / 100) : "";
                            })()}
                            onChange={(e) => {
                              const conv = Math.max(1, parseInt(it.unit_conversion || "1", 10) || 1);
                              const perPcs = parseNumber(e.target.value);
                              updateItem(i, { unit_cost: String(Math.round(perPcs * conv * 100) / 100) });
                            }}
                            className="h-10 text-sm text-right"
                            placeholder="—"
                          />
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Jual/pcs</div>
                          <Input type="number" inputMode="decimal" value={it.sell_price} onChange={(e) => updateItem(i, { sell_price: e.target.value })} className="h-10 text-sm text-right" placeholder="—" />
                        </div>
                        <div className="col-span-3 flex items-center justify-between border-t pt-2 text-xs">
                          <span className="text-muted-foreground">Stok masuk</span>
                          <span className="font-semibold text-primary">{(parseInt(it.qty || "0", 10) || 0) * (Math.max(1, parseInt(it.unit_conversion || "1", 10) || 1))} pcs</span>
                        </div>
                      </div>
                      {(() => {
                        const qty = parseInt(it.qty || "0", 10) || 0;
                        const conv = Math.max(1, parseInt(it.unit_conversion || "1", 10) || 1);
                        const cost = parseNumber(it.unit_cost);
                        const sell = parseNumber(it.sell_price);
                        if (!qty || !cost || !sell) return null;
                        const profit = (sell - cost / conv) * qty * conv;
                        const perPcs = sell - cost / conv;
                        return (
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Untung ({formatRupiah(perPcs)}/pcs)</span>
                            <span className={`font-semibold ${profit >= 0 ? "text-emerald-600" : "text-destructive"}`}>{formatRupiah(profit)}</span>
                          </div>
                        );
                      })()}
                      <div className="flex justify-between border-t pt-2 text-sm">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="font-semibold">{formatRupiah(sub)}</span>
                      </div>

                    </div>
                  );
                })
              )}
            </div>

            {/* Items - Desktop table */}
            <div className="space-y-2 hidden md:block">
              <datalist id="po-cats">
                {Array.from(new Set(products.map((p) => (p.category || "").trim()).filter(Boolean))).map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <datalist id="po-units">
                {["pcs", "dus", "ball", "karton", "box", "pack", "slove", "rcg", "renceng", "lusin", "kg", "gram", "liter", "ml", "botol", "sachet", "bungkus"].map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
              <div className="max-h-80 overflow-auto rounded border">
                <table className="w-full min-w-[1250px] text-sm">


                  <thead className="sticky top-0 bg-muted text-left">
                    <tr>
                      <th className="p-2 w-20">Kode</th>
                      <th className="p-2 min-w-[200px] w-[220px]">Nama</th>
                      <th className="p-2 min-w-[140px] w-[150px]">Kategori</th>
                      <th className="p-2 w-16 text-right">Qty</th>
                      <th className="p-2 w-24">Satuan</th>
                      <th className="p-2 w-16 text-right">Isi</th>
                      <th className="p-2 w-24 text-right">Modal Lama</th>
                      <th className="p-2 w-28 text-right">Modal Baru/satuan</th>
                      <th className="p-2 w-28 text-right">Modal Baru/pcs</th>
                      <th className="p-2 w-24 text-right">Jual/pcs</th>
                      <th className="p-2 w-16 text-right">Stok +</th>
                      <th className="p-2 w-24 text-right">Subtotal</th>
                      <th className="p-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={13} className="p-6 text-center text-muted-foreground">
                          Belum ada item
                        </td>
                      </tr>

                    ) : (
                      items.map((it, i) => {
                        const sub = parseNumber(it.qty) * parseNumber(it.unit_cost);
                        const conv = Math.max(1, parseInt(it.unit_conversion || "1", 10) || 1);
                        const stockAdd = (parseInt(it.qty || "0", 10) || 0) * conv;
                        const existingProd = it.product_id ? products.find((p) => p.id === it.product_id) : null;
                        const oldCostPcs = existingProd ? Number(existingProd.cost_price || 0) : 0;
                        const newCostPcs = parseNumber(it.unit_cost) / conv;
                        const costDiff = oldCostPcs > 0 && newCostPcs > 0 ? newCostPcs - oldCostPcs : 0;
                        return (
                          <tr key={i} className="border-t align-top">
                            <td className="p-1">
                              <Input value={it.product_code} onChange={(e) => updateItem(i, { product_code: e.target.value })} className="h-9 w-full text-xs px-2" disabled={!!it.product_id} title={it.product_code} />
                            </td>
                            <td className="p-1">
                              <ProductNameCombobox
                                value={it.product_name}
                                disabled={!!it.product_id}
                                products={products}
                                onPick={(p) => pickExistingProduct(i, p)}
                                onChangeText={(v) => updateItem(i, { product_name: v })}
                                className="h-9 w-full text-sm px-2 pr-8"
                                placeholder="Nama / pilih"
                              />
                            </td>
                            <td className="p-1">
                              <Input list="po-cats" value={it.category} onChange={(e) => updateItem(i, { category: e.target.value })} className="h-9 w-full text-xs px-2" placeholder="Pilih/ketik" disabled={!!it.product_id} title={it.category} />
                            </td>

                            <td className="p-1">
                              <Input type="number" value={it.qty} onChange={(e) => updateItem(i, { qty: e.target.value })} className="h-9 w-full text-sm text-right px-2" />
                            </td>
                            <td className="p-1">
                              {(() => {
                                const units = it.product_id ? unitsByProduct[it.product_id] : undefined;
                                if (units && units.length > 0) {
                                  const known = units.some((u) => u.name.toLowerCase() === (it.unit_name || "").toLowerCase());
                                  return (
                                    <select
                                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                                      value={known ? it.unit_name : "__custom"}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        if (v === "__custom") { updateItem(i, { unit_name: "", unit_conversion: "1" }); return; }
                                        changeUnit(i, v);
                                      }}
                                    >
                                      {units.map((u) => (
                                        <option key={u.id || u.name} value={u.name}>{u.name} (isi {u.conversion})</option>
                                      ))}
                                      <option value="__custom">Satuan lain…</option>
                                    </select>
                                  );
                                }
                                return <Input list="po-units" value={it.unit_name} onChange={(e) => updateItem(i, { unit_name: e.target.value })} className="h-9 w-full text-sm px-2" placeholder="pcs/dus/rcg" />;
                              })()}
                            </td>

                            <td className="p-1">
                              <Input type="number" value={it.unit_conversion} onChange={(e) => updateItem(i, { unit_conversion: e.target.value })} className="h-9 w-full text-sm text-right" />
                            </td>
                            <td className="p-1 text-right">
                              {oldCostPcs > 0 ? (
                                <div className="text-xs">
                                  <div className="font-medium">{formatRupiah(oldCostPcs)}</div>
                                  <div className="text-[10px] text-muted-foreground">/pcs</div>
                                </div>
                              ) : (
                                <div className="text-[10px] text-muted-foreground">baru</div>
                              )}
                            </td>
                            <td className="p-1">
                              <Input type="number" value={it.unit_cost} onChange={(e) => updateItem(i, { unit_cost: e.target.value })} className="h-9 text-sm text-right" />
                              {conv > 1 && (
                                <div className="mt-0.5 text-[10px] text-right text-muted-foreground">= {formatRupiah(parseNumber(it.unit_cost) / conv)}/pcs</div>
                              )}
                            </td>
                            <td className="p-1">
                              <Input
                                type="number"
                                value={((): string => {
                                  const perPcs = parseNumber(it.unit_cost) / conv;
                                  return perPcs > 0 ? String(Math.round(perPcs * 100) / 100) : "";
                                })()}
                                onChange={(e) => {
                                  const perPcs = parseNumber(e.target.value);
                                  updateItem(i, { unit_cost: String(Math.round(perPcs * conv * 100) / 100) });
                                }}
                                className="h-9 text-sm text-right"
                                placeholder="—"
                              />
                              {costDiff !== 0 && (
                                <div className={`mt-0.5 text-[10px] text-right font-semibold ${costDiff > 0 ? "text-destructive" : "text-emerald-600"}`}>
                                  {costDiff > 0 ? "+" : ""}{formatRupiah(costDiff)}/pcs
                                </div>
                              )}
                            </td>
                            <td className="p-1">
                              <Input type="number" value={it.sell_price} onChange={(e) => updateItem(i, { sell_price: e.target.value })} className="h-9 text-sm text-right" placeholder="—" />
                              {(() => {
                                const cost = parseNumber(it.unit_cost);
                                const sell = parseNumber(it.sell_price);
                                if (!cost || !sell) return null;
                                const perPcs = sell - cost / conv;
                                const total = perPcs * (parseInt(it.qty || "0", 10) || 0) * conv;
                                return (
                                  <div className={`mt-0.5 text-[10px] text-right font-semibold ${perPcs >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                                    +{formatRupiah(perPcs)}/pcs • {formatRupiah(total)}
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="p-1 text-right text-xs text-primary font-semibold">{stockAdd}</td>
                            <td className="p-1 text-right font-medium">{formatRupiah(sub)}</td>
                            <td className="p-1 text-center">
                              <Button size="icon" variant="ghost" onClick={() => removeItem(i)} className="h-8 w-8 text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>

                </table>
              </div>
            </div>

            <div className="md:col-span-2">
              <AIInvoiceCapture
                open={aiOpen}
                inline
                onClose={() => setAiOpen(false)}
                onResult={applyInvoiceResult}
                existingProducts={products.map((p) => ({ id: p.id, name: p.name, barcode: p.barcode, code: p.code }))}
                existingCategories={Array.from(new Set(products.map((p) => (p.category || "").trim()).filter(Boolean)))}
              />

            </div>

            <div className="md:col-span-2 flex flex-wrap justify-between border-t pt-2 text-sm gap-2">
              <span className="text-muted-foreground">{itemCount} item</span>
              <div className="flex items-center gap-4">
                {totalProfitExpected > 0 && (
                  <span className="text-xs text-emerald-600 font-semibold">
                    Untung ekspektasi: {formatRupiah(totalProfitExpected)}
                  </span>
                )}
                <span className="text-base font-semibold text-primary">{formatRupiah(total)}</span>
              </div>
            </div>


          </div>


          <div ref={poActionsRef} className="sticky bottom-0 -mx-6 border-t bg-background/95 px-6 pt-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>
                Batal
              </Button>
              <Button variant="secondary" onClick={() => saveDraft("draft")} disabled={saving}>
                {editingPoId ? "Simpan Perubahan Draft" : "Simpan Draft"}
              </Button>
              <Button onClick={() => saveDraft("ordered")} disabled={saving}>
                {saving ? "Menyimpan..." : editingPoId ? "Simpan & Pesan" : "Buat & Pesan"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailOpen} onOpenChange={(o) => !o && setDetailOpen(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>
              PO #{detailOpen?.id.slice(0, 8)} — {detailOpen?.supplier}
            </DialogTitle>
            <DialogDescription>
              {detailOpen && new Date(detailOpen.created_at).toLocaleString("id-ID")}
            </DialogDescription>
          </DialogHeader>
          {detailOpen && (
            <div className="space-y-3 text-sm overflow-y-auto px-6 pb-6 flex-1">
              <div className="flex items-center gap-2">
                <StatusBadge status={detailOpen.status} />
                <div className="ml-auto">
                  <Select
                    value={detailOpen.status}
                    onValueChange={(v) => updateStatus(detailOpen, v)}
                  >
                    <SelectTrigger className="h-8 w-40 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="ordered">Dipesan</SelectItem>
                      <SelectItem value="received">Diterima (+stok)</SelectItem>
                      <SelectItem value="cancelled">Dibatalkan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {detailOpen.notes && (
                <div className="rounded bg-muted p-2 text-xs">
                  <span className="font-medium">Catatan:</span> {detailOpen.notes}
                </div>
              )}
              <ul className="divide-y rounded border">
                {detailItems.map((it) => {
                  const conv = Math.max(1, Number(it.unit_conversion || 1));
                  const cost = Number(it.unit_cost || 0);
                  const sell = Number(it.sell_price || 0);
                  const profit = sell > 0 && cost > 0 ? (sell - cost / conv) * it.qty * conv : 0;
                  return (
                    <li key={it.id} className="flex justify-between gap-2 p-2">
                      <div>
                        <div className="font-medium">{it.product_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {it.product_code} • {it.qty} {it.unit_name || "pcs"} × {formatRupiah(cost)}
                          {conv > 1 && <span className="ml-1 text-primary">= {it.qty * conv} pcs</span>}
                        </div>
                        {profit > 0 && (
                          <div className="text-[11px] text-emerald-600 font-semibold">
                            Untung: {formatRupiah(profit)}
                          </div>
                        )}
                      </div>
                      <div className="font-semibold">{formatRupiah(Number(it.subtotal))}</div>
                    </li>
                  );
                })}
              </ul>
              {(() => {
                const totalProfit = detailItems.reduce((s, it) => {
                  const conv = Math.max(1, Number(it.unit_conversion || 1));
                  const cost = Number(it.unit_cost || 0);
                  const sell = Number(it.sell_price || 0);
                  if (!cost || !sell) return s;
                  return s + (sell - cost / conv) * it.qty * conv;
                }, 0);
                return totalProfit > 0 ? (
                  <div className="flex justify-between text-sm border-t pt-2">
                    <span className="text-muted-foreground">Untung ekspektasi</span>
                    <span className="font-semibold text-emerald-600">{formatRupiah(totalProfit)}</span>
                  </div>
                ) : null;
              })()}
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Total Modal</span>
                <span>{formatRupiah(Number(detailOpen.total))}</span>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => printPO(detailOpen, detailItems)}>
                  <Download className="mr-2 h-4 w-4" /> Cetak / PDF
                </Button>
                {(detailOpen as any).receipt_image_path && (
                  <Button size="sm" variant="outline" onClick={() => openReceipt(detailOpen)} disabled={receiptLoading}>
                    <ImageIcon className="mr-2 h-4 w-4" /> {receiptLoading ? "Membuka..." : "Lihat Struk"}
                  </Button>
                )}

                {detailOpen.status === "draft" && (
                  <Button size="sm" variant="secondary" onClick={() => editDraft(detailOpen)}>
                    <ClipboardList className="mr-2 h-4 w-4" /> Edit Draft
                  </Button>
                )}
                {detailOpen.status !== "received" && detailOpen.status !== "cancelled" && (
                  <Button size="sm" onClick={() => setReceiveFor(detailOpen)}>
                    <PackageCheck className="mr-2 h-4 w-4" /> Terima Barang
                  </Button>
                )}
                {detailOpen.status !== "cancelled" && detailOpen.status !== "received" && (
                  <Button size="sm" variant="outline" onClick={() => updateStatus(detailOpen, "cancelled")}>
                    <XCircle className="mr-2 h-4 w-4" /> Batalkan
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => removePO(detailOpen)}
                  className="ml-auto text-destructive hover:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Hapus PO
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ReceivingDialog
        open={!!receiveFor}
        poId={receiveFor?.id ?? null}
        poSupplier={receiveFor?.supplier}
        onOpenChange={(o) => { if (!o) setReceiveFor(null); }}
        onDone={() => { setReceiveFor(null); setDetailOpen(null); load(); }}
      />

      <Dialog open={!!receiptViewOpen} onOpenChange={(o) => !o && setReceiptViewOpen(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Struk / Nota — {receiptViewOpen?.supplier}</DialogTitle>
            <DialogDescription>Foto struk yang disimpan bersama PO.</DialogDescription>
          </DialogHeader>
          {receiptViewOpen && (
            <div className="space-y-2">
              <img
                src={receiptViewOpen.url}
                alt="Struk PO"
                className="max-h-[70vh] w-full rounded border object-contain bg-muted"
              />
              <div className="flex justify-end">
                <a href={receiptViewOpen.url} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="outline">
                    <Download className="mr-2 h-4 w-4" /> Buka di tab baru
                  </Button>
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    draft: "outline",
    ordered: "secondary",
    received: "default",
    cancelled: "destructive",
  };
  return <Badge variant={variants[status] || "outline"}>{STATUS_LABEL[status] || status}</Badge>;
}

function ProductNameCombobox({
  value,
  disabled,
  products,
  onPick,
  onChangeText,
  className,
  placeholder,
}: {
  value: string;
  disabled?: boolean;
  products: Product[];
  onPick: (p: Product) => void;
  onChangeText: (v: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Input
        value={value}
        disabled={disabled}
        onChange={(e) => onChangeText(e.target.value)}
        className={className}
        placeholder={placeholder || "Nama barang"}
        title={value}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 flex items-center justify-center rounded hover:bg-muted"
            aria-label="Pilih produk"
          >
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[320px]" align="start">
          <Command
            filter={(val, search) => {
              if (!search) return 1;
              return val.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
            }}
          >
            <CommandInput placeholder="Cari nama / kode / kategori..." />
            <CommandList>
              <CommandEmpty>Tidak ada produk</CommandEmpty>
              <CommandGroup>
                {products.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={`${p.name} ${p.code} ${p.category || ""}`}
                    onSelect={() => {
                      onPick(p);
                      setOpen(false);
                    }}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm truncate">{p.name}</span>
                      <span className="text-[10px] text-muted-foreground truncate">
                        {p.code}
                        {p.category ? ` • ${p.category}` : ""}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

type PurchaseHistoryRow = {
  po_id: string;
  created_at: string;
  supplier: string;
  notes: string | null;
  received_status: string;
  qty: number;
  qty_received: number;
  unit_name: string | null;
  unit_conversion: number;
  unit_cost: number;
  subtotal: number;
};

function ProductPurchaseHistoryCard({ products }: { products: Product[] }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Product | null>(null);
  const [rows, setRows] = useState<PurchaseHistoryRow[]>([]);
  const [soldQty, setSoldQty] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState<Date>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [endDate, setEndDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  });

  useEffect(() => {
    if (!picked) { setRows([]); setSoldQty(0); return; }
    (async () => {
      setLoading(true);
      try {
        const startIso = startDate.toISOString();
        const endIso = endDate.toISOString();
        const { data: items } = await (supabase as any)
          .from("purchase_order_items")
          .select("po_id,qty,qty_received,unit_name,unit_conversion,unit_cost,subtotal,product_code,purchase_orders:po_id(id,supplier,notes,created_at,received_status)")
          .or(`product_id.eq.${picked.id},product_code.eq.${picked.code}`)
          .gte("purchase_orders.created_at", startIso)
          .lte("purchase_orders.created_at", endIso)
          .order("po_id", { ascending: false });
        const list: PurchaseHistoryRow[] = ((items as any[]) || [])
          .map((r) => ({
            po_id: r.po_id,
            created_at: r.purchase_orders?.created_at || "",
            supplier: r.purchase_orders?.supplier || "-",
            notes: r.purchase_orders?.notes || null,
            received_status: r.purchase_orders?.received_status || "pending",
            qty: Number(r.qty || 0),
            qty_received: Number(r.qty_received || 0),
            unit_name: r.unit_name || null,
            unit_conversion: Number(r.unit_conversion || 1),
            unit_cost: Number(r.unit_cost || 0),
            subtotal: Number(r.subtotal || 0),
          }))
          .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
        setRows(list);

        // Total terjual (dari transaction_items - refund otomatis diperhitungkan trigger)
        const { data: sold } = await (supabase as any)
          .from("transaction_items")
          .select("qty,unit_conversion")
          .or(`product_id.eq.${picked.id},product_code.eq.${picked.code}`)
          .gte("created_at", startIso)
          .lte("created_at", endIso);
        const totalSold = ((sold as any[]) || []).reduce(
          (s, r) => s + Number(r.qty || 0) * Number(r.unit_conversion || 1),
          0,
        );
        setSoldQty(totalSold);
      } catch (e: any) {
        toast.error(e.message || "Gagal memuat riwayat");
      } finally {
        setLoading(false);
      }
    })();
  }, [picked, startDate, endDate]);

  const totalPurchased = rows.reduce((s, r) => s + r.qty_received * r.unit_conversion, 0);
  const totalSpent = rows.reduce((s, r) => s + r.subtotal, 0);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 p-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <div className="text-sm font-semibold flex-1 min-w-[160px]">Riwayat Pembelian Produk</div>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="min-w-[220px] justify-between">
              <span className="truncate">{picked ? picked.name : "Pilih produk..."}</span>
              <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-0 w-[320px]" align="end">
            <Command
              filter={(val, search) => {
                if (!search) return 1;
                return val.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
              }}
            >
              <CommandInput placeholder="Cari nama / kode / kategori..." />
              <CommandList>
                <CommandEmpty>Tidak ada produk</CommandEmpty>
                <CommandGroup>
                  {products.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={`${p.name} ${p.code} ${p.category || ""}`}
                      onSelect={() => { setPicked(p); setOpen(false); }}
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm truncate">{p.name}</span>
                        <span className="text-[10px] text-muted-foreground truncate">
                          {p.code}{p.category ? ` • ${p.category}` : ""}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {picked && (
          <Button variant="ghost" size="sm" onClick={() => setPicked(null)}>
            <XIcon className="h-4 w-4" />
          </Button>
        )}
      </div>

      {!picked ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          Pilih produk untuk melihat kapan dibeli, dari supplier mana, berapa banyak, dan sudah terjual berapa.
        </div>
      ) : loading ? (
        <div className="p-6 text-center text-sm text-muted-foreground">Memuat...</div>
      ) : (
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 border-b bg-muted/10 text-xs">
            <div>
              <div className="text-muted-foreground">Stok Sekarang</div>
              <div className="font-semibold text-sm">{picked.stock} pcs</div>
            </div>
            <div>
              <div className="text-muted-foreground">Total Dibeli (diterima)</div>
              <div className="font-semibold text-sm">{totalPurchased} pcs</div>
            </div>
            <div>
              <div className="text-muted-foreground">Total Terjual</div>
              <div className="font-semibold text-sm text-emerald-600">{soldQty} pcs</div>
            </div>
            <div>
              <div className="text-muted-foreground">Total Belanja</div>
              <div className="font-semibold text-sm">{formatRupiah(totalSpent)}</div>
            </div>
          </div>

          <div className="max-h-80 overflow-auto">
            {rows.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Belum ada riwayat PO untuk produk ini.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground sticky top-0">
                  <tr>
                    <th className="p-2">Tanggal</th>
                    <th className="p-2">Supplier</th>
                    <th className="p-2">Catatan</th>
                    <th className="p-2 text-right">Pesan / Terima</th>
                    <th className="p-2 text-right">Harga</th>
                    <th className="p-2 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.po_id}-${i}`} className="border-t hover:bg-muted/40">
                      <td className="p-2 whitespace-nowrap text-xs">
                        {r.created_at ? new Date(r.created_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "-"}
                      </td>
                      <td className="p-2 font-medium">{r.supplier}</td>
                      <td className="p-2 text-xs text-muted-foreground max-w-[220px] truncate" title={r.notes || ""}>
                        {r.notes || "-"}
                      </td>
                      <td className="p-2 text-right text-xs">
                        {r.qty} / <span className="text-primary">{r.qty_received}</span> {r.unit_name || "pcs"}
                        {r.unit_conversion > 1 && (
                          <div className="text-[10px] text-muted-foreground">= {r.qty_received * r.unit_conversion} pcs</div>
                        )}
                      </td>
                      <td className="p-2 text-right text-xs">{formatRupiah(r.unit_cost)}</td>
                      <td className="p-2 text-right font-medium">{formatRupiah(r.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

