import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Pencil, KeyRound, Trash2, UserCircle2, Loader2, Power } from "lucide-react";
import { createCashier, deleteCashier, listCashiers, updateCashier } from "@/lib/cashier.functions";

export const Route = createFileRoute("/_authenticated/karyawan")({
  component: KaryawanPage,
});

type Cashier = { id: string; name: string; active: boolean; created_at?: string };

function KaryawanPage() {
  const [items, setItems] = useState<Cashier[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<{ id?: string; name: string; pin: string; active: boolean }>({ name: "", pin: "", active: true });
  const [pinOpen, setPinOpen] = useState<null | Cashier>(null);
  const [newPin, setNewPin] = useState("");
  const [saving, setSaving] = useState(false);

  const listFn = useServerFn(listCashiers);
  const createFn = useServerFn(createCashier);
  const updateFn = useServerFn(updateCashier);
  const deleteFn = useServerFn(deleteCashier);

  const reload = async () => {
    setLoading(true);
    try { setItems(((await listFn()) as Cashier[]) || []); }
    catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, []);

  const openNew = () => { setForm({ name: "", pin: "", active: true }); setEditOpen(true); };
  const openEdit = (c: Cashier) => { setForm({ id: c.id, name: c.name, pin: "", active: c.active }); setEditOpen(true); };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Nama wajib"); return; }
    setSaving(true);
    try {
      if (form.id) {
        await updateFn({ data: { id: form.id, name: form.name.trim(), active: form.active } });
        toast.success("Tersimpan");
      } else {
        if (!/^\d{4,6}$/.test(form.pin)) { toast.error("PIN harus 4-6 angka"); setSaving(false); return; }
        await createFn({ data: { name: form.name.trim(), pin: form.pin } });
        toast.success("Kasir ditambahkan");
      }
      setEditOpen(false);
      reload();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const resetPin = async () => {
    if (!pinOpen) return;
    if (!/^\d{4,6}$/.test(newPin)) { toast.error("PIN harus 4-6 angka"); return; }
    setSaving(true);
    try {
      await updateFn({ data: { id: pinOpen.id, newPin } });
      toast.success("PIN diubah");
      setPinOpen(null); setNewPin("");
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const toggleActive = async (c: Cashier) => {
    try {
      await updateFn({ data: { id: c.id, active: !c.active } });
      reload();
    } catch (e: any) { toast.error(e.message); }
  };

  const remove = async (c: Cashier) => {
    if (!confirm(`Hapus kasir "${c.name}"? Bila sudah ada riwayat, akun akan dinonaktifkan saja.`)) return;
    try {
      const res = (await deleteFn({ data: { id: c.id } })) as any;
      toast.success(res?.softDeleted ? "Kasir dinonaktifkan (ada riwayat)" : "Kasir dihapus");
      reload();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Karyawan / Kasir</h1>
          <p className="text-xs text-muted-foreground">Buat akun PIN untuk tiap kasir. Kasir login dgn PIN di halaman Kasir tanpa keluar dari akun pemilik.</p>
        </div>
        <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Tambah Kasir</Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Nama</th>
                <th className="p-3">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3} className="p-8 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={3} className="p-12 text-center text-muted-foreground">
                  <UserCircle2 className="mx-auto mb-3 h-10 w-10 opacity-40" />
                  <div>Belum ada akun kasir.</div>
                  <div className="text-xs">Klik "Tambah Kasir" untuk buat akun PIN.</div>
                </td></tr>
              ) : items.map((c) => (
                <tr key={c.id} className="border-t hover:bg-muted/40">
                  <td className="p-3 font-medium">{c.name}</td>
                  <td className="p-3">
                    <Badge variant={c.active ? "default" : "secondary"}>{c.active ? "Aktif" : "Nonaktif"}</Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setPinOpen(c)} title="Reset PIN">
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleActive(c)} title={c.active ? "Nonaktifkan" : "Aktifkan"}>
                        <Power className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(c)} title="Edit nama">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(c)} title="Hapus">
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

      {/* Edit / Tambah */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Kasir" : "Tambah Kasir"}</DialogTitle>
            <DialogDescription>
              {form.id ? "Ubah nama atau status kasir. Untuk ganti PIN gunakan tombol kunci pada baris kasir." : "Buat akun PIN baru untuk kasir."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nama</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nama kasir" autoFocus />
            </div>
            {!form.id && (
              <div>
                <Label className="text-xs">PIN (4-6 angka)</Label>
                <Input
                  inputMode="numeric"
                  maxLength={6}
                  value={form.pin}
                  onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                  placeholder="••••"
                  className="text-center text-xl tracking-[0.4em]"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={saving}>Batal</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset PIN */}
      <Dialog open={pinOpen !== null} onOpenChange={(o) => { if (!o) { setPinOpen(null); setNewPin(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset PIN {pinOpen?.name}</DialogTitle>
            <DialogDescription>Masukkan PIN baru 4-6 angka.</DialogDescription>
          </DialogHeader>
          <Input
            inputMode="numeric"
            maxLength={6}
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="••••"
            className="text-center text-xl tracking-[0.4em]"
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setPinOpen(null); setNewPin(""); }} disabled={saving}>Batal</Button>
            <Button onClick={resetPin} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan PIN</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
