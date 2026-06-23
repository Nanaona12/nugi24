import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { AlarmClock, Plus, Pencil, Trash2, Search, CalendarDays, Download, Upload } from "lucide-react";


export const Route = createFileRoute("/_authenticated/kadaluarsa")({
  component: KadaluarsaPage,
});

type Batch = {
  id: string;
  product_id: string;
  qty: number;
  expiry_date: string; // YYYY-MM-DD
  note: string | null;
  source: string;
  created_at: string;
};
type ProductLite = { id: string; code: string; name: string };

type Bucket = "all" | "expired" | "le30" | "le60" | "le90" | "gt90";

function daysUntil(date: string): number {
  const d = new Date(date + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / 86400000);
}

function bucketOf(days: number): Exclude<Bucket, "all"> {
  if (days < 0) return "expired";
  if (days <= 30) return "le30";
  if (days <= 60) return "le60";
  if (days <= 90) return "le90";
  return "gt90";
}

function bucketBadge(days: number) {
  if (days < 0) return <Badge variant="destructive">Expired {Math.abs(days)}h lalu</Badge>;
  if (days <= 30) return <Badge className="bg-red-500 hover:bg-red-500/90">{days} hari lagi</Badge>;
  if (days <= 60) return <Badge className="bg-orange-500 hover:bg-orange-500/90">{days} hari lagi</Badge>;
  if (days <= 90) return <Badge className="bg-amber-500 hover:bg-amber-500/90">{days} hari lagi</Badge>;
  return <Badge variant="secondary">{days} hari lagi</Badge>;
}

// Parse berbagai format tanggal Excel/string -> YYYY-MM-DD; null jika gagal
function parseExpiryCell(v: any): string | null {
  if (v == null || v === "") return null;
  // Excel serial number
  if (typeof v === "number" && isFinite(v)) {
    // SheetJS epoch (1900) — use XLSX util
    const d = XLSX.SSF.parse_date_code(v);
    if (d) {
      const yyyy = String(d.y).padStart(4, "0");
      const mm = String(d.m).padStart(2, "0");
      const dd = String(d.d).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
  }
  if (v instanceof Date && !isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  // YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  // DD-MM-YYYY or DD/MM/YYYY
  m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (m) {
    let y = m[3]; if (y.length === 2) y = "20" + y;
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}


function KadaluarsaPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [query, setQuery] = useState("");
  const [bucket, setBucket] = useState<Bucket>("all");
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<{ id?: string; product_id: string; qty: string; expiry_date: string; note: string }>({
    product_id: "",
    qty: "1",
    expiry_date: "",
    note: "",
  });
  const [productSearch, setProductSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<{ kode: string; nama: string; qty: number | null; expiry_date: string | null; note: string; product_id: string | null; error: string | null }[]>([]);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);


  const load = async () => {
    const [{ data: b, error: e1 }, { data: p, error: e2 }] = await Promise.all([
      (supabase as any).from("product_batches").select("*").order("expiry_date", { ascending: true }),
      supabase.from("products").select("id, code, name").order("name"),
    ]);
    if (e1) toast.error(e1.message);
    else setBatches((b || []) as Batch[]);
    if (e2) toast.error(e2.message);
    else setProducts((p || []) as ProductLite[]);
  };
  useEffect(() => { load(); }, []);

  const productMap = useMemo(() => {
    const m = new Map<string, ProductLite>();
    products.forEach((p) => m.set(p.id, p));
    return m;
  }, [products]);

  const enriched = useMemo(
    () =>
      batches.map((b) => {
        const d = daysUntil(b.expiry_date);
        return { ...b, days: d, bucket: bucketOf(d), product: productMap.get(b.product_id) };
      }),
    [batches, productMap],
  );

  const counts = useMemo(() => {
    const c = { expired: 0, le30: 0, le60: 0, le90: 0, gt90: 0 };
    enriched.forEach((e) => { c[e.bucket] += 1; });
    return c;
  }, [enriched]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enriched.filter((e) => {
      if (bucket !== "all" && e.bucket !== bucket) return false;
      if (!q) return true;
      const p = e.product;
      return (
        (p?.name || "").toLowerCase().includes(q) ||
        (p?.code || "").toLowerCase().includes(q) ||
        (e.note || "").toLowerCase().includes(q)
      );
    });
  }, [enriched, bucket, query]);

  const openNew = () => {
    setForm({ product_id: "", qty: "1", expiry_date: "", note: "" });
    setProductSearch("");
    setEditOpen(true);
  };
  const openEdit = (b: Batch) => {
    setForm({
      id: b.id,
      product_id: b.product_id,
      qty: String(b.qty),
      expiry_date: b.expiry_date,
      note: b.note || "",
    });
    setProductSearch("");
    setEditOpen(true);
  };

  const saveForm = async () => {
    if (!form.product_id) { toast.error("Pilih produk"); return; }
    const qty = parseInt(form.qty || "0", 10);
    if (!qty || qty < 1) { toast.error("Jumlah harus ≥ 1"); return; }
    if (!form.expiry_date) { toast.error("Isi tanggal kadaluarsa"); return; }
    const payload: any = {
      product_id: form.product_id,
      qty,
      expiry_date: form.expiry_date,
      note: form.note.trim() || null,
    };
    if (form.id) {
      const { error } = await (supabase as any).from("product_batches").update(payload).eq("id", form.id);
      if (error) { toast.error(error.message); return; }
    } else {
      // tenant_id via default? need to set
      const { data: tenant } = await supabase
        .from("tenants")
        .select("id")
        .eq("owner_user_id", (await supabase.auth.getUser()).data.user?.id || "")
        .maybeSingle();
      if (!tenant) { toast.error("Tenant tidak ditemukan"); return; }
      payload.tenant_id = tenant.id;
      payload.source = "manual";
      const { error } = await (supabase as any).from("product_batches").insert(payload);
      if (error) { toast.error(error.message); return; }
    }
    toast.success("Batch disimpan");
    setEditOpen(false);
    load();
  };

  const remove = async (b: Batch) => {
    if (!confirm("Hapus batch ini?")) return;
    const { error } = await (supabase as any).from("product_batches").delete().eq("id", b.id);
    if (error) toast.error(error.message);
    else { toast.success("Dihapus"); load(); }
  };

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products.slice(0, 50);
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q))
      .slice(0, 50);
  }, [products, productSearch]);

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      { kode_produk: "BRG0001", nama_produk: "Indomie Goreng", jumlah: 2, tanggal_kadaluarsa: "2026-07-22", catatan: "batch supplier A" },
      { kode_produk: "BRG0001", nama_produk: "Indomie Goreng", jumlah: 5, tanggal_kadaluarsa: "2027-07-24", catatan: "" },
      { kode_produk: "BRG0002", nama_produk: "Susu UHT 1L", jumlah: 10, tanggal_kadaluarsa: "2026-09-15", catatan: "" },
    ]);
    (ws as any)["!cols"] = [{ wch: 14 }, { wch: 24 }, { wch: 10 }, { wch: 20 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Batch");
    const help = XLSX.utils.aoa_to_sheet([
      ["Petunjuk Import Batch Kadaluarsa"],
      [""],
      ["Kolom wajib:"],
      ["- kode_produk : kode produk yang sudah ada di sistem (mis. BRG0001)"],
      ["- jumlah      : angka >= 1, dalam satuan dasar (pcs)"],
      ["- tanggal_kadaluarsa : format YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, atau tanggal Excel"],
      [""],
      ["Kolom opsional:"],
      ["- nama_produk : hanya info, tidak dipakai untuk pencocokan"],
      ["- catatan     : catatan bebas"],
      [""],
      ["Produk yang sama BOLEH muncul di beberapa baris dengan exp date berbeda."],
      ["Contoh: Indomie 2 pcs exp 22-07-2026 + 5 pcs exp 24-07-2027 -> 2 baris terpisah."],
      [""],
      ["Stok akan otomatis berkurang dari batch dengan exp terdekat (FEFO) saat transaksi kasir."],
    ]);
    (help as any)["!cols"] = [{ wch: 90 }];
    XLSX.utils.book_append_sheet(wb, help, "Petunjuk");
    XLSX.writeFile(wb, "template-batch-kadaluarsa.xlsx");
  };

  const onFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
      if (rows.length === 0) { toast.error("File kosong"); return; }
      const codeMap = new Map<string, string>();
      products.forEach((p) => codeMap.set(p.code.toLowerCase(), p.id));
      const today = new Date().toISOString().slice(0, 10);
      const normalized = rows.map((r) => {
        const kode = String(r.kode_produk ?? r.kode ?? r.code ?? "").trim();
        const nama = String(r.nama_produk ?? r.nama ?? r.name ?? "").trim();
        const qtyRaw = r.jumlah ?? r.qty ?? r.quantity ?? "";
        const qty = qtyRaw === "" ? null : parseInt(String(qtyRaw).replace(/\D/g, ""), 10) || null;
        const expRaw = r.tanggal_kadaluarsa ?? r.expiry_date ?? r.expired ?? r.exp ?? r.tanggal ?? "";
        const expiry_date = parseExpiryCell(expRaw);
        const note = String(r.catatan ?? r.note ?? "").trim();
        const product_id = kode ? codeMap.get(kode.toLowerCase()) || null : null;
        let error: string | null = null;
        if (!kode) error = "Kode produk kosong";
        else if (!product_id) error = `Kode "${kode}" tidak ditemukan`;
        else if (!qty || qty < 1) error = "Jumlah harus angka >= 1";
        else if (!expiry_date) error = "Tanggal kadaluarsa tidak valid";
        else if (expiry_date < today) error = "Tanggal sudah lewat";
        return { kode, nama, qty, expiry_date, note, product_id, error };
      });
      setImportPreview(normalized);
      setImportOpen(true);
    } catch (e: any) {
      toast.error("Gagal baca file: " + e.message);
    }
  };

  const confirmImport = async () => {
    const valid = importPreview.filter((r) => !r.error && r.product_id && r.qty && r.expiry_date);
    if (valid.length === 0) { toast.error("Tidak ada baris valid"); return; }
    setImporting(true);
    try {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("id")
        .eq("owner_user_id", (await supabase.auth.getUser()).data.user?.id || "")
        .maybeSingle();
      if (!tenant) { toast.error("Tenant tidak ditemukan"); setImporting(false); return; }
      const rows = valid.map((r) => ({
        tenant_id: tenant.id,
        product_id: r.product_id,
        qty: r.qty,
        expiry_date: r.expiry_date,
        note: r.note || null,
        source: "import",
      }));
      const { error } = await (supabase as any).from("product_batches").insert(rows);
      if (error) { toast.error(error.message); setImporting(false); return; }
      const failed = importPreview.length - valid.length;
      toast.success(`${valid.length} batch diimport${failed ? `, ${failed} gagal/dilewati` : ""}`);
      setImportOpen(false);
      setImportPreview([]);
      load();
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <AlarmClock className="h-5 w-5 text-primary" /> Kadaluarsa Produk
          </h1>
          <p className="text-xs text-muted-foreground">
            Catat batch produk beserta tanggal expired. Stok berkurang otomatis dari batch terdekat expired (FEFO) saat ada transaksi.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }}
          />
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" /> Tambah Batch
          </Button>
        </div>
      </div>


      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryCard label="Expired" count={counts.expired} active={bucket === "expired"} onClick={() => setBucket(bucket === "expired" ? "all" : "expired")} tone="destructive" />
        <SummaryCard label="≤ 30 hari" count={counts.le30} active={bucket === "le30"} onClick={() => setBucket(bucket === "le30" ? "all" : "le30")} tone="red" />
        <SummaryCard label="31 – 60 hari" count={counts.le60} active={bucket === "le60"} onClick={() => setBucket(bucket === "le60" ? "all" : "le60")} tone="orange" />
        <SummaryCard label="61 – 90 hari" count={counts.le90} active={bucket === "le90"} onClick={() => setBucket(bucket === "le90" ? "all" : "le90")} tone="amber" />
        <SummaryCard label="> 90 hari" count={counts.gt90} active={bucket === "gt90"} onClick={() => setBucket(bucket === "gt90" ? "all" : "gt90")} tone="muted" />
      </div>

      <Card className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Cari produk / kode / catatan..." value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
        </div>
        <Select value={bucket} onValueChange={(v) => setBucket(v as Bucket)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua</SelectItem>
            <SelectItem value="expired">Sudah expired</SelectItem>
            <SelectItem value="le30">≤ 30 hari</SelectItem>
            <SelectItem value="le60">31 – 60 hari</SelectItem>
            <SelectItem value="le90">61 – 90 hari</SelectItem>
            <SelectItem value="gt90">&gt; 90 hari</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Produk</th>
                <th className="p-3 text-right">Jumlah</th>
                <th className="p-3">Tgl Kadaluarsa</th>
                <th className="p-3">Status</th>
                <th className="p-3">Catatan</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-muted-foreground">
                    <CalendarDays className="mx-auto mb-3 h-12 w-12 opacity-30" />
                    <div>Belum ada batch.</div>
                    <div className="text-xs">Klik "Tambah Batch" untuk mulai mencatat tanggal kadaluarsa per batch produk.</div>
                  </td>
                </tr>
              ) : (
                filtered.map((b) => (
                  <tr key={b.id} className="border-t hover:bg-muted/40">
                    <td className="p-3">
                      <div className="font-medium">{b.product?.name || <span className="text-muted-foreground italic">produk dihapus</span>}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{b.product?.code}</div>
                    </td>
                    <td className="p-3 text-right font-semibold">{b.qty}</td>
                    <td className="p-3">{new Date(b.expiry_date + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}</td>
                    <td className="p-3">{bucketBadge(b.days)}</td>
                    <td className="p-3 text-xs text-muted-foreground">{b.note}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(b)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => remove(b)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Batch" : "Tambah Batch Kadaluarsa"}</DialogTitle>
            <DialogDescription>
              Produk yang sama bisa punya beberapa batch dengan tanggal expired berbeda (mis. Indomie 2 pcs exp 22-07-2026, dan 5 pcs exp 24-07-2027).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {!form.id && (
              <div className="space-y-1.5">
                <Label className="text-xs">Cari Produk</Label>
                <Input placeholder="Ketik nama / kode produk..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
                <div className="max-h-40 overflow-y-auto rounded border bg-card">
                  {filteredProducts.length === 0 ? (
                    <div className="p-3 text-xs text-muted-foreground">Tidak ada produk.</div>
                  ) : (
                    filteredProducts.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setForm({ ...form, product_id: p.id })}
                        className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted ${form.product_id === p.id ? "bg-primary/10" : ""}`}
                      >
                        <span>{p.name}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">{p.code}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
            {form.id && (
              <div className="rounded-md border bg-muted/30 p-2 text-sm">
                <span className="text-muted-foreground">Produk: </span>
                <span className="font-medium">{productMap.get(form.product_id)?.name || "—"}</span>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Jumlah (satuan dasar)</Label>
                <Input type="number" min={1} value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tanggal Kadaluarsa</Label>
                <Input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Catatan (opsional)</Label>
              <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Mis. batch dari supplier A" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Batal</Button>
            <Button onClick={saveForm}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Preview Import Batch Kadaluarsa</DialogTitle>
            <DialogDescription>
              {importPreview.length} baris terdeteksi. {importPreview.filter((r) => !r.error).length} valid, {importPreview.filter((r) => r.error).length} bermasalah (akan dilewati).
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-auto rounded border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted text-left">
                <tr>
                  <th className="p-2">Kode</th>
                  <th className="p-2">Nama</th>
                  <th className="p-2 text-right">Jumlah</th>
                  <th className="p-2">Tgl Kadaluarsa</th>
                  <th className="p-2">Catatan</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {importPreview.map((r, i) => (
                  <tr key={i} className={`border-t ${r.error ? "bg-destructive/10" : ""}`}>
                    <td className="p-2 font-mono">{r.kode}</td>
                    <td className="p-2">{r.nama}</td>
                    <td className="p-2 text-right">{r.qty ?? ""}</td>
                    <td className="p-2">{r.expiry_date || ""}</td>
                    <td className="p-2">{r.note}</td>
                    <td className="p-2">{r.error ? <span className="text-destructive">{r.error}</span> : <span className="text-green-600">OK</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Batal</Button>
            <Button onClick={confirmImport} disabled={importing || importPreview.every((r) => r.error)}>
              {importing ? "Memproses..." : `Simpan ${importPreview.filter((r) => !r.error).length} batch`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

  );
}

function SummaryCard({
  label,
  count,
  active,
  onClick,
  tone,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  tone: "destructive" | "red" | "orange" | "amber" | "muted";
}) {
  const toneCls: Record<string, string> = {
    destructive: "border-destructive/50 bg-destructive/10 text-destructive",
    red: "border-red-500/50 bg-red-500/10 text-red-600",
    orange: "border-orange-500/50 bg-orange-500/10 text-orange-600",
    amber: "border-amber-500/50 bg-amber-500/10 text-amber-700",
    muted: "border-border bg-muted/40 text-foreground",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border p-3 text-left transition ${toneCls[tone]} ${active ? "ring-2 ring-primary" : "hover:brightness-95"}`}
    >
      <div className="text-xs font-medium">{label}</div>
      <div className="mt-1 text-2xl font-bold">{count}</div>
      <div className="text-[11px] opacity-70">batch</div>
    </button>
  );
}
