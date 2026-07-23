import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { formatRupiah } from "@/lib/format";
import { Gift, PercentCircle, Plus, Trash2, Power, Search, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/promo")({
  component: PromoPage,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6 text-sm">Tidak ditemukan</div>,
});

type Product = { id: string; name: string; code: string; price: number; cost_price: number };
type Promo = {
  id: string;
  tenant_id: string;
  name: string;
  type: "bxgy" | "clearance";
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  buy_product_id: string | null;
  buy_qty: number | null;
  free_product_id: string | null;
  free_qty: number | null;
  clearance_product_id: string | null;
  clearance_price: number | null;
};

function PromoPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [tab, setTab] = useState<"bxgy" | "clearance">("bxgy");
  const [query, setQuery] = useState("");
  const [openBxgy, setOpenBxgy] = useState(false);
  const [openClearance, setOpenClearance] = useState(false);

  const load = async () => {
    const { data: t } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
    setTenantId((t as any)?.id ?? null);
    const [{ data: prods }, { data: prs }] = await Promise.all([
      supabase.from("products").select("id, name, code, price, cost_price").order("name"),
      (supabase as any).from("promos").select("*").order("created_at", { ascending: false }),
    ]);
    setProducts((prods || []) as Product[]);
    setPromos((prs || []) as Promo[]);
  };
  useEffect(() => { load(); }, []);

  const filteredPromos = useMemo(() => {
    const list = promos.filter((p) => p.type === tab);
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => p.name.toLowerCase().includes(q));
  }, [promos, tab, query]);

  const productName = (id: string | null) => products.find((p) => p.id === id)?.name || "-";

  const toggleActive = async (p: Promo) => {
    const { error } = await (supabase as any).from("promos").update({ active: !p.active }).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success(p.active ? "Promo dinonaktifkan" : "Promo diaktifkan");
    load();
  };

  const remove = async (p: Promo) => {
    if (!confirm(`Hapus promo "${p.name}"?`)) return;
    const { error } = await (supabase as any).from("promos").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Promo dihapus");
    load();
  };

  const statusBadge = (p: Promo) => {
    if (!p.active) return <Badge variant="secondary">Nonaktif</Badge>;
    const now = new Date();
    if (p.starts_at && new Date(p.starts_at) > now) return <Badge variant="outline">Terjadwal</Badge>;
    if (p.ends_at && new Date(p.ends_at) < now) return <Badge variant="destructive">Berakhir</Badge>;
    return <Badge className="bg-emerald-600 hover:bg-emerald-700">Aktif</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Gift className="h-6 w-6 text-primary" /> Promo
          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{promos.length}</span>
        </h1>
        <div className="flex gap-2">
          {tab === "bxgy" ? (
            <Button onClick={() => setOpenBxgy(true)}><Plus className="mr-1 h-4 w-4" />Beli X Gratis Y</Button>
          ) : (
            <Button onClick={() => setOpenClearance(true)}><Plus className="mr-1 h-4 w-4" />Cuci Gudang</Button>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="bxgy"><Gift className="mr-1 h-4 w-4" />Beli X Gratis Y</TabsTrigger>
          <TabsTrigger value="clearance"><PercentCircle className="mr-1 h-4 w-4" />Cuci Gudang</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Cari nama promo..." value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Nama</th>
                <th className="p-3">Detail</th>
                <th className="p-3">Berlaku</th>
                <th className="p-3">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filteredPromos.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-muted-foreground">
                    {tab === "bxgy" ? <Gift className="mx-auto mb-3 h-12 w-12 opacity-30" /> : <PercentCircle className="mx-auto mb-3 h-12 w-12 opacity-30" />}
                    Belum ada promo
                  </td>
                </tr>
              ) : filteredPromos.map((p) => (
                <tr key={p.id} className="border-t hover:bg-muted/40">
                  <td className="p-3 font-medium">{p.name}</td>
                  <td className="p-3 text-xs">
                    {p.type === "bxgy" ? (
                      <>
                        Beli <b>{p.buy_qty}× {productName(p.buy_product_id)}</b><br />
                        Gratis <b className="text-emerald-600">{p.free_qty}× {productName(p.free_product_id)}</b>
                      </>
                    ) : (
                      <>
                        <b>{productName(p.clearance_product_id)}</b><br />
                        Harga promo: <b className="text-orange-600">{formatRupiah(Number(p.clearance_price || 0))}</b>
                      </>
                    )}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {p.starts_at ? new Date(p.starts_at).toLocaleDateString("id-ID") : "-"} → {p.ends_at ? new Date(p.ends_at).toLocaleDateString("id-ID") : "∞"}
                  </td>
                  <td className="p-3">{statusBadge(p)}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" title={p.active ? "Nonaktifkan" : "Aktifkan"} onClick={() => toggleActive(p)}>
                        <Power className={`h-4 w-4 ${p.active ? "text-emerald-600" : "text-muted-foreground"}`} />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(p)} className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <BxgyDialog open={openBxgy} onOpenChange={setOpenBxgy} products={products} tenantId={tenantId} onSaved={load} />
      <ClearanceDialog open={openClearance} onOpenChange={setOpenClearance} products={products} tenantId={tenantId} onSaved={load} />
    </div>
  );
}

function BxgyDialog({ open, onOpenChange, products, tenantId, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; products: Product[]; tenantId: string | null; onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [buyProductId, setBuyProductId] = useState<string>("");
  const [buyQty, setBuyQty] = useState("2");
  const [freeProductId, setFreeProductId] = useState<string>("");
  const [freeQty, setFreeQty] = useState("1");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) { setName(""); setBuyProductId(""); setBuyQty("2"); setFreeProductId(""); setFreeQty("1"); setStartsAt(""); setEndsAt(""); }
  }, [open]);

  const save = async () => {
    if (!tenantId) return toast.error("Toko belum terhubung");
    if (!name.trim()) return toast.error("Nama promo wajib diisi");
    if (!buyProductId || !freeProductId) return toast.error("Pilih produk beli & produk gratis");
    const bq = Math.max(1, parseInt(buyQty || "0", 10));
    const fq = Math.max(1, parseInt(freeQty || "0", 10));
    setSaving(true);
    const { error } = await (supabase as any).from("promos").insert({
      tenant_id: tenantId,
      name: name.trim(),
      type: "bxgy",
      active: true,
      starts_at: startsAt ? new Date(startsAt).toISOString() : null,
      ends_at: endsAt ? new Date(endsAt + "T23:59:59").toISOString() : null,
      buy_product_id: buyProductId,
      buy_qty: bq,
      free_product_id: freeProductId,
      free_qty: fq,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Promo dibuat");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Promo Beli X Gratis Y</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nama Promo *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Beli 2 Gratis 1 Aqua" /></div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2"><Label>Produk yang Dibeli *</Label>
              <Select value={buyProductId} onValueChange={setBuyProductId}>
                <SelectTrigger><SelectValue placeholder="Pilih produk" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Jumlah</Label><Input type="number" min={1} value={buyQty} onChange={(e) => setBuyQty(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2"><Label>Produk Gratis *</Label>
              <Select value={freeProductId} onValueChange={setFreeProductId}>
                <SelectTrigger><SelectValue placeholder="Pilih produk (bisa sama)" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Jumlah</Label><Input type="number" min={1} value={freeQty} onChange={(e) => setFreeQty(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Mulai (opsional)</Label><Input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></div>
            <div><Label>Berakhir (opsional)</Label><Input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClearanceDialog({ open, onOpenChange, products, tenantId, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; products: Product[]; tenantId: string | null; onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [productId, setProductId] = useState("");
  const [price, setPrice] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) { setName(""); setProductId(""); setPrice(""); setEndsAt(""); }
  }, [open]);

  const selected = products.find((p) => p.id === productId);
  const priceNum = Number(price.replace(/[^\d]/g, "")) || 0;
  const isLoss = selected && priceNum > 0 && priceNum < selected.cost_price;
  const lossPerUnit = selected && priceNum > 0 ? selected.cost_price - priceNum : 0;

  const save = async () => {
    if (!tenantId) return toast.error("Toko belum terhubung");
    if (!name.trim()) return toast.error("Nama promo wajib diisi");
    if (!productId) return toast.error("Pilih produk");
    if (priceNum <= 0) return toast.error("Harga promo tidak valid");
    setSaving(true);
    const { error } = await (supabase as any).from("promos").insert({
      tenant_id: tenantId,
      name: name.trim(),
      type: "clearance",
      active: true,
      starts_at: null,
      ends_at: endsAt ? new Date(endsAt + "T23:59:59").toISOString() : null,
      clearance_product_id: productId,
      clearance_price: priceNum,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Promo cuci gudang dibuat");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Promo Cuci Gudang / Jual Rugi</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nama Promo *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Cuci Gudang Susu Expired" /></div>
          <div><Label>Produk *</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Pilih produk" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {selected && (
            <div className="rounded border bg-muted/40 p-2 text-xs">
              <div>Harga normal: <b>{formatRupiah(selected.price)}</b></div>
              <div>Modal: <b>{formatRupiah(selected.cost_price)}</b></div>
            </div>
          )}
          <div><Label>Harga Promo *</Label>
            <Input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))} placeholder="0" />
            {isLoss && (
              <div className="mt-1 flex items-center gap-1 text-xs text-destructive">
                <AlertTriangle className="h-3 w-3" />
                Jual Rugi: -{formatRupiah(lossPerUnit)} per unit
              </div>
            )}
          </div>
          <div><Label>Berakhir (opsional)</Label><Input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
