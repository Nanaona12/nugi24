import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatRupiah } from "@/lib/format";
import { Home, Plus, Trash2, Wallet, AlertCircle, CheckCircle2, Clock, Search, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/pengambilan")({
  component: PengambilanPage,
});

type Product = { id: string; code: string; name: string; price: number; cost_price: number; stock: number };
type Row = {
  id: string;
  product_id: string;
  qty: number;
  taken_by: string | null;
  amount_due: number;
  amount_paid: number;
  status: "paid" | "unpaid" | "partial";
  note: string | null;
  taken_at: string;
  products: { code: string; name: string } | null;
};

function PengambilanPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unpaid" | "partial" | "paid">("all");
  const [search, setSearch] = useState("");

  // form state
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [takenBy, setTakenBy] = useState("");
  const [amountDue, setAmountDue] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [note, setNote] = useState("");
  const [takenAt, setTakenAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    setLoading(true);
    const [pRes, rRes] = await Promise.all([
      supabase.from("products").select("id, code, name, price, cost_price, stock").order("name"),
      (supabase as any)
        .from("household_withdrawals")
        .select("id, product_id, qty, taken_by, amount_due, amount_paid, status, note, taken_at, products(code,name)")
        .order("taken_at", { ascending: false })
        .limit(500),
    ]);
    if (pRes.error) toast.error(pRes.error.message);
    else setProducts((pRes.data || []) as Product[]);
    if (rRes.error) toast.error(rRes.error.message);
    else setRows((rRes.data || []) as Row[]);
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  const selectedProduct = useMemo(() => products.find((p) => p.id === productId) || null, [products, productId]);

  // Auto-fill due when product/qty changes
  useEffect(() => {
    if (selectedProduct) {
      const q = Math.max(1, Number(qty) || 1);
      setAmountDue(String(selectedProduct.price * q));
    }
  }, [productId, qty, selectedProduct]);

  const stats = useMemo(() => {
    let totalDue = 0, totalPaid = 0, outstanding = 0, count = 0;
    for (const r of rows) {
      totalDue += Number(r.amount_due) || 0;
      totalPaid += Number(r.amount_paid) || 0;
      outstanding += Math.max(0, (Number(r.amount_due) || 0) - (Number(r.amount_paid) || 0));
      count++;
    }
    return { totalDue, totalPaid, outstanding, count };
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!(r.products?.name || "").toLowerCase().includes(s)
          && !(r.taken_by || "").toLowerCase().includes(s)
          && !(r.note || "").toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [rows, filter, search]);

  function resetForm() {
    setProductId(""); setQty("1"); setTakenBy(""); setAmountDue(""); setAmountPaid("");
    setNote(""); setTakenAt(new Date().toISOString().slice(0, 16));
  }

  function computeStatus(due: number, paid: number): "paid" | "unpaid" | "partial" {
    if (paid <= 0) return "unpaid";
    if (paid >= due) return "paid";
    return "partial";
  }

  async function saveRow() {
    if (!productId) { toast.error("Pilih produk dulu"); return; }
    const q = Math.max(1, Math.floor(Number(qty) || 0));
    if (q <= 0) { toast.error("Jumlah tidak valid"); return; }
    if (selectedProduct && selectedProduct.stock < q) {
      toast.error(`Stok tidak cukup (sisa ${selectedProduct.stock})`);
      return;
    }
    const due = Math.max(0, Number(amountDue) || 0);
    const paid = Math.max(0, Number(amountPaid) || 0);
    const status = computeStatus(due, paid);

    setSaving(true);
    const { data: t } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
    const payload: any = {
      product_id: productId,
      qty: q,
      unit_conversion: 1,
      taken_by: takenBy.trim() || null,
      amount_due: due,
      amount_paid: paid,
      status,
      note: note.trim() || null,
      taken_at: new Date(takenAt).toISOString(),
    };
    if (t?.id) payload.tenant_id = t.id;

    const { error } = await (supabase as any).from("household_withdrawals").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Pengambilan dicatat. Stok otomatis diperbarui.");
    setOpen(false);
    resetForm();
    loadAll();
  }

  async function markPaid(row: Row) {
    const due = Number(row.amount_due) || 0;
    const { error } = await (supabase as any)
      .from("household_withdrawals")
      .update({ amount_paid: due, status: "paid" })
      .eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Ditandai lunas");
    loadAll();
  }

  async function deleteRow(row: Row) {
    if (!confirm("Hapus catatan pengambilan ini? Stok yang sudah berkurang TIDAK dikembalikan otomatis.")) return;
    const { error } = await (supabase as any).from("household_withdrawals").delete().eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Dihapus");
    loadAll();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Home className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Pengambilan Rumah Tangga</h1>
        </div>
        <div className="ml-auto">
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-1 h-4 w-4" />Catat Pengambilan</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Catat Pengambilan Barang</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div className="grid gap-1">
                  <Label className="text-xs">Produk</Label>
                  <ProductSearchInput
                    products={products}
                    selected={selectedProduct}
                    onSelect={(p: Product | null) => setProductId(p?.id ?? "")}
                  />
                  {selectedProduct && (
                    <div className="text-[11px] text-muted-foreground">
                      Harga jual {formatRupiah(selectedProduct.price)} • Modal {formatRupiah(selectedProduct.cost_price)} • Sisa stok {selectedProduct.stock}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-1">
                    <Label className="text-xs">Jumlah</Label>
                    <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Tanggal Ambil</Label>
                    <Input type="datetime-local" value={takenAt} onChange={(e) => setTakenAt(e.target.value)} />
                  </div>
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Nama Pengambil</Label>
                  <Input value={takenBy} onChange={(e) => setTakenBy(e.target.value)} placeholder="cth. Ibu, Adik, dll" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-1">
                    <Label className="text-xs">Nilai Tagihan</Label>
                    <Input type="number" min={0} value={amountDue} onChange={(e) => setAmountDue(e.target.value)} />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Sudah Dibayar</Label>
                    <Input type="number" min={0} value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} />
                  </div>
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Catatan</Label>
                  <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="opsional" />
                </div>
                <div className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                  Status otomatis: <Badge variant={
                    computeStatus(Number(amountDue) || 0, Number(amountPaid) || 0) === "paid" ? "default"
                      : computeStatus(Number(amountDue) || 0, Number(amountPaid) || 0) === "partial" ? "secondary"
                      : "destructive"
                  }>
                    {computeStatus(Number(amountDue) || 0, Number(amountPaid) || 0)}
                  </Badge>
                </div>
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-700">
                  <AlertCircle className="mr-1 inline h-3 w-3" />
                  Stok produk &amp; batch kadaluarsa terdekat akan otomatis berkurang.
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
                <Button onClick={saveRow} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard icon={<Wallet className="h-4 w-4" />} label="Total Tagihan" value={formatRupiah(stats.totalDue)} />
        <SummaryCard icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} label="Sudah Dibayar" value={formatRupiah(stats.totalPaid)} />
        <SummaryCard icon={<Clock className="h-4 w-4 text-destructive" />} label="Belum Dibayar" value={formatRupiah(stats.outstanding)} accent />
        <SummaryCard icon={<Home className="h-4 w-4" />} label="Jumlah Pengambilan" value={`${stats.count}`} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 p-3">
          <Input placeholder="Cari produk / nama / catatan..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-64" />
          <div className="flex gap-1">
            {(["all", "unpaid", "partial", "paid"] as const).map((f) => (
              <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
                {f === "all" ? "Semua" : f === "unpaid" ? "Belum Bayar" : f === "partial" ? "Sebagian" : "Lunas"}
              </Button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Memuat...</div>
        ) : filteredRows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Belum ada catatan pengambilan.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Tanggal</th>
                  <th className="p-3">Produk</th>
                  <th className="p-3 text-right">Qty</th>
                  <th className="p-3">Diambil oleh</th>
                  <th className="p-3 text-right">Tagihan</th>
                  <th className="p-3 text-right">Dibayar</th>
                  <th className="p-3 text-right">Sisa</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => {
                  const due = Number(r.amount_due) || 0;
                  const paid = Number(r.amount_paid) || 0;
                  const outstanding = Math.max(0, due - paid);
                  return (
                    <tr key={r.id} className="border-t hover:bg-muted/40">
                      <td className="p-3 text-xs text-muted-foreground">{new Date(r.taken_at).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="p-3">
                        <div className="font-medium">{r.products?.name || "-"}</div>
                        {r.note && <div className="text-[11px] text-muted-foreground">{r.note}</div>}
                      </td>
                      <td className="p-3 text-right font-semibold">{r.qty}</td>
                      <td className="p-3 text-muted-foreground">{r.taken_by || "-"}</td>
                      <td className="p-3 text-right">{formatRupiah(due)}</td>
                      <td className="p-3 text-right text-emerald-600">{formatRupiah(paid)}</td>
                      <td className={`p-3 text-right font-semibold ${outstanding > 0 ? "text-destructive" : ""}`}>{formatRupiah(outstanding)}</td>
                      <td className="p-3 text-center">
                        <Badge variant={r.status === "paid" ? "default" : r.status === "partial" ? "secondary" : "destructive"}>
                          {r.status === "paid" ? "Lunas" : r.status === "partial" ? "Sebagian" : "Belum"}
                        </Badge>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-1">
                          {r.status !== "paid" && (
                            <Button size="sm" variant="outline" onClick={() => markPaid(r)}>Lunaskan</Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => deleteRow(r)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function SummaryCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">{icon}{label}</div>
      <div className={`mt-2 text-2xl font-bold ${accent ? "text-destructive" : ""}`}>{value}</div>
    </Card>
  );
}

function ProductSearchInput({
  products,
  selected,
  onSelect,
}: {
  products: Product[];
  selected: Product | null;
  onSelect: (p: Product | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    if (!query.trim()) return products.slice(0, 50);
    const s = query.toLowerCase();
    return products
      .filter((p) => p.name.toLowerCase().includes(s) || p.code.toLowerCase().includes(s))
      .slice(0, 50);
  }, [products, query]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={selected ? `${selected.name} (${selected.code})` : query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Cari nama atau kode produk..."
          className="pl-9 pr-8"
        />
        {selected && (
          <button
            type="button"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => { setQuery(""); onSelect({ id: "", code: "", name: "", price: 0, cost_price: 0, stock: 0 }); }}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">Tidak ada produk</div>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                className="w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => { onSelect(p); setQuery(""); setOpen(false); }}
              >
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-muted-foreground">{p.code} • stok {p.stock} • {formatRupiah(p.price)}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
