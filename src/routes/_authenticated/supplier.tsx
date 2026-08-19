import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";
import { formatRupiah } from "@/lib/format";
import { Plus, Search, Truck, Pencil, Trash2, Phone, MessageCircle, ChevronsUpDown, Scale } from "lucide-react";
import { loadPurchaseRows, summarizeBySupplier, type PurchaseRow, type SupplierStat } from "@/lib/supplier-compare";

export const Route = createFileRoute("/_authenticated/supplier")({
  component: SupplierPage,
  head: () => ({
    meta: [
      { title: "Supplier & Bandingkan Harga — Dagang Pintar" },
      { name: "description", content: "Simpan kontak supplier toko dan bandingkan harga modal barang antar supplier." },
      { property: "og:title", content: "Supplier & Bandingkan Harga — Dagang Pintar" },
      { property: "og:description", content: "Kelola kontak supplier dan cari supplier termurah untuk tiap produk." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  contact_person: string | null;
  note: string | null;
};

type Product = { id: string; code: string; name: string };

const emptyForm = { name: "", phone: "", address: "", contact_person: "", note: "" };

function waLink(phone: string) {
  const digits = phone.replace(/\D/g, "").replace(/^0/, "62");
  return `https://wa.me/${digits}`;
}

function SupplierPage() {
  const [rows, setRows] = useState<Supplier[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data, error } = await (supabase as any).from("suppliers").select("*").order("name");
    if (error) return toast.error(error.message);
    setRows((data || []) as Supplier[]);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.name, r.phone, r.contact_person, r.address, r.note].some((v) => (v || "").toLowerCase().includes(q)),
    );
  }, [rows, query]);

  const openCreate = () => { setEditingId(null); setForm({ ...emptyForm }); setOpen(true); };
  const openEdit = (s: Supplier) => {
    setEditingId(s.id);
    setForm({
      name: s.name,
      phone: s.phone || "",
      address: s.address || "",
      contact_person: s.contact_person || "",
      note: s.note || "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("Nama supplier wajib diisi");
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      contact_person: form.contact_person.trim() || null,
      note: form.note.trim() || null,
    };
    let error: any = null;
    if (editingId) {
      ({ error } = await (supabase as any).from("suppliers").update(payload).eq("id", editingId));
    } else {
      const { data: tid } = await supabase.rpc("current_tenant_id");
      if (!tid) { setSaving(false); return toast.error("Toko tidak ditemukan"); }
      ({ error } = await (supabase as any).from("suppliers").insert({ ...payload, tenant_id: tid }));
    }
    setSaving(false);
    if (error) return toast.error(error.message.includes("suppliers_tenant_name_key") ? "Nama supplier sudah ada" : error.message);
    toast.success(editingId ? "Supplier diperbarui" : "Supplier ditambahkan");
    setOpen(false);
    load();
  };

  const remove = async (s: Supplier) => {
    if (!confirm(`Hapus supplier "${s.name}"?`)) return;
    const { error } = await (supabase as any).from("suppliers").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("Supplier dihapus");
    load();
  };

  return (
    <div className="space-y-6">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10">
            <Truck className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold sm:text-2xl">Supplier</h1>
            <p className="truncate text-xs text-muted-foreground">Kontak supplier & perbandingan harga modal</p>
          </div>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> Supplier
        </Button>
      </header>

      <Card className="p-4">
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama / nomor / sales..." className="pl-9" />
        </div>

        {filtered.length === 0 ? (
          <div className="rounded border p-8 text-center text-sm text-muted-foreground">
            Belum ada supplier. Klik "Supplier" untuk menambahkan kontak.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((s) => (
              <div key={s.id} className="rounded-lg border bg-card p-3 shadow-sm">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{s.name}</div>
                    {s.contact_person && <div className="truncate text-xs text-muted-foreground">Sales: {s.contact_person}</div>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(s)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(s)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {s.phone && (
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{s.phone}</span>
                  </div>
                )}
                {s.address && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{s.address}</div>}
                {s.note && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">Catatan: {s.note}</div>}
                {s.phone && (
                  <Button asChild size="sm" variant="outline" className="mt-3 w-full">
                    <a href={waLink(s.phone)} target="_blank" rel="noreferrer">
                      <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp
                    </a>
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <CompareCard />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Supplier" : "Tambah Supplier"}</DialogTitle>
            <DialogDescription>Simpan kontak supplier agar mudah dihubungi saat order.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nama supplier *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Contoh: PT Sinar Jaya" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">No. HP / WA</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="08xxxxxxxxxx" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Nama sales / PIC</Label>
                <Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} placeholder="Opsional" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Alamat</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Opsional" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Catatan</Label>
              <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Contoh: kirim tiap Senin" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CompareCard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [picked, setPicked] = useState<Product | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [stats, setStats] = useState<SupplierStat[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("products").select("id, code, name").order("name");
      setProducts((data || []) as Product[]);
    })();
  }, []);

  useEffect(() => {
    if (!picked) { setRows([]); setStats([]); return; }
    let alive = true;
    setLoading(true);
    loadPurchaseRows(picked.id, picked.code)
      .then((r) => { if (!alive) return; setRows(r); setStats(summarizeBySupplier(r)); })
      .catch((e: any) => toast.error(e?.message || "Gagal memuat riwayat"))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [picked]);

  const cheapest = stats[0];

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Scale className="h-4 w-4 text-primary" />
        <div className="text-sm font-semibold">Bandingkan Harga Supplier</div>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Pilih produk untuk melihat harga modal dari tiap supplier. Harga disamakan ke <b>per pcs (unit dasar)</b> agar adil walau beli per dus/rcg.
      </p>

      <Popover open={pickOpen} onOpenChange={setPickOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-between sm:w-96">
            <span className="truncate">{picked ? `${picked.name} (${picked.code})` : "Pilih produk..."}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(24rem,90vw)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Cari produk..." />
            <CommandList>
              <CommandEmpty>Produk tidak ditemukan.</CommandEmpty>
              <CommandGroup>
                {products.map((p) => (
                  <CommandItem key={p.id} value={`${p.name} ${p.code}`} onSelect={() => { setPicked(p); setPickOpen(false); }}>
                    <span className="truncate">{p.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{p.code}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {loading && <div className="mt-4 text-sm text-muted-foreground">Memuat...</div>}

      {!loading && picked && stats.length === 0 && (
        <div className="mt-4 rounded border p-6 text-center text-sm text-muted-foreground">
          Belum ada riwayat pembelian yang diterima untuk produk ini.
        </div>
      )}

      {!loading && stats.length > 0 && (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-2">Supplier</th>
                  <th className="p-2 text-right">Harga terakhir /pcs</th>
                  <th className="p-2 text-right">Selisih</th>
                  <th className="p-2 text-right">Termurah</th>
                  <th className="p-2 text-right">Termahal</th>
                  <th className="p-2 text-right">Rata-rata</th>
                  <th className="p-2 text-right">Beli</th>
                  <th className="p-2">Terakhir</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => {
                  const diff = s.lastPerBase - (cheapest?.lastPerBase ?? 0);
                  const pct = cheapest && cheapest.lastPerBase > 0 ? (diff / cheapest.lastPerBase) * 100 : 0;
                  const isBest = s.supplier === cheapest?.supplier;
                  return (
                    <tr key={s.supplier} className="border-b last:border-0">
                      <td className="p-2 font-medium">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{s.supplier}</span>
                          {isBest && <Badge className="shrink-0">Termurah</Badge>}
                        </div>
                      </td>
                      <td className="p-2 text-right font-semibold">{formatRupiah(s.lastPerBase)}</td>
                      <td className={`p-2 text-right ${diff > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                        {diff > 0 ? `+${formatRupiah(diff)} (${pct.toFixed(1)}%)` : "—"}
                      </td>
                      <td className="p-2 text-right text-muted-foreground">{formatRupiah(s.minPerBase)}</td>
                      <td className="p-2 text-right text-muted-foreground">{formatRupiah(s.maxPerBase)}</td>
                      <td className="p-2 text-right text-muted-foreground">{formatRupiah(s.avgPerBase)}</td>
                      <td className="p-2 text-right text-muted-foreground">{s.count}x</td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {new Date(s.lastAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4">
            <div className="mb-2 text-xs font-semibold text-muted-foreground">Riwayat pembelian</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2">Tanggal</th>
                    <th className="p-2">Supplier</th>
                    <th className="p-2">Satuan</th>
                    <th className="p-2 text-right">Qty</th>
                    <th className="p-2 text-right">Modal/satuan</th>
                    <th className="p-2 text-right">Per pcs</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.poId}-${i}`} className="border-b last:border-0">
                      <td className="p-2 text-xs">
                        {new Date(r.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="p-2 truncate">{r.supplier}</td>
                      <td className="p-2">{r.unitName}</td>
                      <td className="p-2 text-right">{r.qtyReceived || r.qty}</td>
                      <td className="p-2 text-right">{formatRupiah(r.unitCost)}</td>
                      <td className="p-2 text-right font-medium">{formatRupiah(r.perBase)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
