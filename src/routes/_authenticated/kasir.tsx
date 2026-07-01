import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatRupiah } from "@/lib/format";
import {
  Plus,
  Minus,
  Trash2,
  Search,
  Receipt as ReceiptIcon,
  X,
  Copy,
  Check,
  Loader2,
  LockKeyhole,
  LogOut as LogOutIcon,
  Wallet,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  ProductUnit,
  loadUnitsForProducts,
  fallbackUnitFromProduct,
  tierPriceFor,
  PriceTier,
} from "@/lib/product-pricing";
import { useServerFn } from "@tanstack/react-start";
import { sendFonnteWaImage, sendFonnteWaUrl } from "@/lib/fonnte.functions";
import { renderReceiptPng, type ReceiptItem } from "@/lib/receipt-image";
import { CashierLock, type ActiveShift } from "@/components/CashierLock";
import { ShiftCloseDialog } from "@/components/ShiftCloseDialog";
import { RefundDialog } from "@/components/RefundDialog";
import { AIOrderDialog, type AiOrderItem } from "@/components/AIOrderDialog";
import { openShift as openShiftFn, deductProductStock as deductProductStockFn } from "@/lib/cashier.functions";

import { parseNumber } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/kasir")({
  component: KasirPage,
});

type Product = {
  id: string;
  code: string;
  barcode: string | null;
  name: string;
  category: string | null;
  price: number;
  cost_price: number;
  wholesale_price: number | null;
  wholesale_min_qty: number | null;
  stock: number;
};

type SaleMode = "eceran" | "grosiran";

type CartLine = {
  key: string;
  product: Product;
  mode: SaleMode;
  // Eceran: unit = base unit, qty = jumlah pcs
  // Grosiran: unit = grosir unit (conv>1), qty = jumlah pcs total (auto split pak + sisa eceran)
  unit: ProductUnit; // unit grosir untuk mode grosiran; base unit untuk eceran
  baseUnit: ProductUnit; // selalu unit dasar (untuk harga eceran sisa)
  qty: number; // dalam pcs (unit dasar)
};

function getUnits(p: Product, map: Record<string, ProductUnit[]>): ProductUnit[] {
  const arr = map[p.id];
  if (arr && arr.length > 0) return arr;
  return [fallbackUnitFromProduct(p)];
}

/** Hitung subtotal & rincian untuk satu line.
 *  Untuk mode eceran, jika `allUnits` diberikan, sistem otomatis memakai
 *  unit grosir terbesar yang muat (greedy) — mis. 13 pcs -> 1 slove + 3 pcs.
 */
function computeLine(
  l: CartLine,
  allUnits?: ProductUnit[],
): { total: number; packs: number; remainder: number; packPrice: number; ecerPrice: number; autoUnit?: ProductUnit } {
  if (l.mode === "eceran") {
    // cari unit grosir terbesar yang muat
    const grosir = (allUnits || []).filter((u) => u.conversion > 1).sort((a, b) => b.conversion - a.conversion);
    for (const g of grosir) {
      if (l.qty >= g.conversion) {
        const conv = g.conversion;
        const packs = Math.floor(l.qty / conv);
        const remainder = l.qty - packs * conv;
        const packPrice = tierPriceFor(g, Math.max(1, packs)).price;
        const ecerPrice = tierPriceFor(l.baseUnit, Math.max(1, remainder)).price;
        return {
          total: packs * packPrice + remainder * ecerPrice,
          packs,
          remainder,
          packPrice,
          ecerPrice,
          autoUnit: g,
        };
      }
    }
    const ecerPrice = tierPriceFor(l.baseUnit, l.qty).price;
    return { total: ecerPrice * l.qty, packs: 0, remainder: l.qty, packPrice: 0, ecerPrice };
  }
  const conv = Math.max(1, l.unit.conversion);
  const packs = Math.floor(l.qty / conv);
  const remainder = l.qty - packs * conv;
  const packPrice = tierPriceFor(l.unit, Math.max(1, packs)).price;
  const ecerPrice = tierPriceFor(l.baseUnit, Math.max(1, remainder)).price;
  return {
    total: packs * packPrice + remainder * ecerPrice,
    packs,
    remainder,
    packPrice,
    ecerPrice,
  };
}

function KasirPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [unitsByProduct, setUnitsByProduct] = useState<Record<string, ProductUnit[]>>({});
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paid, setPaid] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "qris" | "split">("cash");
  const [splitCash, setSplitCash] = useState("");
  const [splitQris, setSplitQris] = useState("");
  const [sendWa, setSendWa] = useState(false);
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [lastReceipt, setLastReceipt] = useState<null | {
    id: string;
    total: number;
    paid: number;
    change: number;
    items: CartLine[];
    at: Date;
    paymentMethod: "cash" | "qris" | "split";
    cashPart?: number;
    qrisPart?: number;
    customerPhone: string | null;
    customerName: string | null;
  }>(null);
  const [copied, setCopied] = useState(false);
  const [sendingWa, setSendingWa] = useState(false);

  const buildReceiptCaption = (r: {
    id: string;
    total: number;
    paid: number;
    change: number;
    items: CartLine[];
    at: Date;
    paymentMethod: "cash" | "qris" | "split";
    cashPart?: number;
    qrisPart?: number;
    customerPhone: string | null;
    customerName: string | null;
  }) => {
    const lines: string[] = [];
    lines.push(`*${storeName || "Toko"}*`);
    lines.push(`Struk #${r.id.slice(0, 8)}`);
    lines.push(new Date(r.at).toLocaleString("id-ID"));
    if (r.customerName) lines.push(`Pelanggan: ${r.customerName}`);
    if (r.customerPhone) lines.push(`No: ${r.customerPhone}`);
    lines.push(`--------------------------------`);
    for (const it of r.items) {
      const c = computeLine(it, getUnits(it.product, unitsByProduct));
      const showPack = c.packs > 0 && (it.mode === "grosiran" || c.autoUnit);
      const packName = it.mode === "grosiran" ? it.unit.name : c.autoUnit?.name || "";
      lines.push(`${it.product.name}`);
      if (showPack) {
        lines.push(`  ${c.packs} ${packName} x ${formatRupiah(c.packPrice)} = ${formatRupiah(c.packs * c.packPrice)}`);
        if (c.remainder > 0) {
          lines.push(
            `  ${c.remainder} ${it.baseUnit.name} x ${formatRupiah(c.ecerPrice)} = ${formatRupiah(
              c.remainder * c.ecerPrice,
            )}`,
          );
        }
      } else {
        lines.push(`  ${it.qty} ${it.baseUnit.name} x ${formatRupiah(c.ecerPrice)} = ${formatRupiah(c.total)}`);
      }
    }
    lines.push(`--------------------------------`);
    lines.push(`Total   : ${formatRupiah(r.total)}`);
    if (r.paymentMethod === "split") {
      lines.push(`Cash    : ${formatRupiah(r.cashPart || 0)}`);
      lines.push(`QRIS    : ${formatRupiah(r.qrisPart || 0)}`);
      lines.push(`Bayar   : ${formatRupiah(r.paid)} (SPLIT)`);
    } else {
      lines.push(`Bayar   : ${formatRupiah(r.paid)} (${r.paymentMethod.toUpperCase()})`);
    }
    lines.push(`Kembali : ${formatRupiah(r.change)}`);
    lines.push(``);
    lines.push(`Terima kasih sudah berbelanja 🙏`);
    return lines.join("\n");
  };

  const sendReceiptImageWa = async (
    target: string,
    caption: string,
    imageDataUrl: string,
    filename: string,
  ): Promise<boolean> => {
    const base64 = imageDataUrl.split(",")[1] || "";
    const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bin], { type: "image/png" });
    try {
      const { data: tid, error: tidErr } = await supabase.rpc("current_tenant_id");
      const tenantId = tid as string | null;
      if (!tenantId) {
        throw new Error("Akun ini tidak terhubung ke toko" + (tidErr ? `: ${tidErr.message}` : ""));
      }
      const objectPath = `${tenantId}/${filename}`;
      const upload = await supabase.storage.from("receipts").upload(objectPath, blob, {
        upsert: true,
        contentType: "image/png",
      });
      let publicUrl: string | null = null;
      if (!upload.error) {
        const signed = await supabase.storage.from("receipts").createSignedUrl(objectPath, 60 * 60 * 24 * 7);
        publicUrl = signed.data?.signedUrl ?? null;
      }

      const res = publicUrl
        ? await sendWaUrlFn({
            data: {
              target,
              message: caption,
              url: publicUrl,
              filename,
            },
          })
        : await sendWaImgFn({
            data: {
              target,
              caption,
              filename,
              imageBase64: base64,
            },
          });

      if (!res.ok) {
        throw new Error(res.error || "Gagal kirim WhatsApp");
      }
      toast.success("E-struk (gambar) terkirim via WhatsApp");
      return true;
    } catch (e: any) {
      toast.error("Gagal kirim WhatsApp: " + (e?.message || "unknown"));
      return false;
    }
  };

  const [modePicker, setModePicker] = useState<Product | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const sendWaImgFn = useServerFn(sendFonnteWaImage);
  const sendWaUrlFn = useServerFn(sendFonnteWaUrl);
  const [receiptImg, setReceiptImg] = useState<string | null>(null);
  const [storeName, setStoreName] = useState<string>("Toko");
  const [staticQrisPayload, setStaticQrisPayload] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<{ id: string; name: string; phone: string | null; points: number }[]>([]);
  const normalizePhone = (phone: string) => phone.replace(/[^\d]/g, "");
  const selectedCustomer = customers.find((c) => c.id === customerId) ??
    customers.find((c) => c.phone && normalizePhone(c.phone) === normalizePhone(customerPhone));

  // QRIS state (static-only)
  const [qris, setQris] = useState<null | {
    order_id: string;
    qr_url: string;
    amount: number;
    status: "pending" | "paid" | "expired" | "failed";
    source: "static";
  }>(null);
  const [qrisLoading, setQrisLoading] = useState(false);

  // --- Shift / Cashier lock ---
  const SHIFT_KEY = "dp.active_shift";
  const CASHIER_KEY = "dp.active_cashier";
  const [activeCashier, setActiveCashier] = useState<{ id: string; name: string } | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const s = localStorage.getItem(CASHIER_KEY);
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  });
  const isCashierSession = !!activeCashier;
  const [activeShift, setActiveShift] = useState<ActiveShift | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const s = localStorage.getItem(SHIFT_KEY);
      return s ? (JSON.parse(s) as ActiveShift) : null;
    } catch {
      return null;
    }
  });
  const [lockOpen, setLockOpen] = useState(!activeShift && !isCashierSession);
  const [openingDialogOpen, setOpeningDialogOpen] = useState(isCashierSession && !activeShift);
  const [openingCash, setOpeningCash] = useState("");
  const [openingShiftLoading, setOpeningShiftLoading] = useState(false);
  const openShiftFnCb = useServerFn(openShiftFn);
  const deductStockFn = useServerFn(deductProductStockFn);
  const [closeOpen, setCloseOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [aiOrderOpen, setAiOrderOpen] = useState(false);

  // --- Draft (cart yang ditahan / disimpan sementara) ---
  type CartDraft = { id: string; customer_name: string; note?: string; items: CartLine[]; saved_at: string };
  const [drafts, setDrafts] = useState<CartDraft[]>([]);
  const [saveDraftOpen, setSaveDraftOpen] = useState(false);
  const [draftListOpen, setDraftListOpen] = useState(false);
  const [draftCustomer, setDraftCustomer] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const draftKey = tenantId ? `dp.cart_drafts.${tenantId}` : null;
  useEffect(() => {
    if (!draftKey) return;
    try {
      const raw = localStorage.getItem(draftKey);
      setDrafts(raw ? (JSON.parse(raw) as CartDraft[]) : []);
    } catch {
      setDrafts([]);
    }
  }, [draftKey]);
  const persistDrafts = (next: CartDraft[]) => {
    setDrafts(next);
    if (draftKey) {
      try { localStorage.setItem(draftKey, JSON.stringify(next)); } catch { /* ignore */ }
    }
  };
  const saveDraft = () => {
    if (cart.length === 0) { toast.error("Keranjang kosong"); return; }
    const name = draftCustomer.trim();
    if (!name) { toast.error("Nama pelanggan wajib diisi"); return; }
    const d: CartDraft = {
      id: (crypto as any).randomUUID?.() ?? String(Date.now()),
      customer_name: name,
      note: draftNote.trim() || undefined,
      items: cart,
      saved_at: new Date().toISOString(),
    };
    persistDrafts([d, ...drafts]);
    setCart([]);
    setSaveDraftOpen(false);
    setDraftCustomer("");
    setDraftNote("");
    toast.success(`Draft "${name}" disimpan`);
  };
  const resumeDraft = async (d: CartDraft) => {
    if (cart.length > 0) {
      const ok = window.confirm("Keranjang saat ini akan diganti dengan draft. Lanjutkan?");
      if (!ok) return;
    }
    // Pastikan units untuk produk di draft ter-load
    try {
      const ids = Array.from(new Set(d.items.map((l) => l.product.id)));
      const missing = ids.filter((id) => !unitsByProduct[id]);
      if (missing.length > 0) {
        const map = await loadUnitsForProducts(missing);
        setUnitsByProduct((prev) => ({ ...prev, ...map }));
      }
    } catch { /* ignore */ }
    setCart(d.items);
    persistDrafts(drafts.filter((x) => x.id !== d.id));
    setDraftListOpen(false);
    toast.success(`Draft "${d.customer_name}" dilanjutkan`);
  };
  const deleteDraft = (id: string) => {
    const d = drafts.find((x) => x.id === id);
    if (!d) return;
    if (!window.confirm(`Hapus draft "${d.customer_name}"?`)) return;
    persistDrafts(drafts.filter((x) => x.id !== id));
    toast.success("Draft dihapus");
  };

  const handleCreateStaticQris = async (amountOverride?: number) => {
    const amt = amountOverride ?? totals.total;
    if (amt <= 0) {
      toast.error("Nominal QRIS tidak valid");
      return;
    }
    if (!staticQrisPayload) {
      toast.error("QRIS statis belum diatur. Set di Pengaturan → QRIS Statis Toko.");
      return;
    }
    setQrisLoading(true);
    try {
      const { convertStaticToDynamicQris } = await import("@/lib/qris-static");
      const QRCode = (await import("qrcode")).default;
      const payload = convertStaticToDynamicQris(staticQrisPayload, amt);
      const url = await QRCode.toDataURL(payload, { width: 320, margin: 1 });
      const orderId = `STAT-${Date.now()}`;
      setQris({ order_id: orderId, qr_url: url, amount: amt, status: "pending", source: "static" });
    } catch (e: any) {
      toast.error(e?.message || "Gagal membuat QRIS statis");
    } finally {
      setQrisLoading(false);
    }
  };

  const handleCancelQris = async () => {
    setQris(null);
  };

  const persistShift = (s: ActiveShift | null) => {
    setActiveShift(s);
    try {
      if (s) localStorage.setItem(SHIFT_KEY, JSON.stringify(s));
      else localStorage.removeItem(SHIFT_KEY);
    } catch {}
  };

  const handleStartShift = async () => {
    if (!activeCashier) return;
    const cash = parseNumber(openingCash) || 0;
    setOpeningShiftLoading(true);
    try {
      const res = (await openShiftFnCb({ data: { cashier_id: activeCashier.id, opening_cash: cash } })) as any;
      persistShift({
        shift_id: res.shift_id,
        cashier_id: activeCashier.id,
        cashier_name: activeCashier.name,
        opening_cash: cash,
        opened_at: new Date().toISOString(),
      });
      setOpeningDialogOpen(false);
      setOpeningCash("");
      toast.success(`Shift dibuka untuk ${activeCashier.name}`);
    } catch (e: any) {
      toast.error(e.message || "Gagal buka shift");
    } finally {
      setOpeningShiftLoading(false);
    }
  };

  const handleShiftClosed = async () => {
    persistShift(null);
    setCloseOpen(false);
    if (isCashierSession) {
      // Auto-logout cashier session after closing
      try {
        localStorage.removeItem(CASHIER_KEY);
        localStorage.removeItem(SHIFT_KEY);
      } catch {}
      setActiveCashier(null);
      await supabase.auth.signOut();
      router.navigate({ to: "/auth", replace: true });
    } else {
      setLockOpen(true);
    }
  };

  // --- Expiry batch summary per product ---
  const [expiryByProduct, setExpiryByProduct] = useState<
    Record<string, { minDays: number; totalQty: number; batches: number; nearestDate: string }>
  >({});

  const loadCustomers = async () => {
    const { data: cs, error } = await supabase
      .from("customers")
      .select("id, name, phone, points")
      .order("name", { ascending: true });
    if (error) {
      toast.error("Gagal memuat pelanggan: " + error.message);
      return;
    }
    setCustomers((cs || []) as { id: string; name: string; phone: string | null; points: number }[]);
  };

  const loadProducts = async () => {
    const { data, error } = await supabase.from("products").select("*").order("name");
    if (error) {
      toast.error(error.message);
      return;
    }
    const prods = (data || []) as Product[];
    setProducts(prods);
    try {
      const map = await loadUnitsForProducts(prods.map((p) => p.id));
      setUnitsByProduct(map);
    } catch (e: any) {
      toast.error("Gagal memuat satuan: " + e.message);
    }
    // Load batches → ringkasan expiry per produk (untuk badge warning)
    const { data: bs } = await (supabase as any).from("product_batches").select("product_id, qty, expiry_date");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exp: Record<string, { minDays: number; totalQty: number; batches: number; nearestDate: string }> = {};
    for (const b of (bs || []) as { product_id: string; qty: number; expiry_date: string }[]) {
      const d = Math.ceil((new Date(b.expiry_date + "T00:00:00").getTime() - today.getTime()) / 86400000);
      const cur = exp[b.product_id];
      if (!cur) exp[b.product_id] = { minDays: d, totalQty: b.qty, batches: 1, nearestDate: b.expiry_date };
      else {
        cur.totalQty += b.qty;
        cur.batches += 1;
        if (d < cur.minDays) {
          cur.minDays = d;
          cur.nearestDate = b.expiry_date;
        }
      }
    }
    setExpiryByProduct(exp);
  };

  useEffect(() => {
    loadProducts();
    loadCustomers();
    searchRef.current?.focus();
    (async () => {
      const { data: ti } = await supabase.rpc("current_tenant_info");
      const row = Array.isArray(ti) ? ti[0] : ti;
      if (row?.id) setTenantId(row.id as string);
      if (row?.name) setStoreName(row.name as string);
      if ((row as any)?.static_qris_payload) setStaticQrisPayload((row as any).static_qris_payload as string);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 60);
    return products
      .filter(
        (p) =>
          p.code.toLowerCase().includes(q) ||
          (p.barcode || "").toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q),
      )
      .slice(0, 60);
  }, [products, query]);

  const totals = useMemo(() => {
    let total = 0;
    let items = 0;
    for (const l of cart) {
      total += computeLine(l, getUnits(l.product, unitsByProduct)).total;
      items += l.qty;
    }
    return { total, items };
  }, [cart, unitsByProduct]);

  const onPickProduct = (p: Product) => {
    setModePicker(p);
  };

  const addEceran = (p: Product) => {
    const units = getUnits(p, unitsByProduct);
    const base = units.find((u) => u.is_base) || units[0];
    const key = `${p.id}:eceran`;
    setCart((c) => {
      const idx = c.findIndex((x) => x.key === key);
      if (idx >= 0) {
        const copy = [...c];
        copy[idx] = { ...copy[idx], qty: copy[idx].qty + 1 };
        return copy;
      }
      return [...c, { key, product: p, mode: "eceran", unit: base, baseUnit: base, qty: 1 }];
    });
    setModePicker(null);
  };

  const applyAiOrder = (items: AiOrderItem[]) => {
    let added = 0;
    setCart((current) => {
      const next = [...current];
      for (const it of items) {
        if (!it.matched_product_id) continue;
        const p = products.find((x) => x.id === it.matched_product_id);
        if (!p) continue;
        const units = getUnits(p, unitsByProduct);
        const base = units.find((u) => u.is_base) || units[0];
        if (!base) continue;
        let mode: "eceran" | "grosiran" = "eceran";
        let unit = base;
        let key = `${p.id}:eceran`;
        if (it.unit) {
          const found = units.find((u) => u.name.toLowerCase() === it.unit!.toLowerCase());
          if (found && found.conversion > 1) {
            mode = "grosiran"; unit = found; key = `${p.id}:grosir:${unit.name}`;
          }
        }
        const qtyAdd = mode === "grosiran" ? it.qty * unit.conversion : it.qty;
        const idx = next.findIndex((x) => x.key === key);
        if (idx >= 0) next[idx] = { ...next[idx], qty: next[idx].qty + qtyAdd };
        else next.push({ key, product: p, mode, unit, baseUnit: base, qty: qtyAdd });
        added++;
      }
      return next;
    });
    if (added > 0) toast.success(`${added} item dimasukkan ke keranjang`);
  };



  const setQty = (key: string, qty: number) => {
    if (qty <= 0) return setCart((c) => c.filter((l) => l.key !== key));
    setCart((c) => c.map((l) => (l.key === key ? { ...l, qty } : l)));
  };

  const setDisplayQty = (line: CartLine, displayQty: number) => {
    const multiplier = line.mode === "grosiran" ? Math.max(1, line.unit.conversion) : 1;
    setQty(line.key, displayQty * multiplier);
  };

  const changeGrosirUnit = (key: string, unitName: string) => {
    setCart((c) =>
      c.map((l) => {
        if (l.key !== key) return l;
        const units = getUnits(l.product, unitsByProduct);
        const u = units.find((x) => x.name === unitName) || l.unit;
        return { ...l, unit: u, key: `${l.product.id}:grosir:${u.name}` };
      }),
    );
  };

  const removeLine = (key: string) => setCart((c) => c.filter((l) => l.key !== key));

  const handleSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const raw = query.trim();
    // Shortcut: "*N" → ubah jumlah baris terakhir di keranjang menjadi N
    const qtyMatch = raw.match(/^\*\s*(\d+)$/);
    if (qtyMatch) {
      e.preventDefault();
      const n = parseInt(qtyMatch[1], 10);
      if (!n || n <= 0) { toast.error("Jumlah tidak valid"); return; }
      if (cart.length === 0) { toast.error("Keranjang masih kosong"); return; }
      const last = cart[cart.length - 1];
      const multiplier = last.mode === "grosiran" ? Math.max(1, last.unit.conversion) : 1;
      setQty(last.key, n * multiplier);
      toast.success(`Jumlah ${last.product.name} → ${n} ${last.unit.name}`);
      setQuery("");
      return;
    }
    if (filtered.length === 0) return;
    e.preventDefault();
    const q = raw.toLowerCase();
    // Exact match by barcode/code → buka dialog pilih satuan. Else: pakai hasil pertama.
    const exact =
      products.find((p) => (p.barcode || "").toLowerCase() === q) || products.find((p) => p.code.toLowerCase() === q);
    setModePicker(exact || filtered[0]);
    setQuery("");
  };

  const checkout = async () => {
    if (!activeShift) {
      toast.error("Kasir belum login");
      setLockOpen(true);
      return;
    }
    let paidNum: number;
    let cashPart = 0;
    let qrisPart = 0;
    if (paymentMethod === "qris") {
      if (!qris || qris.status !== "paid") {
        toast.error("QRIS belum dibayar");
        return;
      }
      paidNum = totals.total;
      qrisPart = totals.total;
    } else if (paymentMethod === "split") {
      cashPart = Number(splitCash.replace(/[^\d]/g, "")) || 0;
      qrisPart = Number(splitQris.replace(/[^\d]/g, "")) || 0;
      if (qrisPart > 0 && (!qris || qris.status !== "paid")) {
        toast.error("QRIS belum dibayar");
        return;
      }
      if (cashPart + qrisPart < totals.total) {
        toast.error("Total pembayaran kurang");
        return;
      }
      paidNum = cashPart + qrisPart;
    } else {
      paidNum = Number(paid.replace(/[^\d]/g, ""));
      if (paidNum < totals.total) {
        toast.error("Uang dibayar kurang");
        return;
      }
      cashPart = paidNum;
    }
    const phoneClean = normalizePhone(customerPhone);
    if (customerPhone && phoneClean.length < 8) {
      toast.error("Nomor HP tidak valid");
      return;
    }
    setSubmitting(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user?.id) {
      toast.error("Sesi habis");
      setSubmitting(false);
      return;
    }
    const { data: tidData, error: tidErr } = await supabase.rpc("current_tenant_id");
    const tenantId = tidData as string | null;
    if (!tenantId) {
      toast.error("Akun ini tidak terhubung ke toko" + (tidErr ? `: ${tidErr.message}` : ""));
      setSubmitting(false);
      return;
    }
    if (phoneClean) {
      try {
        const existing = await supabase
          .from("customers")
          .select("id, points")
          .eq("phone", phoneClean)
          .limit(1)
          .maybeSingle();
        if (existing.error) throw existing.error;
        if (existing.data) {
          await supabase.from("customers").update({ name: customerName.trim() || undefined }).eq("id", existing.data.id);
          setCustomerId(existing.data.id);
        } else {
          const { data: newCustomer, error: insertError } = await supabase.from("customers").insert({
            tenant_id: tenantId,
            name: customerName.trim() || "Pelanggan",
            phone: phoneClean,
            points: 0,
          } as any).select("id").single();
          if (insertError) throw insertError;
          setCustomerId(newCustomer.id);
        }
        loadCustomers();
      } catch (e: any) {
        toast.error("Gagal simpan pelanggan: " + (e?.message || "unknown"));
      }
    }
    const change = paidNum - totals.total;
    const { data: tx, error: txErr } = await supabase
      .from("transactions")
      .insert({
        tenant_id: tenantId,
        cashier_id: activeShift.cashier_id,
        shift_id: activeShift.shift_id,
        total: totals.total,
        paid: paidNum,
        change_amount: change,
        item_count: totals.items,
        payment_method: paymentMethod,
        qris_amount: qrisPart,
        customer_phone: sendWa && phoneClean ? phoneClean : null,
      } as any)
      .select()
      .single();
    if (txErr || !tx) {
      toast.error(txErr?.message || "Gagal menyimpan");
      setSubmitting(false);
      return;
    }
    const items = cart.map((l) => {
      const c = computeLine(l, getUnits(l.product, unitsByProduct));
      const avgUnitPrice = l.qty > 0 ? c.total / l.qty : 0;
      return {
        tenant_id: tenantId,
        transaction_id: tx.id,
        product_id: l.product.id,
        product_code: l.product.code,
        product_barcode: l.product.barcode || null,
        product_name: l.product.name,
        qty: l.qty,
        unit_price: avgUnitPrice,
        unit_cost: Number(l.product.cost_price || 0),
        is_wholesale: l.mode === "grosiran",
        subtotal: c.total,
        unit_name: l.mode === "grosiran" ? `${l.unit.name}+pcs` : l.baseUnit.name,
        unit_qty: l.qty,
        unit_conversion: 1,
      };
    });
    const { error: itErr } = await supabase.from("transaction_items").insert(items as any);
    if (itErr) {
      toast.error(itErr.message);
      setSubmitting(false);
      return;
    }
    // gabung pengurangan stok per produk — dikerjakan di server (cashier tidak bisa UPDATE products)
    const stockMap = new Map<string, number>();
    for (const l of cart) stockMap.set(l.product.id, (stockMap.get(l.product.id) || 0) + l.qty);
    try {
      await deductStockFn({
        data: {
          items: Array.from(stockMap.entries()).map(([product_id, qty]) => ({ product_id, qty })),
        },
      });
    } catch (e: any) {
      toast.error("Gagal kurangi stok: " + (e?.message || "unknown"));
    }

    const receipt = {
      id: tx.id,
      total: totals.total,
      paid: paidNum,
      change,
      items: cart,
      at: new Date(),
      paymentMethod,
      cashPart,
      qrisPart,
      customerPhone: sendWa && phoneClean ? phoneClean : null,
      customerName: sendWa && customerName.trim() ? customerName.trim() : null,
    };
    setLastReceipt(receipt);
    // generate struk gambar
    try {
      const imgItems: ReceiptItem[] = cart.map((l) => {
        const c = computeLine(l, getUnits(l.product, unitsByProduct));
        let detail = "";
        const showPack = c.packs > 0 && (l.mode === "grosiran" || c.autoUnit);
        const packUnitName = l.mode === "grosiran" ? l.unit.name : c.autoUnit?.name || "";
        if (showPack) {
          const parts: string[] = [];
          parts.push(`${c.packs} ${packUnitName} × ${formatRupiah(c.packPrice)}`);
          if (c.remainder > 0) parts.push(`${c.remainder} ${l.baseUnit.name} × ${formatRupiah(c.ecerPrice)}`);
          detail = parts.join(" + ");
        } else {
          detail = `${l.qty} × ${formatRupiah(c.ecerPrice)}`;
        }
        return {
          name: l.product.name,
          qty: l.qty,
          unit: l.baseUnit.name,
          isWholesale: l.mode === "grosiran",
          detail,
          subtotal: c.total,
        };
      });
      const { dataUrl } = renderReceiptPng({
        storeName: storeName || "Toko",
        storeNote: "Terima kasih atas kunjungan Anda",
        txId: tx.id,
        at: receipt.at,
        items: imgItems,
        total: receipt.total,
        paid: receipt.paid,
        change: receipt.change,
        paymentMethod: receipt.paymentMethod,
        cashPart: receipt.cashPart,
        qrisPart: receipt.qrisPart,
        customerName: receipt.customerName,
        customerPhone: receipt.customerPhone,
      });
      setReceiptImg(dataUrl);
      if (sendWa && phoneClean) {
        const caption = buildReceiptCaption(receipt);
        await sendReceiptImageWa(
          phoneClean,
          caption,
          dataUrl,
          `struk-${tx.id.slice(0, 8)}.png`,
        );
      }
    } catch (e) {
      setReceiptImg(null);
    }
    setCart([]);
    setPaid("");
    setSplitCash("");
    setSplitQris("");
    setQris(null);
    setPayOpen(false);
    setSubmitting(false);
    setSendWa(false);
    setCustomerPhone("");
    setCustomerName("");
    setPaymentMethod("cash");
    loadProducts();
  };

  return (
    <div className="space-y-3">
      {/* Cashier / shift header */}
      <Card className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="flex items-center gap-2 text-sm">
          <Wallet className="h-4 w-4 text-primary" />
          {activeShift ? (
            <>
              <span className="font-medium">Kasir: {activeShift.cashier_name}</span>
              <span className="text-muted-foreground">
                • Buka{" "}
                {new Date(activeShift.opened_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="text-muted-foreground">• Saldo awal {formatRupiah(activeShift.opening_cash)}</span>
            </>
          ) : (
            <span className="text-muted-foreground italic">Belum ada kasir aktif</span>
          )}
        </div>
        <div className="flex gap-2">
          {activeShift && (
            <>
              <Button size="sm" variant="outline" onClick={() => setRefundOpen(true)}>
                <ReceiptIcon className="mr-1 h-4 w-4" /> Refund
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAiOrderOpen(true)}>
                <Sparkles className="mr-1 h-4 w-4" /> Scan Pesanan AI
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCloseOpen(true)}>
                <ReceiptIcon className="mr-1 h-4 w-4" /> Closing
              </Button>
              {!isCashierSession && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    persistShift(null);
                    setLockOpen(true);
                  }}
                >
                  <LogOutIcon className="mr-1 h-4 w-4" /> Ganti Kasir
                </Button>
              )}
            </>
          )}
          {!activeShift && isCashierSession && (
            <Button size="sm" onClick={() => setOpeningDialogOpen(true)}>
              <LockKeyhole className="mr-1 h-4 w-4" /> Buka Shift
            </Button>
          )}
          {!activeShift && !isCashierSession && (
            <Button size="sm" onClick={() => setLockOpen(true)}>
              <LockKeyhole className="mr-1 h-4 w-4" /> Login Kasir
            </Button>
          )}
        </div>
      </Card>

      {!isCashierSession && (
        <CashierLock
          open={lockOpen}
          forceLocked={!activeShift}
          onClose={() => {
            if (activeShift) setLockOpen(false);
          }}
          onExit={() => router.navigate({ to: "/produk", replace: true })}
          onUnlocked={(s) => {
            persistShift(s);
            setLockOpen(false);
          }}
        />
      )}

      {isCashierSession && activeCashier && (
        <Dialog
          open={openingDialogOpen}
          onOpenChange={(o) => {
            if (!o && activeShift) setOpeningDialogOpen(false);
          }}
        >
          <DialogContent
            className="max-w-sm"
            onInteractOutside={(e) => {
              if (!activeShift) e.preventDefault();
            }}
            onEscapeKeyDown={(e) => {
              if (!activeShift) e.preventDefault();
            }}
          >
            <DialogHeader>
              <DialogTitle>Buka Shift — {activeCashier.name}</DialogTitle>
              <DialogDescription>
                Masukkan saldo awal kas (uang receh di laci). Bisa 0 jika tidak ada.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label className="text-xs">Saldo Awal Kas</Label>
              <Input
                autoFocus
                inputMode="numeric"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleStartShift();
                }}
                placeholder="0"
              />
              {openingCash && (
                <div className="text-xs text-muted-foreground">{formatRupiah(parseNumber(openingCash) || 0)}</div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={handleStartShift} disabled={openingShiftLoading}>
                {openingShiftLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Mulai Shift
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {activeShift && (
        <ShiftCloseDialog
          open={closeOpen}
          shift={activeShift}
          storeName={storeName}
          onClose={() => setCloseOpen(false)}
          onClosed={handleShiftClosed}
        />
      )}

      <RefundDialog open={refundOpen} onOpenChange={setRefundOpen} onDone={loadProducts} />

      <AIOrderDialog
        open={aiOrderOpen}
        onClose={() => setAiOrderOpen(false)}
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          barcode: (p as any).barcode ?? null,
          code: p.code,
          units: (unitsByProduct[p.id] || []).map((u) => u.name),
        }))}
        onApply={applyAiOrder}
      />

      <div className={`grid gap-4 lg:grid-cols-[1fr_420px] ${!activeShift ? "pointer-events-none opacity-50" : ""}`}>
        {/* Product picker */}
        <Card className="flex flex-col p-4">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              placeholder="Cari/scan kode barang... (Enter = pilih • *2 Enter = ubah jumlah jadi 2)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleSearchKey}
              className="pl-9"
            />
          </div>
          <ScrollArea className="h-[calc(100vh-260px)] pr-2">
            {filtered.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                {products.length === 0 ? "Belum ada produk. Import dari Excel di menu Produk." : "Tidak ada hasil"}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {filtered.map((p) => {
                  const units = getUnits(p, unitsByProduct);
                  const base = units.find((u) => u.is_base) || units[0];
                  const ecer = tierPriceFor(base, 1).price;
                  const grosirCount = units.filter((u) => u.conversion > 1).length;
                  const ex = expiryByProduct[p.id];
                  let expBadge: null | { cls: string; txt: string; title: string } = null;
                  if (ex) {
                    const dateStr = new Date(ex.nearestDate + "T00:00:00").toLocaleDateString("id-ID", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    });
                    if (ex.minDays < 0)
                      expBadge = {
                        cls: "bg-foreground text-background",
                        txt: "Expired",
                        title: `Expired ${Math.abs(ex.minDays)} hari lalu (${dateStr}) • ${ex.totalQty} unit`,
                      };
                    else if (ex.minDays <= 30)
                      expBadge = {
                        cls: "bg-destructive text-destructive-foreground",
                        txt: `≤${ex.minDays}h`,
                        title: `Exp terdekat ${dateStr} (${ex.minDays} hari lagi) • ${ex.totalQty} unit`,
                      };
                    else if (ex.minDays <= 90)
                      expBadge = {
                        cls: "bg-amber-500 text-white",
                        txt: `≤${ex.minDays}h`,
                        title: `Exp terdekat ${dateStr} (${ex.minDays} hari lagi) • ${ex.totalQty} unit`,
                      };
                  }
                  return (
                    <button
                      key={p.id}
                      onClick={() => onPickProduct(p)}
                      className="group relative flex flex-col items-start rounded-lg border bg-card p-3 text-left transition hover:border-primary hover:shadow-md"
                    >
                      {expBadge && (
                        <span
                          className={`absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold ${expBadge.cls}`}
                          title={expBadge.title}
                        >
                          <AlertTriangle className="h-3 w-3" /> {expBadge.txt}
                        </span>
                      )}
                      <div className="mb-1 line-clamp-2 pr-12 text-sm font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.code}</div>
                      <div className="mt-2 flex w-full items-center justify-between">
                        <div className="text-sm font-semibold text-primary">
                          {formatRupiah(ecer)}
                          <span className="text-[10px] text-muted-foreground">/{base.name}</span>
                        </div>
                        <Badge variant="secondary" className="text-[10px]">
                          stok {p.stock}
                        </Badge>
                      </div>
                      {grosirCount > 0 && <div className="mt-1 text-[10px] text-success">tersedia grosir</div>}
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </Card>

        {/* Cart */}
        <Card className="flex flex-col p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Keranjang</h2>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDraftListOpen(true)}
                title="Daftar draft tersimpan"
              >
                Draft{drafts.length > 0 ? ` (${drafts.length})` : ""}
              </Button>
              {cart.length > 0 && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setSaveDraftOpen(true)}>
                    Simpan Draft
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setCart([])}>
                    <X className="mr-1 h-4 w-4" /> Kosongkan
                  </Button>
                </>
              )}
            </div>
          </div>
          <ScrollArea className="h-[calc(100vh-440px)] pr-2">
            {cart.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                Pilih produk untuk mulai
              </div>
            ) : (
              <ul className="space-y-2">
                {cart.map((l) => {
                  const allUnits = getUnits(l.product, unitsByProduct);
                  const c = computeLine(l, allUnits);
                  const grosirUnits = allUnits.filter((u) => u.conversion > 1);
                  const packUnitName = l.mode === "grosiran" ? l.unit.name : c.autoUnit?.name || "";
                  const showPack = c.packs > 0 && (l.mode === "grosiran" || c.autoUnit);
                  const displayQty = l.mode === "grosiran" ? Math.max(1, c.packs) : l.qty;
                  const displayUnitName = l.mode === "grosiran" ? l.unit.name : l.baseUnit.name;
                  return (
                    <li key={l.key} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <Badge variant={l.mode === "grosiran" ? "default" : "secondary"} className="text-[10px]">
                              {l.mode === "grosiran" ? "Grosir" : "Eceran"}
                            </Badge>
                            <span className="truncate text-sm font-medium">{l.product.name}</span>
                          </div>
                          {showPack ? (
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {c.packs} {packUnitName} × {formatRupiah(c.packPrice)}
                              {c.remainder > 0 && (
                                <>
                                  {" "}
                                  + {c.remainder} {l.baseUnit.name} × {formatRupiah(c.ecerPrice)}
                                </>
                              )}
                            </div>
                          ) : (
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {formatRupiah(c.ecerPrice)} / {l.baseUnit.name}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => removeLine(l.key)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-7"
                            onClick={() => setDisplayQty(l, displayQty - 1)}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <Input
                            className="h-7 w-14 text-center"
                            type="number"
                            value={displayQty}
                            onChange={(e) => setDisplayQty(l, parseInt(e.target.value || "0", 10))}
                          />
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-7"
                            onClick={() => setDisplayQty(l, displayQty + 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                          <span className="ml-1 text-xs text-muted-foreground">{displayUnitName}</span>
                          {l.mode === "grosiran" && grosirUnits.length > 1 && (
                            <Select value={l.unit.name} onValueChange={(v) => changeGrosirUnit(l.key, v)}>
                              <SelectTrigger className="h-7 w-[90px] text-xs ml-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {grosirUnits.map((u) => (
                                  <SelectItem key={u.name} value={u.name} className="text-xs">
                                    {u.name} ({u.conversion})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        <div className="text-sm font-semibold">{formatRupiah(c.total)}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>

          <div className="mt-4 space-y-2 border-t pt-4">
            <Row label={`Item (${totals.items})`} value={formatRupiah(totals.total)} />
            <div className="flex items-center justify-between text-xl font-bold">
              <span>Total</span>
              <span className="text-primary">{formatRupiah(totals.total)}</span>
            </div>
            <Button className="h-12 w-full text-base" disabled={cart.length === 0} onClick={() => setPayOpen(true)}>
              Bayar
            </Button>
          </div>
        </Card>

        {/* Picker dialog (radio opsi harga + qty pcs) */}
        <PickerDialog
          product={modePicker}
          unitsByProduct={unitsByProduct}
          onClose={() => setModePicker(null)}
          onAdd={(p, mode, unit, qtyPcs) => {
            if (mode === "eceran") {
              const units = getUnits(p, unitsByProduct);
              const base = units.find((u) => u.is_base) || units[0];
              const key = `${p.id}:eceran`;
              setCart((c) => {
                const idx = c.findIndex((x) => x.key === key);
                if (idx >= 0) {
                  const copy = [...c];
                  copy[idx] = { ...copy[idx], qty: copy[idx].qty + qtyPcs };
                  return copy;
                }
                return [...c, { key, product: p, mode: "eceran", unit: base, baseUnit: base, qty: qtyPcs }];
              });
            } else {
              const units = getUnits(p, unitsByProduct);
              const base = units.find((u) => u.is_base) || units[0];
              const key = `${p.id}:grosir:${unit.name}`;
              setCart((c) => {
                const idx = c.findIndex((x) => x.key === key);
                if (idx >= 0) {
                  const copy = [...c];
                  copy[idx] = { ...copy[idx], qty: copy[idx].qty + qtyPcs };
                  return copy;
                }
                return [...c, { key, product: p, mode: "grosiran", unit, baseUnit: base, qty: qtyPcs }];
              });
            }
            setModePicker(null);
          }}
        />

        {/* Payment dialog */}
        <Dialog
          open={payOpen}
          onOpenChange={(o) => {
            setPayOpen(o);
            if (!o) {
              if (qris && qris.status === "pending") {
                handleCancelQris();
              } else {
                setQris(null);
              }
            }
          }}
        >
          <DialogContent className="max-h-[90vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle>Pembayaran</DialogTitle>
            </DialogHeader>
            <div className="mt-4 flex-1 min-h-0 overflow-y-auto pr-2">
              <div className="space-y-4">
                <div className="rounded-lg bg-muted p-4 text-center">
                  <div className="text-sm text-muted-foreground">Total Belanja</div>
                  <div className="text-3xl font-bold text-primary">{formatRupiah(totals.total)}</div>
                </div>

                <div>
                  <Label className="mb-1.5 block">Metode Pembayaran</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      type="button"
                      variant={paymentMethod === "cash" ? "default" : "outline"}
                      onClick={() => {
                        setPaymentMethod("cash");
                        if (qris) handleCancelQris();
                      }}
                    >
                      💵 Cash
                    </Button>
                    <Button
                      type="button"
                      variant={paymentMethod === "qris" ? "default" : "outline"}
                      onClick={() => {
                        setPaymentMethod("qris");
                        setPaid(String(totals.total));
                      }}
                    >
                      📱 QRIS
                    </Button>
                    <Button
                      type="button"
                      variant={paymentMethod === "split" ? "default" : "outline"}
                      onClick={() => {
                        setPaymentMethod("split");
                        if (qris) handleCancelQris();
                      }}
                    >
                      🔀 Split
                    </Button>
                  </div>
                </div>

                {paymentMethod === "cash" && (
                  <div>
                    <Label>Uang Diterima</Label>
                    <Input
                      autoFocus
                      inputMode="numeric"
                      value={paid}
                      onChange={(e) => setPaid(e.target.value.replace(/[^\d]/g, ""))}
                      placeholder="0"
                      className="mt-1 h-12 text-2xl"
                    />
                    <div className="mt-2 flex flex-wrap gap-1">
                      {[totals.total, 50000, 100000, 200000].map((n, i) => (
                        <Button key={i} variant="outline" size="sm" onClick={() => setPaid(String(n))}>
                          {formatRupiah(n)}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {paymentMethod === "cash" && (
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <span className="text-sm">Kembalian</span>
                    <span className="text-lg font-semibold">
                      {formatRupiah(Math.max(0, Number(paid || 0) - totals.total))}
                    </span>
                  </div>
                )}

                {paymentMethod === "split" &&
                  (() => {
                    const cashN = Number(splitCash.replace(/[^\d]/g, "")) || 0;
                    const qrisN = Number(splitQris.replace(/[^\d]/g, "")) || 0;
                    const sumPaid = cashN + qrisN;
                    const remaining = Math.max(0, totals.total - sumPaid);
                    const change = Math.max(0, sumPaid - totals.total);
                    return (
                      <div className="space-y-2 rounded-lg border p-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">💵 Cash</Label>
                            <Input
                              inputMode="numeric"
                              value={splitCash}
                              onChange={(e) => setSplitCash(e.target.value.replace(/[^\d]/g, ""))}
                              placeholder="0"
                              className="mt-1 h-11"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">📱 QRIS</Label>
                            <Input
                              inputMode="numeric"
                              value={splitQris}
                              onChange={(e) => setSplitQris(e.target.value.replace(/[^\d]/g, ""))}
                              placeholder="0"
                              className="mt-1 h-11"
                              disabled={!!qris}
                            />
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1 text-xs">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSplitCash(String(totals.total));
                              setSplitQris("0");
                            }}
                          >
                            Semua Cash
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSplitQris(String(totals.total));
                              setSplitCash("0");
                            }}
                          >
                            Semua QRIS
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const half = Math.round(totals.total / 2);
                              setSplitCash(String(half));
                              setSplitQris(String(totals.total - half));
                            }}
                          >
                            Bagi 2
                          </Button>
                          {remaining > 0 && (
                            <Button variant="ghost" size="sm" onClick={() => setSplitCash(String(cashN + remaining))}>
                              Sisa ke Cash
                            </Button>
                          )}
                        </div>
                        <div className="flex justify-between border-t pt-2 text-sm">
                          <span>Total Dibayar</span>
                          <span className="font-semibold">{formatRupiah(sumPaid)}</span>
                        </div>
                        {remaining > 0 ? (
                          <div className="flex justify-between text-sm text-destructive">
                            <span>Kurang</span>
                            <span className="font-semibold">{formatRupiah(remaining)}</span>
                          </div>
                        ) : (
                          <div className="flex justify-between text-sm">
                            <span>Kembalian</span>
                            <span className="font-semibold">{formatRupiah(change)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                {(paymentMethod === "qris" ||
                  (paymentMethod === "split" && (Number(splitQris.replace(/[^\d]/g, "")) || 0) > 0)) && (
                  <div className="space-y-2 rounded-lg border p-3">
                    {!qris &&
                      (() => {
                        const amt =
                          paymentMethod === "split" ? Number(splitQris.replace(/[^\d]/g, "")) || 0 : totals.total;
                        return (
                          <div className="space-y-2">
                            {staticQrisPayload ? (
                              <Button
                                type="button"
                                className="w-full"
                                disabled={qrisLoading || amt <= 0}
                                onClick={() => handleCreateStaticQris(amt)}
                              >
                                {qrisLoading
                                  ? "Membuat QR…"
                                  : `Buat QRIS ${paymentMethod === "split" ? formatRupiah(amt) : ""}`}
                              </Button>
                            ) : (
                              <div className="text-[11px] text-muted-foreground">
                                QRIS statis toko belum diatur. Upload di <b>Pengaturan → QRIS Statis Toko</b> agar bisa
                                menerima pembayaran QRIS.
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    {qris && (
                      <div className="space-y-2 text-center">
                        <div className="text-xs text-muted-foreground">QRIS Toko</div>
                        <div className="mx-auto inline-block rounded-md border bg-white p-2">
                          <img src={qris.qr_url} alt="QRIS" className="h-56 w-56 object-contain" />
                        </div>
                        <div className="text-sm">
                          Nominal: <span className="font-semibold">{formatRupiah(qris.amount)}</span>
                        </div>
                        {qris.status === "pending" && (
                          <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-left text-[11px] text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                            ⚠️ Konfirmasi pembayaran masuk lewat aplikasi merchant Anda (GoPay/OVO/BCA), lalu klik{" "}
                            <b>Tandai Sudah Dibayar</b>.
                          </div>
                        )}
                        {qris.status === "paid" && (
                          <div className="text-sm font-semibold text-success">✓ Pembayaran diterima</div>
                        )}
                        <div className="flex flex-wrap justify-center gap-2 pt-1">
                          {qris.status === "pending" && (
                            <Button type="button" size="sm" onClick={() => setQris({ ...qris, status: "paid" })}>
                              Tandai Sudah Dibayar
                            </Button>
                          )}
                          <Button type="button" size="sm" variant="ghost" onClick={handleCancelQris}>
                            Batalkan QR
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2 rounded-lg border p-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={sendWa}
                      onChange={(e) => setSendWa(e.target.checked)}
                    />
                    Kirim e-struk via WhatsApp
                  </label>
                  {sendWa && (
                    <div className="space-y-2">
                      <CustomerPicker
                        customers={customers}
                        name={customerName}
                        phone={customerPhone}
                        onPick={(c) => {
                          setCustomerName(c.name);
                          if (c.phone) setCustomerPhone(c.phone.replace(/[^\d+]/g, ""));
                        }}
                        onChangeName={setCustomerName}
                        onChangePhone={(v) => setCustomerPhone(v.replace(/[^\d+]/g, ""))}
                      />
                      <div className="text-xs text-muted-foreground">
                        Cari pelanggan tersimpan via nama atau no. HP. Data akan dicantumkan pada caption WhatsApp.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <DialogFooter className="mt-4 shrink-0 border-t pt-4">
              <Button variant="outline" onClick={() => setPayOpen(false)}>
                Batal
              </Button>
              <Button
                onClick={checkout}
                disabled={submitting || (paymentMethod === "qris" && (!qris || qris.status !== "paid"))}
              >
                {submitting ? "Memproses..." : "Selesaikan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Receipt dialog */}
        <Dialog
          open={!!lastReceipt}
          onOpenChange={(o) => {
            if (!o) {
              setLastReceipt(null);
              setReceiptImg(null);
            }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ReceiptIcon className="h-5 w-5 text-success" /> Transaksi Berhasil
              </DialogTitle>
            </DialogHeader>
            {lastReceipt && (
              <div className="space-y-3 text-sm">
                {receiptImg ? (
                  <div className="overflow-hidden rounded-md border bg-white">
                    <img src={receiptImg} alt="Struk" className="block w-full" />
                  </div>
                ) : (
                  <div className="rounded-md border p-4 text-center text-xs text-muted-foreground">
                    Memuat gambar struk…
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {receiptImg && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const a = document.createElement("a");
                        a.href = receiptImg;
                        a.download = `struk-${lastReceipt.id.slice(0, 8)}.png`;
                        a.click();
                      }}
                    >
                      ⬇️ Unduh
                    </Button>
                  )}
                  {lastReceipt.customerPhone && receiptImg && (
                    <Button
                      className="flex-1"
                      disabled={sendingWa}
                      onClick={async () => {
                        const r = lastReceipt;
                        const base64 = receiptImg.split(",")[1] || "";
                        const lines: string[] = [];
                        lines.push(`*${storeName || "Toko"}*`);
                        lines.push(`Struk #${r.id.slice(0, 8)}`);
                        lines.push(new Date(r.at).toLocaleString("id-ID"));
                        if (r.customerName) lines.push(`Pelanggan: ${r.customerName}`);
                        lines.push(`--------------------------------`);
                        for (const it of r.items) {
                          const c = computeLine(it, getUnits(it.product, unitsByProduct));
                          const showPack = c.packs > 0 && (it.mode === "grosiran" || c.autoUnit);
                          const packName = it.mode === "grosiran" ? it.unit.name : c.autoUnit?.name || "";
                          lines.push(`${it.product.name}`);
                          if (showPack) {
                            lines.push(
                              `  ${c.packs} ${packName} x ${formatRupiah(c.packPrice)} = ${formatRupiah(c.packs * c.packPrice)}`,
                            );
                            if (c.remainder > 0) {
                              lines.push(
                                `  ${c.remainder} ${it.baseUnit.name} x ${formatRupiah(c.ecerPrice)} = ${formatRupiah(c.remainder * c.ecerPrice)}`,
                              );
                            }
                          } else {
                            lines.push(
                              `  ${it.qty} ${it.baseUnit.name} x ${formatRupiah(c.ecerPrice)} = ${formatRupiah(c.total)}`,
                            );
                          }
                        }
                        lines.push(`--------------------------------`);
                        lines.push(`Total   : ${formatRupiah(r.total)}`);
                        if (r.paymentMethod === "split") {
                          lines.push(`Cash    : ${formatRupiah(r.cashPart || 0)}`);
                          lines.push(`QRIS    : ${formatRupiah(r.qrisPart || 0)}`);
                          lines.push(`Bayar   : ${formatRupiah(r.paid)} (SPLIT)`);
                        } else {
                          lines.push(`Bayar   : ${formatRupiah(r.paid)} (${r.paymentMethod.toUpperCase()})`);
                        }
                        lines.push(`Kembali : ${formatRupiah(r.change)}`);
                        lines.push(``);
                        lines.push(`Terima kasih sudah berbelanja 🙏`);
                        const caption = lines.join("\n");
                        setSendingWa(true);
                        try {
                          // 1) Upload PNG ke Storage bucket 'receipts'
                          const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
                          const blob = new Blob([bin], { type: "image/png" });
                          // resolve tenant id via RPC (works for owner & cashier session)
                          const { data: tid, error: tidErr } = await supabase.rpc("current_tenant_id");
                          const tenantId = tid as string | null;
                          if (!tenantId) {
                            toast.error("Akun ini tidak terhubung ke toko" + (tidErr ? `: ${tidErr.message}` : ""));
                            setSendingWa(false);
                            return;
                          }
                          const objectPath = `${tenantId}/${r.id}.png`;
                          const up = await supabase.storage
                            .from("receipts")
                            .upload(objectPath, blob, { upsert: true, contentType: "image/png" });
                          let publicUrl: string | null = null;
                          if (!up.error) {
                            const signed = await supabase.storage
                              .from("receipts")
                              .createSignedUrl(objectPath, 60 * 60 * 24 * 7);
                            publicUrl = signed.data?.signedUrl ?? null;
                          }

                          // 2) Kirim via Fonnte (prefer URL, fallback ke file base64)
                          const res = publicUrl
                            ? await sendWaUrlFn({
                                data: {
                                  target: r.customerPhone!,
                                  message: caption,
                                  url: publicUrl,
                                  filename: `struk-${r.id.slice(0, 8)}.png`,
                                },
                              })
                            : await sendWaImgFn({
                                data: {
                                  target: r.customerPhone!,
                                  caption,
                                  filename: `struk-${r.id.slice(0, 8)}.png`,
                                  imageBase64: base64,
                                },
                              });
                          if (res.ok) {
                            toast.success("E-struk (gambar) terkirim via WhatsApp");
                          } else {
                            toast.error("Fonnte gagal: " + res.error);
                          }
                        } catch (e: any) {
                          toast.error("Gagal kirim: " + (e?.message || "unknown"));
                        } finally {
                          setSendingWa(false);
                        }
                      }}
                    >
                      {sendingWa ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      {sendingWa ? "Mengirim…" : "📲 Kirim Gambar via WhatsApp"}
                    </Button>
                  )}
                  {receiptImg && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          const blob = await (await fetch(receiptImg)).blob();
                          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        } catch {
                          toast.error("Browser tidak mendukung copy gambar");
                        }
                      }}
                    >
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button
                onClick={() => {
                  setLastReceipt(null);
                  setReceiptImg(null);
                }}
              >
                Tutup
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Simpan Draft */}
        <Dialog open={saveDraftOpen} onOpenChange={setSaveDraftOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Simpan Keranjang sebagai Draft</DialogTitle>
              <DialogDescription>
                Tahan pesanan ini atas nama pelanggan. Bisa dilanjutkan lagi saat pelanggan datang untuk membayar.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Atas nama pelanggan *</Label>
                <Input
                  autoFocus
                  value={draftCustomer}
                  onChange={(e) => setDraftCustomer(e.target.value)}
                  placeholder="Contoh: Bu Sari"
                  onKeyDown={(e) => { if (e.key === "Enter") saveDraft(); }}
                />
              </div>
              <div>
                <Label>Catatan (opsional)</Label>
                <Input
                  value={draftNote}
                  onChange={(e) => setDraftNote(e.target.value)}
                  placeholder="Contoh: Ambil sore"
                />
              </div>
              <div className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
                {cart.length} item • Total {formatRupiah(totals.total)}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSaveDraftOpen(false)}>Batal</Button>
              <Button onClick={saveDraft}>Simpan Draft</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Daftar Draft */}
        <Dialog open={draftListOpen} onOpenChange={setDraftListOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Draft Keranjang</DialogTitle>
              <DialogDescription>
                Lanjutkan pesanan yang ditahan, atau hapus jika pelanggan tidak jadi membeli.
              </DialogDescription>
            </DialogHeader>
            {drafts.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Belum ada draft tersimpan.</div>
            ) : (
              <ScrollArea className="max-h-[60vh] pr-2">
                <ul className="space-y-2">
                  {drafts.map((d) => {
                    const totalDraft = d.items.reduce((s, l) => {
                      const c = computeLine(l, getUnits(l.product, unitsByProduct).length ? getUnits(l.product, unitsByProduct) : [l.baseUnit, ...(l.unit.name !== l.baseUnit.name ? [l.unit] : [])]);
                      return s + c.total;
                    }, 0);
                    return (
                      <li key={d.id} className="rounded-lg border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium">{d.customer_name}</div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(d.saved_at).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}
                              {" • "}{d.items.length} item • {formatRupiah(totalDraft)}
                            </div>
                            {d.note && <div className="mt-1 text-xs italic text-muted-foreground">Catatan: {d.note}</div>}
                            <div className="mt-2 text-xs text-muted-foreground line-clamp-2">
                              {d.items.map((l) => `${l.product.name} ×${l.qty}`).join(", ")}
                            </div>
                          </div>
                          <div className="flex flex-col gap-1">
                            <Button size="sm" onClick={() => resumeDraft(d)}>Lanjutkan</Button>
                            <Button size="sm" variant="ghost" onClick={() => deleteDraft(d.id)}>
                              <Trash2 className="mr-1 h-3 w-3" /> Hapus
                            </Button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </ScrollArea>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setDraftListOpen(false)}>Tutup</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : "text-muted-foreground"}`}>
      <span>{label}</span>
      <span className={bold ? "text-foreground" : ""}>{value}</span>
    </div>
  );
}

type PickerOption = {
  id: string;
  unit: ProductUnit;
  tier: PriceTier;
  perBasePrice: number;
  isBase: boolean;
};

function buildOptions(units: ProductUnit[]): PickerOption[] {
  const opts: PickerOption[] = [];
  const sorted = [...units].sort((a, b) =>
    a.is_base === b.is_base ? a.conversion - b.conversion : a.is_base ? -1 : 1,
  );
  for (const u of sorted) {
    const tiers = [...u.tiers].sort((a, b) => a.min_qty - b.min_qty);
    for (const t of tiers) {
      opts.push({
        id: `${u.name}-${t.min_qty}`,
        unit: u,
        tier: t,
        perBasePrice: Number(t.price) / Math.max(1, u.conversion),
        isBase: u.is_base,
      });
    }
  }
  return opts;
}

function PickerDialog({
  product,
  unitsByProduct,
  onClose,
  onAdd,
}: {
  product: Product | null;
  unitsByProduct: Record<string, ProductUnit[]>;
  onClose: () => void;
  onAdd: (p: Product, mode: SaleMode, unit: ProductUnit, qtyPcs: number) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [qty, setQty] = useState<number>(1);

  const units = product ? unitsByProduct[product.id] || [fallbackUnitFromProduct(product)] : [];
  const options = useMemo(() => buildOptions(units), [units]);
  const cheapest = options.length ? Math.min(...options.map((o) => o.perBasePrice)) : 0;

  useEffect(() => {
    if (product) {
      setSelected(options[0]?.id ?? null);
      setQty(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  if (!product) return null;
  const opt = options.find((o) => o.id === selected) || options[0];
  const baseUnit = units.find((u) => u.is_base) || units[0];
  const baseName = baseUnit?.name || "pcs";

  const qtyPcs = opt ? qty * opt.unit.conversion : qty;
  const minOk = opt ? qty >= opt.tier.min_qty : false;
  const subtotal = opt ? qty * Number(opt.tier.price) : 0;

  const submit = () => {
    if (!opt) return;
    if (!minOk) {
      toast.error(`Minimal beli ${opt.tier.min_qty} ${opt.unit.name}`);
      return;
    }
    if (qty <= 0) return;
    const mode: SaleMode = opt.unit.conversion > 1 ? "grosiran" : "eceran";
    onAdd(product, mode, opt.unit, qtyPcs);
  };

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-md"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Tambahkan ke keranjang</DialogTitle>
          <DialogDescription className="font-medium text-foreground">{product.name}</DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          Harga termurah:{" "}
          <span className="font-semibold text-primary">
            {formatRupiah(cheapest)}/{baseName}
          </span>
        </div>

        <RadioGroup value={selected ?? ""} onValueChange={setSelected} className="space-y-1.5">
          {options.map((o) => (
            <label
              key={o.id}
              htmlFor={`opt-${o.id}`}
              className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:border-primary has-[:checked]:border-primary has-[:checked]:bg-primary/5"
            >
              <RadioGroupItem id={`opt-${o.id}`} value={o.id} className="mt-0.5" />
              <div className="flex-1 text-sm">
                <div className="font-medium">
                  {o.unit.name.toUpperCase()} - {formatRupiah(Number(o.tier.price))} / Isi {o.unit.conversion}
                  <span className="ml-1 text-muted-foreground">
                    ({formatRupiah(o.perBasePrice)}/{baseName})
                  </span>
                </div>
                {o.tier.min_qty > 1 && (
                  <div className="text-xs text-destructive">
                    Min. Beli: {o.tier.min_qty} {o.unit.name}
                  </div>
                )}
              </div>
            </label>
          ))}
        </RadioGroup>

        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="outline"
              className="h-9 w-9 rounded-full"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Input
              type="number"
              className="h-9 w-16 text-center"
              value={qty}
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value || "1", 10)))}
            />
            <Button size="icon" variant="outline" className="h-9 w-9 rounded-full" onClick={() => setQty((q) => q + 1)}>
              <Plus className="h-4 w-4" />
            </Button>
            {opt && <span className="ml-1 text-xs text-muted-foreground">{opt.unit.name}</span>}
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Subtotal</div>
            <div className="text-base font-semibold">{formatRupiah(subtotal)}</div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={submit} disabled={!opt || !minOk}>
            + Keranjang
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type PickCustomer = { id: string; name: string; phone: string | null };
function CustomerPicker({
  customers,
  name,
  phone,
  onPick,
  onChangeName,
  onChangePhone,
}: {
  customers: PickCustomer[];
  name: string;
  phone: string;
  onPick: (c: PickCustomer) => void;
  onChangeName: (v: string) => void;
  onChangePhone: (v: string) => void;
}) {
  const [q, setQ] = useState("");
  const [openList, setOpenList] = useState(false);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return customers.slice(0, 8);
    return customers
      .filter((c) => c.name.toLowerCase().includes(s) || (c.phone || "").toLowerCase().includes(s))
      .slice(0, 8);
  }, [q, customers]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          placeholder="🔍 Cari pelanggan (nama / no. HP)..."
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpenList(true);
          }}
          onFocus={() => setOpenList(true)}
          onBlur={() => setTimeout(() => setOpenList(false), 150)}
        />
        {openList && results.length > 0 && (
          <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover shadow-lg">
            {results.map((c) => (
              <button
                key={c.id}
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPick(c);
                  setQ("");
                  setOpenList(false);
                }}
              >
                <span className="font-medium">{c.name}</span>
                <span className="text-xs text-muted-foreground">{c.phone || "—"}</span>
              </button>
            ))}
          </div>
        )}
        {openList && q && results.length === 0 && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-lg">
            Tidak ada pelanggan cocok. Isi manual di bawah.
          </div>
        )}
      </div>
      <Input placeholder="Nama pelanggan" value={name} onChange={(e) => onChangeName(e.target.value)} />
      <Input
        inputMode="numeric"
        placeholder="08xxxxxxxxxx"
        value={phone}
        onChange={(e) => onChangePhone(e.target.value)}
      />
    </div>
  );
}
