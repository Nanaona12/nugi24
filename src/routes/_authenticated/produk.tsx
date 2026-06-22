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
import { Upload, Download, Plus, Pencil, Trash2, Search, FileSpreadsheet, ScanLine, Trash, Package, X as XIcon } from "lucide-react";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ProductUnit, loadUnitsForProducts, replaceProductUnits, fallbackUnitFromProduct } from "@/lib/product-pricing";

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
  const [unitsByProduct, setUnitsByProduct] = useState<Record<string, ProductUnit[]>>({});
  const [query, setQuery] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [importMode, setImportMode] = useState<"upsert" | "update_only">("upsert");
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [formUnits, setFormUnits] = useState<ProductUnit[]>([]);
  const [scanMode, setScanMode] = useState<null | "add" | "search">(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
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

  useEffect(() => { load(); }, []);

  const filtered = products.filter((p) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || (p.category || "").toLowerCase().includes(q);
  });

  const defaultUnitsFor = (p?: Product): ProductUnit[] => {
    if (p) {
      const existing = unitsByProduct[p.id];
      if (existing && existing.length > 0) return existing.map((u) => ({ ...u, tiers: [...u.tiers] }));
      return [fallbackUnitFromProduct(p)];
    }
    return [{ name: "pcs", conversion: 1, sort_order: 0, is_base: true, tiers: [{ min_qty: 1, price: 0 }] }];
  };

  const openNew = () => { setForm(emptyForm); setFormUnits(defaultUnitsFor()); setEditOpen(true); };
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
    setFormUnits(defaultUnitsFor(p));
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
    // Validasi satuan
    const cleanUnits = formUnits
      .map((u) => ({ ...u, tiers: u.tiers.filter((t) => t.min_qty > 0 && t.price >= 0) }))
      .filter((u) => u.name.trim() && u.tiers.length > 0);
    if (cleanUnits.length === 0) {
      toast.error("Minimal 1 satuan dengan 1 tingkatan harga");
      return;
    }
    // Pastikan satu base unit
    if (!cleanUnits.some((u) => u.is_base)) cleanUnits[0].is_base = true;
    // Sinkronkan kolom legacy products.price = harga tier terkecil pada base unit
    const baseUnit = cleanUnits.find((u) => u.is_base) || cleanUnits[0];
    const baseTier1 = [...baseUnit.tiers].sort((a, b) => a.min_qty - b.min_qty)[0];
    const basePrice = baseTier1.price;
    payload.price = basePrice;

    let prodId = form.id;
    if (form.id) {
      const { error } = await supabase.from("products").update(payload).eq("id", form.id);
      if (error) {
        if (error.code === "23505") toast.error(`Kode "${code}" sudah dipakai produk lain`);
        else toast.error(error.message);
        return;
      }
    } else {
      const { data: inserted, error } = await supabase.from("products").insert(payload).select().single();
      if (error || !inserted) {
        if (error?.code === "23505") toast.error(`Kode "${code}" sudah dipakai produk lain`);
        else toast.error(error?.message || "Gagal simpan");
        return;
      }
      prodId = inserted.id;
    }
    try {
      await replaceProductUnits(prodId!, cleanUnits);
    } catch (e: any) {
      toast.error("Produk tersimpan tapi satuan gagal: " + e.message);
    }
    toast.success("Disimpan");
    setEditOpen(false);
    load();
  };

  const remove = async (p: Product) => {
    if (!confirm(`Hapus "${p.name}"?`)) return;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) toast.error(error.message);
    else { toast.success("Dihapus"); load(); }
  };

  const removeAll = async () => {
    setDeletingAll(true);
    const { error, count } = await supabase
      .from("products")
      .delete({ count: "exact" })
      .not("id", "is", null);
    setDeletingAll(false);
    setConfirmDeleteAll(false);
    if (error) toast.error(error.message);
    else {
      toast.success(`${count ?? 0} produk dihapus`);
      load();
    }
  };

  const handleScan = async (code: string) => {
    const mode = scanMode;
    setScanMode(null);
    if (!mode) return;
    if (mode === "search") {
      setQuery(code);
      const found = products.find((p) => p.code === code);
      if (found) toast.success(`Ditemukan: ${found.name}`);
      else toast.info("Produk tidak ditemukan");
      return;
    }
    // add mode
    const existing = products.find((p) => p.code === code);
    if (existing) {
      toast.info("Produk sudah ada, membuka edit");
      openEdit(existing);
    } else {
      setForm({ ...emptyForm, code });
      setEditOpen(true);
      toast.success(`Barcode ${code} siap diisi`);
    }
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
    const named = importPreview.filter((r) => r.name || r.code);
    if (named.length === 0) {
      toast.error("Tidak ada baris valid (butuh kolom Nama atau Kode)");
      return;
    }
    setImporting(true);
    try {
      if (importMode === "update_only") {
        // Update existing rows only, matched by code. Skip rows without code.
        const withCode = named.filter((r) => r.code);
        if (withCode.length === 0) {
          toast.error("Mode Update: semua baris harus punya Kode");
          setImporting(false);
          return;
        }
        let updated = 0;
        let skipped = 0;
        let unitsApplied = 0;
        for (const r of withCode) {
          // Only send fields that have a value, so kolom kosong di Excel tidak menimpa data lama.
          const patch: Record<string, any> = {};
          if (r.name) patch.name = r.name;
          if (r.category !== null && r.category !== "") patch.category = r.category;
          if (r.price) patch.price = r.price;
          if (r.cost_price) patch.cost_price = r.cost_price;
          if (r.wholesale_price != null) patch.wholesale_price = r.wholesale_price;
          if (r.wholesale_min_qty != null) patch.wholesale_min_qty = r.wholesale_min_qty;
          if (r.stock || r.stock === 0) patch.stock = r.stock;
          const hasUnits = r.units && r.units.length > 0;
          if (Object.keys(patch).length === 0 && !hasUnits) { skipped++; continue; }
          let prodId: string | null = null;
          if (Object.keys(patch).length > 0) {
            const { data, error } = await supabase
              .from("products")
              .update(patch as any)
              .eq("code", r.code)
              .select("id")
              .maybeSingle();
            if (error) { toast.error(`${r.code}: ${error.message}`); skipped++; continue; }
            if (!data) { skipped++; continue; }
            prodId = data.id;
            updated++;
          } else {
            const { data } = await supabase.from("products").select("id").eq("code", r.code).maybeSingle();
            if (!data) { skipped++; continue; }
            prodId = data.id;
          }
          if (hasUnits && prodId) {
            try { await replaceProductUnits(prodId, r.units); unitsApplied++; }
            catch (e: any) { toast.error(`${r.code} satuan: ${e.message}`); }
          }
        }
        toast.success(`${updated} produk diupdate${unitsApplied ? `, ${unitsApplied} dgn satuan` : ""}${skipped ? `, ${skipped} dilewati` : ""}`);
      } else {
        // Upsert: auto-generate code for rows missing one
        const rows = await Promise.all(
          named.filter((r) => r.name).map(async (r) => {
            if (r.code) return r;
            const { data } = await supabase.rpc("next_product_code");
            return { ...r, code: data ? String(data) : "" };
          }),
        );
        const final = rows.filter((r) => r.code);
        // Strip non-DB fields before upsert
        const dbRows = final.map(({ units, satuanStr, ...rest }) => rest);
        const { data: upserted, error } = await supabase
          .from("products")
          .upsert(dbRows, { onConflict: "code" })
          .select("id, code");
        if (error) { toast.error(error.message); setImporting(false); return; }
        const idByCode = new Map((upserted || []).map((p: any) => [p.code, p.id]));
        let unitsApplied = 0;
        for (const r of final) {
          if (!r.units || r.units.length === 0) continue;
          const pid = idByCode.get(r.code);
          if (!pid) continue;
          try { await replaceProductUnits(pid, r.units); unitsApplied++; }
          catch (e: any) { toast.error(`${r.code} satuan: ${e.message}`); }
        }
        toast.success(`${final.length} produk diimport${unitsApplied ? `, ${unitsApplied} dgn satuan` : ""}`);
      }
      setImportOpen(false);
      setImportPreview([]);
      load();
    } finally {
      setImporting(false);
    }
  };


  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      {
        Kode: "",
        Nama: "Beras 5kg",
        Kategori: "Sembako",
        "Harga Modal": 58000,
        Harga: 65000,
        "Harga Grosir": 62000,
        "Min Grosir": 5,
        Stok: 50,
        Satuan: "",
      },
      {
        Kode: "",
        Nama: "Rokok Contoh",
        Kategori: "Rokok",
        "Harga Modal": 14000,
        Harga: 15000,
        "Harga Grosir": "",
        "Min Grosir": "",
        Stok: 100,
        Satuan: "pcs*1: 1=15000; 3=14700; 5=14500 | slove*10: 1=143000",
      },
      {
        Kode: "",
        Nama: "Minyak Goreng 1L",
        Kategori: "Sembako",
        "Harga Modal": 15000,
        Harga: 18000,
        "Harga Grosir": 17000,
        "Min Grosir": 12,
        Stok: 30,
        Satuan: "pcs*1: 1=18000; 12=17000 | dus*24: 1=400000",
      },
    ]);
    // Lebar kolom biar enak dibaca
    (ws as any)["!cols"] = [
      { wch: 10 }, { wch: 24 }, { wch: 14 }, { wch: 12 }, { wch: 10 },
      { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 60 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Produk");
    // Sheet petunjuk format Satuan
    const help = XLSX.utils.aoa_to_sheet([
      ["Format kolom Satuan (opsional)"],
      ["Pisahkan tiap satuan dengan tanda |"],
      ["Tulis: nama*konversi : minQty=harga ; minQty=harga ; ..."],
      ["Konversi = berapa unit dasar per 1 satuan. Satuan dgn konversi 1 jadi satuan DASAR."],
      [""],
      ["Contoh:"],
      ["pcs*1: 1=15000; 3=14700; 5=14500 | slove*10: 1=143000 | dus*60: 1=800000"],
      [""],
      ["Artinya:"],
      ["- pcs (dasar): ≥1 = 15.000, ≥3 = 14.700, ≥5 = 14.500"],
      ["- slove = 10 pcs: harga 143.000"],
      ["- dus = 60 pcs: harga 800.000"],
      [""],
      ["Jika kolom Satuan kosong, sistem pakai kolom Harga + Harga Grosir + Min Grosir."],
    ]);
    (help as any)["!cols"] = [{ wch: 90 }];
    XLSX.utils.book_append_sheet(wb, help, "Petunjuk Satuan");
    XLSX.writeFile(wb, "template-produk-dagang-pintar.xlsx");
  };

  // ---------- EXCEL EXPORT ----------
  const buildSatuanString = (units: ProductUnit[]): string => {
    if (!units || units.length === 0) return "";
    const sorted = [...units].sort((a, b) => a.sort_order - b.sort_order);
    return sorted
      .map((u) => {
        const tiers = [...u.tiers]
          .sort((a, b) => a.min_qty - b.min_qty)
          .map((t) => `${t.min_qty}=${t.price}`)
          .join("; ");
        return `${u.name}*${u.conversion}: ${tiers}`;
      })
      .join(" | ");
  };

  const exportExcel = () => {
    if (products.length === 0) { toast.error("Tidak ada produk untuk diexport"); return; }
    const rows = products.map((p) => ({
      Kode: p.code,
      Nama: p.name,
      Kategori: p.category || "",
      "Harga Modal": p.cost_price || 0,
      Harga: p.price || 0,
      "Harga Grosir": p.wholesale_price ?? "",
      "Min Grosir": p.wholesale_min_qty ?? "",
      Stok: p.stock || 0,
      Satuan: buildSatuanString(unitsByProduct[p.id] || []),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    (ws as any)["!cols"] = [
      { wch: 10 }, { wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
      { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 70 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Produk");
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `produk-${today}.xlsx`);
    toast.success(`${rows.length} produk diexport`);
  };



  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Cari produk..." value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
        </div>
        <Button variant="outline" onClick={() => setScanMode("search")}>
          <ScanLine className="mr-2 h-4 w-4" /> Scan Cari
        </Button>
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
        <Button variant="outline" onClick={() => setScanMode("add")}>
          <ScanLine className="mr-2 h-4 w-4" /> Scan Tambah
        </Button>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" /> Tambah
        </Button>
        <Button variant="destructive" onClick={() => setConfirmDeleteAll(true)} disabled={products.length === 0}>
          <Trash className="mr-2 h-4 w-4" /> Hapus Semua ({products.length})
        </Button>
      </div>

      <AlertDialog open={confirmDeleteAll} onOpenChange={setConfirmDeleteAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus semua {products.length} produk?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini tidak bisa dibatalkan. Semua produk akan dihapus permanen dari database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingAll}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); removeAll(); }}
              disabled={deletingAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingAll ? "Menghapus..." : "Ya, Hapus Semua"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BarcodeScanner
        open={scanMode !== null}
        onClose={() => setScanMode(null)}
        onDetected={handleScan}
        title={scanMode === "search" ? "Scan untuk Cari" : "Scan untuk Tambah"}
        description={scanMode === "search" ? "Arahkan ke barcode produk untuk mencari" : "Arahkan ke barcode produk baru"}
      />


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
                      {(() => {
                        const us = unitsByProduct[p.id];
                        if (us && us.length > 0) {
                          const totalTiers = us.reduce((s, u) => s + u.tiers.length, 0);
                          return (
                            <div>
                              <div className="font-medium">{us.map((u) => u.name).join(" / ")}</div>
                              <div className="text-muted-foreground">{totalTiers} tingkat harga</div>
                            </div>
                          );
                        }
                        return p.wholesale_price && p.wholesale_min_qty ? (
                          <>
                            {formatRupiah(Number(p.wholesale_price))}
                            <div className="text-muted-foreground">≥ {p.wholesale_min_qty}</div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        );
                      })()}
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Produk" : "Tambah Produk"}</DialogTitle>
            <DialogDescription>
              Atur info dasar, satuan (pcs/slove/dus), dan tingkatan harga grosir.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Kode (otomatis jika kosong)" value={form.code} onChange={(v) => setForm({ ...form, code: v })} placeholder="Biarkan kosong → BRG0001" />
            <FormField label="Nama *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <FormField label="Kategori" value={form.category} onChange={(v) => setForm({ ...form, category: v })} />
            <FormField label="Stok (dalam satuan dasar)" value={form.stock} onChange={(v) => setForm({ ...form, stock: v })} type="number" />
            <FormField label="Harga Modal" value={form.cost_price} onChange={(v) => setForm({ ...form, cost_price: v })} type="number" />
          </div>

          <UnitsEditor units={formUnits} onChange={setFormUnits} />

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
                  <th className="p-2">Satuan</th>
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
                    <td className="p-2">
                      {r.units && r.units.length > 0 ? (
                        <span className="text-[11px]">
                          {r.units.map((u: ProductUnit) => `${u.name}(${u.tiers.length})`).join(", ")}
                        </span>
                      ) : r.satuanStr ? (
                        <span className="text-destructive text-[11px]" title="Format Satuan tidak terbaca">!format</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}


              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3 text-sm">
            <Label className="text-xs font-semibold">Mode Import</Label>
            <div className="flex flex-col gap-1.5">
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="radio" className="mt-1" checked={importMode === "upsert"} onChange={() => setImportMode("upsert")} />
                <span>
                  <span className="font-medium">Tambah & Update</span>
                  <span className="block text-xs text-muted-foreground">Produk baru ditambahkan, yang kodenya sudah ada akan diperbarui (kolom kosong akan ditimpa).</span>
                </span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="radio" className="mt-1" checked={importMode === "update_only"} onChange={() => setImportMode("update_only")} />
                <span>
                  <span className="font-medium">Update Saja</span>
                  <span className="block text-xs text-muted-foreground">Hanya update produk berdasarkan Kode. Baris tanpa kode / kode tidak ditemukan dilewati. Kolom kosong di Excel TIDAK menimpa data lama.</span>
                </span>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Batal</Button>
            <Button onClick={confirmImport} disabled={importing}>
              {importing
                ? "Memproses..."
                : importMode === "update_only"
                  ? `Update ${importPreview.filter((r) => r.code).length} produk`
                  : `Import ${importPreview.filter((r) => r.name).length} produk`}
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





function UnitsEditor({ units, onChange }: { units: ProductUnit[]; onChange: (u: ProductUnit[]) => void }) {
  const update = (i: number, patch: Partial<ProductUnit>) => {
    const copy = units.map((u, idx) => (idx === i ? { ...u, ...patch } : u));
    if (patch.is_base) copy.forEach((u, idx) => { if (idx !== i) u.is_base = false; });
    onChange(copy);
  };
  const updateTier = (ui: number, ti: number, patch: Partial<{ min_qty: number; price: number }>) => {
    const copy = units.map((u, idx) => {
      if (idx !== ui) return u;
      const tiers = u.tiers.map((t, j) => (j === ti ? { ...t, ...patch } : t));
      return { ...u, tiers };
    });
    onChange(copy);
  };
  const addUnit = () => {
    onChange([...units, { name: "", conversion: 1, sort_order: units.length, is_base: units.length === 0, tiers: [{ min_qty: 1, price: 0 }] }]);
  };
  const removeUnit = (i: number) => {
    const copy = units.filter((_, idx) => idx !== i);
    if (!copy.some((u) => u.is_base) && copy[0]) copy[0].is_base = true;
    onChange(copy);
  };
  const addTier = (ui: number) => {
    const u = units[ui];
    const lastMin = u.tiers.length > 0 ? Math.max(...u.tiers.map((t) => t.min_qty)) : 0;
    update(ui, { tiers: [...u.tiers, { min_qty: lastMin + 1, price: 0 }] });
  };
  const removeTier = (ui: number, ti: number) => {
    const u = units[ui];
    update(ui, { tiers: u.tiers.filter((_, j) => j !== ti) });
  };

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-semibold flex items-center gap-1.5"><Package className="h-4 w-4" /> Satuan & Tingkatan Harga</Label>
          <p className="text-xs text-muted-foreground mt-0.5">Buat satuan (mis. pcs, slove=10pcs, dus=60pcs). Tiap satuan boleh punya beberapa harga sesuai jumlah beli.</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={addUnit}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Satuan
        </Button>
      </div>
      {units.length === 0 && <p className="text-xs text-muted-foreground italic">Belum ada satuan.</p>}
      {units.map((u, ui) => (
        <div key={ui} className="space-y-2 rounded-md border bg-card p-2.5">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[100px]">
              <Label className="text-[10px] uppercase">Nama Satuan</Label>
              <Input value={u.name} onChange={(e) => update(ui, { name: e.target.value })} placeholder="pcs / slove / dus" className="h-8" />
            </div>
            <div className="w-24">
              <Label className="text-[10px] uppercase">= ... unit dasar</Label>
              <Input type="number" min={1} value={u.conversion} onChange={(e) => update(ui, { conversion: parseInt(e.target.value || "1", 10) })} className="h-8" />
            </div>
            <label className="flex items-center gap-1 text-xs cursor-pointer">
              <input type="radio" checked={u.is_base} onChange={() => update(ui, { is_base: true })} /> Dasar
            </label>
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeUnit(ui)}>
              <XIcon className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-1.5 pl-2 border-l-2 border-primary/30">
            {u.tiers.map((t, ti) => (
              <div key={ti} className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">≥</span>
                <Input type="number" min={1} value={t.min_qty} onChange={(e) => updateTier(ui, ti, { min_qty: parseInt(e.target.value || "1", 10) })} className="h-8 w-20" />
                <span className="text-muted-foreground">{u.name || "satuan"} →</span>
                <Input type="number" min={0} value={t.price} onChange={(e) => updateTier(ui, ti, { price: parseNumber(e.target.value) })} className="h-8 flex-1" placeholder="Harga" />
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeTier(ui, ti)}>
                  <XIcon className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => addTier(ui)}>
              <Plus className="mr-1 h-3 w-3" /> Tingkat harga
            </Button>
          </div>
        </div>
      ))}
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
  const satuanStr = String(get("satuan", "satuan & harga", "units", "satuan harga") ?? "").trim();
  const units = parseUnitsString(satuanStr);
  return { code, name, category, price, cost_price, wholesale_price, wholesale_min_qty, stock, units, satuanStr };
}

/**
 * Format kolom "Satuan":
 *   pcs*1: 1=15000; 3=14700; 5=14500 | slove*10: 1=143000 | dus*60: 1=800000
 * - Pisahkan tiap satuan dengan "|"
 * - "nama*konversi" lalu ":" lalu daftar "minQty=harga" dipisahkan ";" atau ","
 * - Satuan dengan konversi=1 dianggap satuan dasar (atau satuan pertama bila tak ada konversi=1)
 */
function parseUnitsString(s: string): ProductUnit[] {
  if (!s || !s.trim()) return [];
  const parts = s.split("|").map((x) => x.trim()).filter(Boolean);
  const units: ProductUnit[] = [];
  parts.forEach((part, i) => {
    const colon = part.indexOf(":");
    if (colon < 0) return;
    const head = part.slice(0, colon).trim();
    const body = part.slice(colon + 1).trim();
    const m = head.match(/^(.+?)(?:\*\s*(\d+))?$/);
    if (!m) return;
    const name = m[1].trim();
    const conversion = Math.max(1, parseInt(m[2] || "1", 10) || 1);
    const tiers = body
      .split(/[;,]/)
      .map((t) => {
        const [q, p] = t.split("=").map((x) => (x || "").trim());
        const min_qty = parseInt(q, 10);
        const price = parseNumber(p);
        if (!min_qty || min_qty < 1) return null;
        return { min_qty, price };
      })
      .filter(Boolean) as { min_qty: number; price: number }[];
    if (!name || tiers.length === 0) return;
    units.push({ name, conversion, sort_order: i, is_base: false, tiers });
  });
  if (units.length === 0) return [];
  const baseIdx = units.findIndex((u) => u.conversion === 1);
  units[baseIdx >= 0 ? baseIdx : 0].is_base = true;
  return units;
}


