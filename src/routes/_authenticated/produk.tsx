import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatRupiah, parseNumber } from "@/lib/format";
import { Upload, Download, Plus, Pencil, Trash2, Search, FileSpreadsheet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/produk")({
  component: ProdukPage,
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

type ProductForm = {
  id?: string;
  code: string;
  name: string;
  category: string;
  price: string;
  cost_price: string;
  wholesale_price: string;
  wholesale_min_qty: string;
  stock: string;
};

const emptyForm: ProductForm = {
  code: "",
  name: "",
  category: "",
  price: "",
  cost_price: "",
  wholesale_price: "",
  wholesale_min_qty: "",
  stock: "0",
};


function ProdukPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { data, error } = await supabase.from("products").select("*").order("name");
    if (error) toast.error(error.message);
    else setProducts((data || []) as Product[]);
  };

  useEffect(() => { load(); }, []);

  const filtered = products.filter((p) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || (p.category || "").toLowerCase().includes(q);
  });

  const openNew = () => { setForm(emptyForm); setEditOpen(true); };
  const openEdit = (p: Product) => {
    setForm({
      id: p.id,
      code: p.code,
      name: p.name,
      category: p.category || "",
      price: String(p.price),
      cost_price: p.cost_price ? String(p.cost_price) : "",
      wholesale_price: p.wholesale_price ? String(p.wholesale_price) : "",
      wholesale_min_qty: p.wholesale_min_qty ? String(p.wholesale_min_qty) : "",
      stock: String(p.stock),
    });
    setEditOpen(true);
  };

  const saveForm = async () => {
    if (!form.name.trim()) {
      toast.error("Nama wajib diisi");
      return;
    }
    let code = form.code.trim();
    if (!code) {
      const { data, error } = await supabase.rpc("next_product_code");
      if (error || !data) {
        toast.error("Gagal generate kode otomatis: " + (error?.message || ""));
        return;
      }
      code = String(data);
    }
    const payload = {
      code,
      name: form.name.trim(),
      category: form.category.trim() || null,
      price: parseNumber(form.price),
      cost_price: parseNumber(form.cost_price),
      wholesale_price: form.wholesale_price ? parseNumber(form.wholesale_price) : null,
      wholesale_min_qty: form.wholesale_min_qty ? parseInt(form.wholesale_min_qty, 10) : null,
      stock: parseInt(form.stock || "0", 10),
    };
    const { error } = form.id
      ? await supabase.from("products").update(payload).eq("id", form.id)
      : await supabase.from("products").insert(payload);
    if (error) {
      if (error.code === "23505") toast.error(`Kode "${code}" sudah dipakai produk lain`);
      else toast.error(error.message);
    } else {
      toast.success("Disimpan");
      setEditOpen(false);
      load();

    }
  };

  const remove = async (p: Product) => {
    if (!confirm(`Hapus "${p.name}"?`)) return;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) toast.error(error.message);
    else { toast.success("Dihapus"); load(); }
  };

  // ---------- EXCEL IMPORT ----------
  const onFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
      if (rows.length === 0) {
        toast.error("File kosong");
        return;
      }
      const normalized = rows.map((r) => normalizeRow(r));
      setImportPreview(normalized);
      setImportOpen(true);
    } catch (e: any) {
      toast.error("Gagal baca file: " + e.message);
    }
  };

  const confirmImport = async () => {
    const named = importPreview.filter((r) => r.name);
    if (named.length === 0) {
      toast.error("Tidak ada baris valid (butuh kolom Nama)");
      return;
    }
    setImporting(true);
    // Auto-generate code for rows missing one
    const rows = await Promise.all(
      named.map(async (r) => {
        if (r.code) return r;
        const { data } = await supabase.rpc("next_product_code");
        return { ...r, code: data ? String(data) : "" };
      }),
    );
    const final = rows.filter((r) => r.code);
    const { error } = await supabase.from("products").upsert(final, { onConflict: "code" });
    setImporting(false);
    if (error) toast.error(error.message);
    else {
      toast.success(`${final.length} produk diimport`);
      setImportOpen(false);
      setImportPreview([]);
      load();
    }
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      { Kode: "", Nama: "Beras 5kg", Kategori: "Sembako", "Harga Modal": 58000, Harga: 65000, "Harga Grosir": 62000, "Min Grosir": 5, Stok: 50 },
      { Kode: "", Nama: "Minyak Goreng 1L", Kategori: "Sembako", "Harga Modal": 15000, Harga: 18000, "Harga Grosir": 17000, "Min Grosir": 12, Stok: 30 },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Produk");
    XLSX.writeFile(wb, "template-produk-warung.xlsx");
  };


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Cari produk..." value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
        </div>
        <Button variant="outline" onClick={downloadTemplate}>
          <Download className="mr-2 h-4 w-4" /> Template Excel
        </Button>
        <Button variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload className="mr-2 h-4 w-4" /> Import Excel
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" /> Tambah
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Kode</th>
                <th className="p-3">Nama</th>
                <th className="p-3">Kategori</th>
                <th className="p-3 text-right">Harga</th>
                <th className="p-3 text-right">Grosir</th>
                <th className="p-3 text-right">Stok</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-muted-foreground">
                    <FileSpreadsheet className="mx-auto mb-3 h-12 w-12 opacity-30" />
                    <div>Belum ada produk.</div>
                    <div className="text-xs">Klik "Import Excel" untuk menambahkan dari file Excel.</div>
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id} className="border-t hover:bg-muted/40">
                    <td className="p-3 font-mono text-xs">{p.code}</td>
                    <td className="p-3 font-medium">{p.name}</td>
                    <td className="p-3">{p.category && <Badge variant="secondary">{p.category}</Badge>}</td>
                    <td className="p-3 text-right">{formatRupiah(p.price)}</td>
                    <td className="p-3 text-right text-xs">
                      {p.wholesale_price && p.wholesale_min_qty ? (
                        <>
                          {formatRupiah(Number(p.wholesale_price))}
                          <div className="text-muted-foreground">≥ {p.wholesale_min_qty}</div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-3 text-right">{p.stock}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(p)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => remove(p)}>
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

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Produk" : "Tambah Produk"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Kode (otomatis jika kosong)" value={form.code} onChange={(v) => setForm({ ...form, code: v })} placeholder="Biarkan kosong → BRG0001" />
            <FormField label="Nama *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <FormField label="Kategori" value={form.category} onChange={(v) => setForm({ ...form, category: v })} />
            <FormField label="Stok" value={form.stock} onChange={(v) => setForm({ ...form, stock: v })} type="number" />
            <FormField label="Harga Modal" value={form.cost_price} onChange={(v) => setForm({ ...form, cost_price: v })} type="number" />
            <FormField label="Harga Jual" value={form.price} onChange={(v) => setForm({ ...form, price: v })} type="number" />
            <FormField label="Harga Grosir" value={form.wholesale_price} onChange={(v) => setForm({ ...form, wholesale_price: v })} type="number" />
            <FormField label="Min Qty Grosir" value={form.wholesale_min_qty} onChange={(v) => setForm({ ...form, wholesale_min_qty: v })} type="number" />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Batal</Button>
            <Button onClick={saveForm}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import preview */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Preview Import Excel</DialogTitle>
            <DialogDescription>
              {importPreview.length} baris terdeteksi. Kode kosong akan dibuat otomatis. Produk dengan kode sama akan diperbarui.
            </DialogDescription>

          </DialogHeader>
          <div className="max-h-96 overflow-auto rounded border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted text-left">
                <tr>
                  <th className="p-2">Kode</th>
                  <th className="p-2">Nama</th>
                  <th className="p-2">Kategori</th>
                  <th className="p-2 text-right">Modal</th>
                  <th className="p-2 text-right">Harga</th>
                  <th className="p-2 text-right">Grosir</th>
                  <th className="p-2 text-right">Min</th>
                  <th className="p-2 text-right">Stok</th>
                </tr>
              </thead>
              <tbody>
                {importPreview.map((r, i) => (
                  <tr key={i} className={`border-t ${!r.name ? "bg-destructive/10" : ""}`}>
                    <td className="p-2 font-mono">{r.code || <span className="text-muted-foreground italic">otomatis</span>}</td>
                    <td className="p-2">{r.name || <span className="text-destructive">kosong</span>}</td>
                    <td className="p-2">{r.category}</td>
                    <td className="p-2 text-right">{r.cost_price || ""}</td>
                    <td className="p-2 text-right">{r.price}</td>
                    <td className="p-2 text-right">{r.wholesale_price ?? ""}</td>
                    <td className="p-2 text-right">{r.wholesale_min_qty ?? ""}</td>
                    <td className="p-2 text-right">{r.stock}</td>
                  </tr>
                ))}

              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Batal</Button>
            <Button onClick={confirmImport} disabled={importing}>
              {importing ? "Mengimport..." : `Import ${importPreview.filter((r) => r.name).length} produk`}
            </Button>

          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FormField({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}


// Map flexible column names (Indonesian/English) → DB columns
function normalizeRow(r: Record<string, any>) {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      for (const rk of Object.keys(r)) {
        if (rk.trim().toLowerCase() === k.toLowerCase()) return r[rk];
      }
    }
    return "";
  };
  const code = String(get("kode", "code", "sku", "kode barang") ?? "").trim();
  const name = String(get("nama", "name", "nama barang", "product") ?? "").trim();
  const category = String(get("kategori", "category") ?? "").trim() || null;
  const price = parseNumber(get("harga", "harga jual", "price"));
  const cost_price = parseNumber(get("harga modal", "modal", "cost", "cost price", "hpp"));
  const wholesaleRaw = get("harga grosir", "grosir", "wholesale", "wholesale price");
  const wholesale_price = wholesaleRaw === "" || wholesaleRaw == null ? null : parseNumber(wholesaleRaw);
  const minRaw = get("min grosir", "minimum grosir", "min qty", "min", "wholesale min qty");
  const wholesale_min_qty = minRaw === "" || minRaw == null ? null : parseInt(String(minRaw), 10) || null;
  const stock = parseInt(String(get("stok", "stock", "qty") || "0"), 10) || 0;
  return { code, name, category, price, cost_price, wholesale_price, wholesale_min_qty, stock };
}

