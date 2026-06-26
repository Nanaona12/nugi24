import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
import { AIPhotoCapture } from "@/components/AIPhotoCapture";
import type { AiVisionResult } from "@/lib/ai-vision.functions";


export const Route = createFileRoute("/_authenticated/po")({
  component: POPage,
});

type Product = {
  id: string;
  code: string;
  barcode: string | null;
  name: string;
  price: number;
  stock: number;
};

type PO = {
  id: string;
  supplier: string;
  status: string;
  notes: string | null;
  total: number;
  item_count: number;
  created_at: string;
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
};

type DraftItem = {
  product_id: string | null;
  product_code: string;
  product_name: string;
  qty: string;
  unit_cost: string;
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


  const load = async () => {
    const [{ data: poData, error: e1 }, { data: pData, error: e2 }] = await Promise.all([
      supabase.from("purchase_orders").select("*").order("created_at", { ascending: false }),
      supabase.from("products").select("id,code,barcode,name,price,stock").order("name"),
    ]);
    if (e1) toast.error(e1.message);
    else setPos((poData || []) as PO[]);
    if (e2) toast.error(e2.message);
    else setProducts((pData || []) as Product[]);
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

  const resetForm = () => {
    setSupplier("");
    setNotes("");
    setItems([]);
    setPickQuery("");
  };

  const lowStockProducts = useMemo(() => {
    return products
      .filter((p) => (p.stock ?? 0) <= lowThreshold)
      .sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0));
  }, [products, lowThreshold]);

  const outOfStockCount = lowStockProducts.filter((p) => (p.stock ?? 0) <= 0).length;

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
        unit_cost: String(p.price),
      },
    ]);
  };

  const buildDraftItem = (p: Product, suggestedQty: number): DraftItem => ({
    product_id: p.id,
    product_code: p.code,
    product_name: p.name,
    qty: String(Math.max(1, suggestedQty)),
    unit_cost: String(p.price),
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
    // suggested qty: restock to (threshold * 2) - current stock, min 1
    const target = Math.max(lowThreshold * 2, 10);
    setItems(pool.map((p) => buildDraftItem(p, target - (p.stock ?? 0))));
    setCreateOpen(true);
  };

  const addLowStockToDraft = (p: Product) => {
    const target = Math.max(lowThreshold * 2, 10);
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
      { product_id: null, product_code: "", product_name: "", qty: "1", unit_cost: "0" },
    ]);
  };

  const applyAiResultToPO = (r: AiVisionResult) => {
    // Try to match existing product by barcode or name
    const matched = products.find((p) =>
      (r.barcode && p.barcode && p.barcode === r.barcode) ||
      (r.name && p.name.toLowerCase() === r.name.toLowerCase()),
    );
    const totalQty = r.expiry_batches.reduce((s, b) => s + b.qty, 0);
    const qty = totalQty > 0 ? totalQty : 1;
    const cost = r.cost_price ?? matched?.price ?? r.recommended_price?.price ?? 0;
    setItems((prev) => [
      ...prev,
      {
        product_id: matched?.id ?? null,
        product_code: matched?.code ?? "",
        product_name: matched?.name ?? r.name ?? "",
        qty: String(qty),
        unit_cost: String(Math.round(cost)),
      },
    ]);
    if (r.recommended_price?.price) {
      toast.success(`Rekomendasi harga jual: Rp ${Math.round(r.recommended_price.price).toLocaleString("id-ID")} (margin ~${Math.round(r.recommended_price.margin_pct ?? 0)}%)`);
    } else {
      toast.success("Item ditambahkan dari AI");
    }
  };




  const updateItem = (i: number, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
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

    const rows = valid.map((it) => {
      const qty = parseInt(it.qty || "0", 10) || 0;
      const unit_cost = parseNumber(it.unit_cost);
      const prod = it.product_id ? products.find((p) => p.id === it.product_id) : null;
      return {
        po_id: po.id,
        product_id: it.product_id,
        product_code: it.product_code || "-",
        product_barcode: prod?.barcode || null,
        product_name: it.product_name,
        qty,
        unit_cost,
        subtotal: qty * unit_cost,
      };
    });

    const { error: e2 } = await supabase.from("purchase_order_items").insert(rows);
    setSaving(false);
    if (e2) return toast.error(e2.message);

    toast.success(`PO ${status === "draft" ? "disimpan sebagai draft" : "dibuat"}`);
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
        .select("product_id, qty")
        .eq("po_id", po.id);
      for (const it of (poItems as { product_id: string | null; qty: number }[]) || []) {
        if (!it.product_id) continue;
        const { data: prod } = await supabase
          .from("products")
          .select("stock")
          .eq("id", it.product_id)
          .single();
        if (prod) {
          await supabase
            .from("products")
            .update({ stock: (prod.stock || 0) + it.qty })
            .eq("id", it.product_id);
        }
      }
      toast.success("PO diterima — stok diperbarui");
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
        (it) => `
        <tr>
          <td>${it.product_code}</td>
          <td>${it.product_name}</td>
          <td style="text-align:right">${it.qty}</td>
          <td style="text-align:right">${formatRupiah(Number(it.unit_cost))}</td>
          <td style="text-align:right">${formatRupiah(Number(it.subtotal))}</td>
        </tr>`,
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
                {" • "}batas ≤ {lowThreshold}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Label className="text-xs whitespace-nowrap">Batas</Label>
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
                  <th className="p-2 text-right">Harga</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {lowStockProducts.map((p) => {
                  const out = (p.stock ?? 0) <= 0;
                  return (
                    <tr key={p.id} className="border-t hover:bg-muted/40">
                      <td className="p-2 font-mono text-xs">{p.code}</td>
                      <td className="p-2 font-medium">{p.name}</td>
                      <td className="p-2 text-right">
                        <Badge variant={out ? "destructive" : "secondary"}>
                          {out ? "Habis" : `${p.stock} tersisa`}
                        </Badge>
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
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Buat Purchase Order</DialogTitle>
            <DialogDescription>
              Pilih produk dari katalog atau tambahkan manual.
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

          <div className="mt-3 grid gap-4 md:grid-cols-[260px_1fr]">
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
                  <div className="p-4 text-center text-xs text-muted-foreground">Tidak ada produk</div>
                ) : (
                  filteredProducts.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => addProduct(p)}
                      className="block w-full border-b p-2 text-left text-xs hover:bg-muted last:border-b-0"
                    >
                      <div className="font-medium">{p.name}</div>
                      <div className="text-muted-foreground">
                        {p.code}{p.barcode ? ` • ${p.barcode}` : ""} • Stok {p.stock} • {formatRupiah(p.price)}
                      </div>
                    </button>
                  ))
                )}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="outline" size="sm" onClick={addManual} className="flex-1">
                  <Plus className="mr-2 h-4 w-4" /> Item Manual
                </Button>
                <Button type="button" size="sm" onClick={() => setAiOpen(true)} className="flex-1">
                  <Sparkles className="mr-2 h-4 w-4" /> Scan dengan AI
                </Button>
              </div>
            </div>

            {/* Items table */}
            <div className="space-y-2">
              <div className="max-h-80 overflow-auto rounded border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted text-left">
                    <tr>
                      <th className="p-2">Kode</th>
                      <th className="p-2">Nama</th>
                      <th className="p-2 w-20 text-right">Qty</th>
                      <th className="p-2 w-28 text-right">Harga</th>
                      <th className="p-2 w-24 text-right">Subtotal</th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-muted-foreground">
                          Belum ada item
                        </td>
                      </tr>
                    ) : (
                      items.map((it, i) => {
                        const sub = parseNumber(it.qty) * parseNumber(it.unit_cost);
                        return (
                          <tr key={i} className="border-t">
                            <td className="p-1">
                              <Input
                                value={it.product_code}
                                onChange={(e) => updateItem(i, { product_code: e.target.value })}
                                className="h-8 text-xs"
                                disabled={!!it.product_id}
                              />
                            </td>
                            <td className="p-1">
                              <Input
                                value={it.product_name}
                                onChange={(e) => updateItem(i, { product_name: e.target.value })}
                                className="h-8 text-xs"
                                disabled={!!it.product_id}
                              />
                            </td>
                            <td className="p-1">
                              <Input
                                type="number"
                                value={it.qty}
                                onChange={(e) => updateItem(i, { qty: e.target.value })}
                                className="h-8 text-xs text-right"
                              />
                            </td>
                            <td className="p-1">
                              <Input
                                type="number"
                                value={it.unit_cost}
                                onChange={(e) => updateItem(i, { unit_cost: e.target.value })}
                                className="h-8 text-xs text-right"
                              />
                            </td>
                            <td className="p-1 text-right font-medium">{formatRupiah(sub)}</td>
                            <td className="p-1 text-center">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => removeItem(i)}
                                className="h-7 w-7 text-destructive"
                              >
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
              <div className="flex justify-between border-t pt-2 text-sm">
                <span className="text-muted-foreground">{itemCount} item</span>
                <span className="text-base font-semibold text-primary">{formatRupiah(total)}</span>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button variant="secondary" onClick={() => saveDraft("draft")} disabled={saving}>
              Simpan Draft
            </Button>
            <Button onClick={() => saveDraft("ordered")} disabled={saving}>
              {saving ? "Menyimpan..." : "Buat & Pesan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailOpen} onOpenChange={(o) => !o && setDetailOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              PO #{detailOpen?.id.slice(0, 8)} — {detailOpen?.supplier}
            </DialogTitle>
            <DialogDescription>
              {detailOpen && new Date(detailOpen.created_at).toLocaleString("id-ID")}
            </DialogDescription>
          </DialogHeader>
          {detailOpen && (
            <div className="space-y-3 text-sm">
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
                {detailItems.map((it) => (
                  <li key={it.id} className="flex justify-between gap-2 p-2">
                    <div>
                      <div className="font-medium">{it.product_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {it.product_code} • {it.qty} × {formatRupiah(Number(it.unit_cost))}
                      </div>
                    </div>
                    <div className="font-semibold">{formatRupiah(Number(it.subtotal))}</div>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Total</span>
                <span>{formatRupiah(Number(detailOpen.total))}</span>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => printPO(detailOpen, detailItems)}>
                  <Download className="mr-2 h-4 w-4" /> Cetak / PDF
                </Button>
                {detailOpen.status !== "received" && detailOpen.status !== "cancelled" && (
                  <Button size="sm" onClick={() => updateStatus(detailOpen, "received")}>
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Tandai Diterima
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

      <AIPhotoCapture
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onResult={applyAiResultToPO}
      />
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
