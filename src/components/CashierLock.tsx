import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, LockKeyhole, LogOut, UserCircle2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { listCashiers, verifyCashierPin, openShift } from "@/lib/cashier.functions";
import { parseNumber, formatRupiah } from "@/lib/format";

type Cashier = { id: string; name: string; active: boolean };

export type ActiveShift = {
  shift_id: string;
  cashier_id: string;
  cashier_name: string;
  opening_cash: number;
  opened_at: string;
};

type Props = {
  open: boolean;
  onUnlocked: (shift: ActiveShift) => void;
  /** When true, closing/X is disabled — must select a cashier. */
  forceLocked?: boolean;
  onClose?: () => void;
  /** Optional exit action shown when the dialog is forced-locked (e.g. back to main menu). */
  onExit?: () => void;
};

export function CashierLock({ open, onUnlocked, forceLocked = true, onClose, onExit }: Props) {
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [openingCash, setOpeningCash] = useState("");
  const [needShift, setNeedShift] = useState<null | { cashier_id: string; cashier_name: string }>(null);
  const [creatingShift, setCreatingShift] = useState(false);

  const listFn = useServerFn(listCashiers);
  const verifyFn = useServerFn(verifyCashierPin);
  const openShiftFn = useServerFn(openShift);

  const reload = async () => {
    setLoading(true);
    try {
      const data = (await listFn()) as Cashier[];
      setCashiers((data || []).filter((c) => c.active));
    } catch (e: any) {
      toast.error("Gagal memuat kasir: " + e.message);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (open) {
      reload();
      setPickedId(null);
      setPin("");
      setNeedShift(null);
      setOpeningCash("");
    }
  }, [open]);

  const submitPin = async () => {
    if (!pickedId) { toast.error("Pilih kasir dulu"); return; }
    if (!/^\d{4,6}$/.test(pin)) { toast.error("PIN harus 4-6 angka"); return; }
    setVerifying(true);
    try {
      const res = await verifyFn({ data: { cashier_id: pickedId, pin } }) as any;
      if (res.openShift) {
        // Resume existing open shift
        onUnlocked({
          shift_id: res.openShift.id,
          cashier_id: res.cashier.id,
          cashier_name: res.cashier.name,
          opening_cash: Number(res.openShift.opening_cash) || 0,
          opened_at: res.openShift.opened_at,
        });
        toast.success(`Halo ${res.cashier.name}, shift dilanjutkan`);
      } else {
        setNeedShift({ cashier_id: res.cashier.id, cashier_name: res.cashier.name });
      }
    } catch (e: any) {
      toast.error(e.message || "Gagal verifikasi");
      setPin("");
    } finally { setVerifying(false); }
  };

  const submitOpenShift = async () => {
    if (!needShift) return;
    setCreatingShift(true);
    try {
      const cash = parseNumber(openingCash) || 0;
      const res = await openShiftFn({ data: { cashier_id: needShift.cashier_id, opening_cash: cash } }) as any;
      onUnlocked({
        shift_id: res.shift_id,
        cashier_id: needShift.cashier_id,
        cashier_name: needShift.cashier_name,
        opening_cash: cash,
        opened_at: new Date().toISOString(),
      });
      toast.success(`Shift dibuka untuk ${needShift.cashier_name}`);
    } catch (e: any) {
      toast.error(e.message || "Gagal buka shift");
    } finally { setCreatingShift(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { if (forceLocked) onExit?.(); else onClose?.(); } }}>
      <DialogContent
        className="max-w-md"
        onInteractOutside={(e) => { if (forceLocked) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (forceLocked) e.preventDefault(); }}
      >
        {!needShift ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <LockKeyhole className="h-5 w-5" /> Login Kasir
              </DialogTitle>
              <DialogDescription>
                Pilih nama kasir lalu masukkan PIN. Transaksi akan tercatat atas nama kasir tsb.
              </DialogDescription>
            </DialogHeader>
            {loading ? (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Memuat daftar kasir...
              </div>
            ) : cashiers.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                Belum ada akun kasir. Pemilik bisa menambahkan di menu <strong>Karyawan</strong>.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {cashiers.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setPickedId(c.id); setPin(""); }}
                      className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-center transition ${
                        pickedId === c.id ? "border-primary bg-primary/10" : "hover:border-primary/50"
                      }`}
                    >
                      <UserCircle2 className="h-7 w-7 text-muted-foreground" />
                      <span className="line-clamp-2 text-xs font-medium">{c.name}</span>
                    </button>
                  ))}
                </div>
                {pickedId && (
                  <div className="space-y-2">
                    <Label className="text-xs">PIN</Label>
                    <Input
                      type="password"
                      inputMode="numeric"
                      autoFocus
                      maxLength={6}
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      onKeyDown={(e) => { if (e.key === "Enter") submitPin(); }}
                      placeholder="••••"
                      className="text-center text-2xl tracking-[0.5em]"
                    />
                  </div>
                )}
              </>
            )}
            <DialogFooter className="gap-2">
              {!forceLocked && (
                <Button variant="ghost" onClick={() => onClose?.()}>Batal</Button>
              )}
              {forceLocked && onExit && (
                <Button variant="outline" onClick={onExit}>
                  <LogOut className="mr-2 h-4 w-4" /> Keluar
                </Button>
              )}
              <Button disabled={!pickedId || verifying} onClick={submitPin}>
                {verifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Masuk
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Buka Shift — {needShift.cashier_name}</DialogTitle>
              <DialogDescription>
                Masukkan saldo awal kas (uang receh di laci) untuk memulai shift. Bisa 0 jika tidak ada.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label className="text-xs">Saldo Awal Kas</Label>
              <Input
                autoFocus
                inputMode="numeric"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitOpenShift(); }}
                placeholder="0"
              />
              {openingCash && (
                <div className="text-xs text-muted-foreground">{formatRupiah(parseNumber(openingCash) || 0)}</div>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setNeedShift(null)} disabled={creatingShift}>Kembali</Button>
              <Button onClick={submitOpenShift} disabled={creatingShift}>
                {creatingShift && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Mulai Shift
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
