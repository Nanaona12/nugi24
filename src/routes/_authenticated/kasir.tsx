import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatRupiah } from "@/lib/format";
import { Plus, Minus, Trash2, Search, Receipt as ReceiptIcon, X } from "lucide-react";

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


type CartLine = {
  product: Product;
  qty: number;
};

function getLinePrice(p: Product, qty: number) {
  if (p.wholesale_price && p.wholesale_min_qty && qty >= p.wholesale_min_qty) {
    return { price: Number(p.wholesale_price), wholesale: true };
  }
  return { price: Number(p.price), wholesale: false };
}

function KasirPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paid, setPaid] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<null | { id: string; total: number; paid: number; change: number; items: CartLine[]; at: Date }>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const loadProducts = async () => {
    const { data, error } = await supabase.from("products").select("*").order("name");
    if (error) toast.error(error.message);
    else setProducts((data || []) as Product[]);
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
      const { price } = getLinePrice(l.product, l.qty);
      total += price * l.qty;
      items += l.qty;
    }
    return { total, items };
  }, [cart]);

  const addToCart = (p: Product) => {
    setCart((c) => {
      const idx = c.findIndex((x) => x.product.id === p.id);
      if (idx >= 0) {
        const copy = [...c];
        copy[idx] = { ...copy[idx], qty: copy[idx].qty + 1 };
        return copy;
      }
      return [...c, { product: p, qty: 1 }];
    });
  };

  const setQty = (id: string, qty: number) => {
    if (qty <= 0) return setCart((c) => c.filter((l) => l.product.id !== id));
    setCart((c) => c.map((l) => (l.product.id === id ? { ...l, qty } : l)));
  };

  const removeLine = (id: string) => setCart((c) => c.filter((l) => l.product.id !== id));

  const handleSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && filtered.length > 0) {
      addToCart(filtered[0]);
      setQuery("");
    }
  };

  const checkout = async () => {
    const paidNum = Number(paid.replace(/[^\d]/g, ""));
    if (paidNum < totals.total) {
      toast.error("Uang dibayar kurang");
      return;
    }
    setSubmitting(true);
    const { data: userData } = await supabase.auth.getUser();
    const cashierId = userData.user?.id;
    if (!cashierId) {
      toast.error("Sesi habis");
      setSubmitting(false);
      return;
    }
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
    if (txErr || !tx) {
      toast.error(txErr?.message || "Gagal menyimpan");
      setSubmitting(false);
      return;
    }
    const items = cart.map((l) => {
      const { price, wholesale } = getLinePrice(l.product, l.qty);
      return {
        transaction_id: tx.id,
        product_id: l.product.id,
        product_code: l.product.code,
        product_name: l.product.name,
        qty: l.qty,
        unit_price: price,
        is_wholesale: wholesale,
        subtotal: price * l.qty,
      };
    });
    const { error: itErr } = await supabase.from("transaction_items").insert(items);
    if (itErr) {
      toast.error(itErr.message);
      setSubmitting(false);
      return;
    }
    // decrement stock
    await Promise.all(
      cart.map((l) =>
        supabase
          .from("products")
          .update({ stock: Math.max(0, l.product.stock - l.qty) })
          .eq("id", l.product.id),
      ),
    );
    setLastReceipt({ id: tx.id, total: totals.total, paid: paidNum, change, items: cart, at: new Date() });
    setCart([]);
    setPaid("");
    setPayOpen(false);
    setSubmitting(false);
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
            placeholder="Cari nama atau scan kode barang... (Enter = tambah pertama)"
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
              {filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  className="group flex flex-col items-start rounded-lg border bg-card p-3 text-left transition hover:border-primary hover:shadow-md"
                >
                  <div className="mb-1 line-clamp-2 text-sm font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.code}</div>
                  <div className="mt-2 flex w-full items-center justify-between">
                    <div className="text-sm font-semibold text-primary">{formatRupiah(p.price)}</div>
                    <Badge variant="secondary" className="text-[10px]">stok {p.stock}</Badge>
                  </div>
                  {p.wholesale_price && p.wholesale_min_qty ? (
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      Grosir ≥ {p.wholesale_min_qty}: {formatRupiah(Number(p.wholesale_price))}
                    </div>
                  ) : null}
                </button>
              ))}
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
                const { price, wholesale } = getLinePrice(l.product, l.qty);
                return (
                  <li key={l.product.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{l.product.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatRupiah(price)} {wholesale && <span className="text-success">• grosir</span>}
                        </div>
                      </div>
                      <button onClick={() => removeLine(l.product.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(l.product.id, l.qty - 1)}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          className="h-7 w-14 text-center"
                          type="number"
                          value={l.qty}
                          onChange={(e) => setQty(l.product.id, parseInt(e.target.value || "0", 10))}
                        />
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(l.product.id, l.qty + 1)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="text-sm font-semibold">{formatRupiah(price * l.qty)}</div>
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
          <Button
            className="h-12 w-full text-base"
            disabled={cart.length === 0}
            onClick={() => setPayOpen(true)}
          >
            Bayar
          </Button>
        </div>
      </Card>

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
                  const { price } = getLinePrice(l.product, l.qty);
                  return (
                    <li key={l.product.id} className="flex justify-between p-2">
                      <span>{l.product.name} × {l.qty}</span>
                      <span>{formatRupiah(price * l.qty)}</span>
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
