import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatRupiah } from "@/lib/format";
import { Plus, Minus, Trash2, Search, Receipt as ReceiptIcon, X } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ProductUnit, loadUnitsForProducts, fallbackUnitFromProduct, tierPriceFor, PriceTier } from "@/lib/product-pricing";

export const Route = createFileRoute("/_authenticated/kasir")({
  component: KasirPage,
});

type Product = {
  id: string;
  code: string;
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
  unit: ProductUnit;          // unit grosir untuk mode grosiran; base unit untuk eceran
  baseUnit: ProductUnit;      // selalu unit dasar (untuk harga eceran sisa)
  qty: number;                // dalam pcs (unit dasar)
};

function getUnits(p: Product, map: Record<string, ProductUnit[]>): ProductUnit[] {
  const arr = map[p.id];
  if (arr && arr.length > 0) return arr;
  return [fallbackUnitFromProduct(p)];
}

/** Hitung subtotal & rincian untuk satu line. */
function computeLine(l: CartLine): { total: number; packs: number; remainder: number; packPrice: number; ecerPrice: number } {
  const ecerPrice = tierPriceFor(l.baseUnit, 1).price;
  if (l.mode === "eceran") {
    return { total: ecerPrice * l.qty, packs: 0, remainder: l.qty, packPrice: 0, ecerPrice };
  }
  const conv = Math.max(1, l.unit.conversion);
  // pack price = harga 1 pak grosir (tier qty=1 di unit grosir)
  const packPrice = tierPriceFor(l.unit, 1).price;
  const packs = Math.floor(l.qty / conv);
  const remainder = l.qty - packs * conv;
  return {
    total: packs * packPrice + remainder * ecerPrice,
    packs,
    remainder,
    packPrice,
    ecerPrice,
  };
}

function KasirPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [unitsByProduct, setUnitsByProduct] = useState<Record<string, ProductUnit[]>>({});
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paid, setPaid] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<null | { id: string; total: number; paid: number; change: number; items: CartLine[]; at: Date }>(null);
  const [modePicker, setModePicker] = useState<Product | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const loadProducts = async () => {
    const { data, error } = await supabase.from("products").select("*").order("name");
    if (error) { toast.error(error.message); return; }
    const prods = (data || []) as Product[];
    setProducts(prods);
    try {
      const map = await loadUnitsForProducts(prods.map((p) => p.id));
      setUnitsByProduct(map);
    } catch (e: any) {
      toast.error("Gagal memuat satuan: " + e.message);
    }
  };

  useEffect(() => {
    loadProducts();
    searchRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 60);
    return products
      .filter((p) => p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
      .slice(0, 60);
  }, [products, query]);

  const totals = useMemo(() => {
    let total = 0;
    let items = 0;
    for (const l of cart) {
      total += computeLine(l).total;
      items += l.qty;
    }
    return { total, items };
  }, [cart]);

  const onPickProduct = (p: Product) => {
    const units = getUnits(p, unitsByProduct);
    const grosirUnits = units.filter((u) => u.conversion > 1);
    if (grosirUnits.length === 0) {
      // tidak ada grosir → langsung eceran
      addEceran(p);
      return;
    }
    setModePicker(p);
  };

  const addEceran = (p: Product) => {
    const units = getUnits(p, unitsByProduct);
    const base = units.find((u) => u.is_base) || units[0];
    const key = `${p.id}:eceran`;
    setCart((c) => {
      const idx = c.findIndex((x) => x.key === key);
      if (idx >= 0) {
        const copy = [...c]; copy[idx] = { ...copy[idx], qty: copy[idx].qty + 1 }; return copy;
      }
      return [...c, { key, product: p, mode: "eceran", unit: base, baseUnit: base, qty: 1 }];
    });
    setModePicker(null);
  };

  const addGrosir = (p: Product, grosirUnit: ProductUnit) => {
    const units = getUnits(p, unitsByProduct);
    const base = units.find((u) => u.is_base) || units[0];
    const key = `${p.id}:grosir:${grosirUnit.name}`;
    setCart((c) => {
      const idx = c.findIndex((x) => x.key === key);
      if (idx >= 0) {
        const copy = [...c]; copy[idx] = { ...copy[idx], qty: copy[idx].qty + grosirUnit.conversion }; return copy;
      }
      // mulai dengan 1 pak
      return [...c, { key, product: p, mode: "grosiran", unit: grosirUnit, baseUnit: base, qty: grosirUnit.conversion }];
    });
    setModePicker(null);
  };

  const setQty = (key: string, qty: number) => {
    if (qty <= 0) return setCart((c) => c.filter((l) => l.key !== key));
    setCart((c) => c.map((l) => (l.key === key ? { ...l, qty } : l)));
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
    if (e.key === "Enter" && filtered.length > 0) {
      onPickProduct(filtered[0]);
      setQuery("");
    }
  };

  const checkout = async () => {
    const paidNum = Number(paid.replace(/[^\d]/g, ""));
    if (paidNum < totals.total) { toast.error("Uang dibayar kurang"); return; }
    setSubmitting(true);
    const { data: userData } = await supabase.auth.getUser();
    const cashierId = userData.user?.id;
    if (!cashierId) { toast.error("Sesi habis"); setSubmitting(false); return; }
    const change = paidNum - totals.total;
    const { data: tx, error: txErr } = await supabase
      .from("transactions")
      .insert({
        cashier_id: cashierId,
        total: totals.total,
        paid: paidNum,
        change_amount: change,
        item_count: totals.items,
      })
      .select()
      .single();
    if (txErr || !tx) { toast.error(txErr?.message || "Gagal menyimpan"); setSubmitting(false); return; }
    const items = cart.map((l) => {
      const c = computeLine(l);
      const avgUnitPrice = l.qty > 0 ? c.total / l.qty : 0;
      return {
        transaction_id: tx.id,
        product_id: l.product.id,
        product_code: l.product.code,
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
    if (itErr) { toast.error(itErr.message); setSubmitting(false); return; }
    // gabung pengurangan stok per produk
    const stockMap = new Map<string, number>();
    for (const l of cart) stockMap.set(l.product.id, (stockMap.get(l.product.id) || 0) + l.qty);
    await Promise.all(
      Array.from(stockMap.entries()).map(([pid, used]) => {
        const p = products.find((x) => x.id === pid);
        if (!p) return Promise.resolve();
        return supabase.from("products").update({ stock: Math.max(0, p.stock - used) }).eq("id", pid);
      }),
    );
    setLastReceipt({ id: tx.id, total: totals.total, paid: paidNum, change, items: cart, at: new Date() });
    setCart([]); setPaid(""); setPayOpen(false); setSubmitting(false);
    loadProducts();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
      {/* Product picker */}
      <Card className="flex flex-col p-4">
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            placeholder="Cari nama atau scan kode barang... (Enter = pilih pertama)"
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
                return (
                  <button
                    key={p.id}
                    onClick={() => onPickProduct(p)}
                    className="group flex flex-col items-start rounded-lg border bg-card p-3 text-left transition hover:border-primary hover:shadow-md"
                  >
                    <div className="mb-1 line-clamp-2 text-sm font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.code}</div>
                    <div className="mt-2 flex w-full items-center justify-between">
                      <div className="text-sm font-semibold text-primary">{formatRupiah(ecer)}<span className="text-[10px] text-muted-foreground">/{base.name}</span></div>
                      <Badge variant="secondary" className="text-[10px]">stok {p.stock}</Badge>
                    </div>
                    {grosirCount > 0 && (
                      <div className="mt-1 text-[10px] text-success">tersedia grosir</div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </Card>

      {/* Cart */}
      <Card className="flex flex-col p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Keranjang</h2>
          {cart.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setCart([])}>
              <X className="mr-1 h-4 w-4" /> Kosongkan
            </Button>
          )}
        </div>
        <ScrollArea className="h-[calc(100vh-440px)] pr-2">
          {cart.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              Pilih produk untuk mulai
            </div>
          ) : (
            <ul className="space-y-2">
              {cart.map((l) => {
                const c = computeLine(l);
                const allUnits = getUnits(l.product, unitsByProduct);
                const grosirUnits = allUnits.filter((u) => u.conversion > 1);
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
                        {l.mode === "eceran" ? (
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {formatRupiah(c.ecerPrice)} / {l.baseUnit.name}
                          </div>
                        ) : (
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {c.packs > 0 && <>{c.packs} {l.unit.name} × {formatRupiah(c.packPrice)}</>}
                            {c.packs > 0 && c.remainder > 0 && <span> + </span>}
                            {c.remainder > 0 && <>{c.remainder} {l.baseUnit.name} × {formatRupiah(c.ecerPrice)}</>}
                          </div>
                        )}
                      </div>
                      <button onClick={() => removeLine(l.key)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(l.key, l.qty - 1)}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          className="h-7 w-14 text-center"
                          type="number"
                          value={l.qty}
                          onChange={(e) => setQty(l.key, parseInt(e.target.value || "0", 10))}
                        />
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(l.key, l.qty + 1)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                        <span className="ml-1 text-xs text-muted-foreground">{l.baseUnit.name}</span>
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
              if (idx >= 0) { const copy = [...c]; copy[idx] = { ...copy[idx], qty: copy[idx].qty + qtyPcs }; return copy; }
              return [...c, { key, product: p, mode: "eceran", unit: base, baseUnit: base, qty: qtyPcs }];
            });
          } else {
            const units = getUnits(p, unitsByProduct);
            const base = units.find((u) => u.is_base) || units[0];
            const key = `${p.id}:grosir:${unit.name}`;
            setCart((c) => {
              const idx = c.findIndex((x) => x.key === key);
              if (idx >= 0) { const copy = [...c]; copy[idx] = { ...copy[idx], qty: copy[idx].qty + qtyPcs }; return copy; }
              return [...c, { key, product: p, mode: "grosiran", unit, baseUnit: base, qty: qtyPcs }];
            });
          }
          setModePicker(null);
        }}
      />


      {/* Payment dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pembayaran</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-muted p-4 text-center">
              <div className="text-sm text-muted-foreground">Total Belanja</div>
              <div className="text-3xl font-bold text-primary">{formatRupiah(totals.total)}</div>
            </div>
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
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-sm">Kembalian</span>
              <span className="text-lg font-semibold">
                {formatRupiah(Math.max(0, Number(paid || 0) - totals.total))}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>Batal</Button>
            <Button onClick={checkout} disabled={submitting}>
              {submitting ? "Memproses..." : "Selesaikan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt dialog */}
      <Dialog open={!!lastReceipt} onOpenChange={(o) => !o && setLastReceipt(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ReceiptIcon className="h-5 w-5 text-success" /> Transaksi Berhasil
            </DialogTitle>
          </DialogHeader>
          {lastReceipt && (
            <div className="space-y-3 text-sm">
              <div className="text-xs text-muted-foreground">
                {lastReceipt.at.toLocaleString("id-ID")} • #{lastReceipt.id.slice(0, 8)}
              </div>
              <ul className="divide-y rounded-md border">
                {lastReceipt.items.map((l) => {
                  const c = computeLine(l);
                  return (
                    <li key={l.key} className="flex justify-between p-2">
                      <span>
                        {l.product.name} × {l.qty} {l.baseUnit.name}
                        {l.mode === "grosiran" && <span className="text-xs text-muted-foreground"> (grosir)</span>}
                      </span>
                      <span>{formatRupiah(c.total)}</span>
                    </li>
                  );
                })}
              </ul>
              <Row label="Total" value={formatRupiah(lastReceipt.total)} bold />
              <Row label="Dibayar" value={formatRupiah(lastReceipt.paid)} />
              <Row label="Kembali" value={formatRupiah(lastReceipt.change)} bold />
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setLastReceipt(null)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
