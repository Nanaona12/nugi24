import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, Users, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/_authenticated/pelanggan")({
  component: PelangganPage,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6 text-sm">Tidak ditemukan</div>,
});

type Customer = {
  id: string;
  tenant_id: string;
  name: string;
  phone: string | null;
  address: string | null;
  note: string | null;
  points: number;
  created_at: string;
};

type FormState = { id?: string; name: string; phone: string; address: string; note: string };

const empty: FormState = { name: "", phone: "", address: "", note: "" };

function PelangganPage() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data: tid } = await supabase.rpc("current_tenant_id");
    let resolvedTid = (tid as string | null) ?? null;
    if (!resolvedTid) {
      const { data: t } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
      resolvedTid = t?.id ?? null;
    }
    setTenantId(resolvedTid);
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("name", { ascending: true });
    if (error) toast.error(error.message);
    else setRows((data || []) as Customer[]);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.name.toLowerCase().includes(q) ||
      (r.phone || "").toLowerCase().includes(q) ||
      (r.address || "").toLowerCase().includes(q),
    );
  }, [rows, query]);

  const openAdd = () => { setForm(empty); setOpen(true); };
  const openEdit = (c: Customer) => {
    setForm({ id: c.id, name: c.name, phone: c.phone || "", address: c.address || "", note: c.note || "" });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Nama wajib diisi"); return; }
    if (!tenantId) { toast.error("Akun belum terhubung ke toko"); return; }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      note: form.note.trim() || null,
    };
    let error;
    if (form.id) {
      ({ error } = await supabase.from("customers").update(payload).eq("id", form.id));
    } else {
      ({ error } = await supabase.from("customers").insert({ ...payload, tenant_id: tenantId } as any));
    }
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(form.id ? "Pelanggan diperbarui" : "Pelanggan ditambahkan");
    setOpen(false);
    load();
  };

  const remove = async (c: Customer) => {
    if (!confirm(`Hapus pelanggan "${c.name}"?`)) return;
    const { error } = await supabase.from("customers").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Pelanggan dihapus");
    load();
  };

  const exportExcel = () => {
    if (filtered.length === 0) { toast.error("Tidak ada data untuk diekspor"); return; }
    const wb = XLSX.utils.book_new();
    const header = ["Nama", "No. HP", "Alamat", "Poin", "Catatan", "Tanggal Daftar"];
    const data = filtered.map((c) => [
      c.name,
      c.phone || "",
      c.address || "",
      c.points ?? 0,
      c.note || "",
      new Date(c.created_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
    ws["!cols"] = [{ wch: 24 }, { wch: 16 }, { wch: 32 }, { wch: 8 }, { wch: 24 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, "Pelanggan");
    const ts = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Data-Pelanggan-${ts}.xlsx`);
    toast.success(`${filtered.length} pelanggan diekspor`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Users className="h-6 w-6 text-primary" /> Pelanggan
          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{rows.length}</span>
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportExcel} disabled={filtered.length === 0}>
            <FileSpreadsheet className="mr-1 h-4 w-4" />Export Excel
          </Button>
          <Button onClick={openAdd}><Plus className="mr-1 h-4 w-4" />Tambah</Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Cari nama, no. HP, atau alamat..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Nama</th>
                <th className="p-3">No. HP</th>
                <th className="p-3">Alamat</th>
                <th className="p-3 text-right">Poin</th>
                <th className="p-3">Catatan</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-muted-foreground">
                    <Users className="mx-auto mb-3 h-12 w-12 opacity-30" />
                    Belum ada pelanggan
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id} className="border-t hover:bg-muted/40">
                    <td className="p-3 font-medium">{c.name}</td>
                    <td className="p-3">{c.phone || "-"}</td>
                    <td className="p-3">{c.address || "-"}</td>
                    <td className="p-3 text-right">
                      <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-600">
                        {c.points ?? 0}
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground">{c.note || "-"}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(c)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => remove(c)} className="text-destructive hover:text-destructive">
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Pelanggan" : "Tambah Pelanggan"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Nama *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>No. HP / WhatsApp</Label><Input inputMode="numeric" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/[^\d+]/g, "") })} placeholder="08xxxxxxxxxx" /></div>
            <div><Label>Alamat</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div><Label>Catatan</Label><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
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
