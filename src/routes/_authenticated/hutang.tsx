import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatRupiah } from "@/lib/format";
import { AlertTriangle, Wallet, Search, CheckCircle2, Trash2, User, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/hutang")({
  component: HutangPage,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6 text-sm">Tidak ditemukan</div>,
});

type Debt = {
  id: string;
  tenant_id: string;
  transaction_id: string | null;
  customer_id: string | null;
  debtor_name: string;
  debtor_phone: string | null;
  debtor_type: "customer" | "employee";
  original_amount: number;
  paid_amount: number;
  status: "open" | "paid";
  note: string | null;
  created_at: string;
};

type Payment = {
  id: string;
  debt_id: string;
  amount: number;
  method: string;
  note: string | null;
  created_at: string;
};

function HutangPage() {
  const [rows, setRows] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"open" | "paid" | "all">("open");
  const [payDebt, setPayDebt] = useState<Debt | null>(null);
  const [detail, setDetail] = useState<Debt | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("debts")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error("Gagal memuat: " + error.message);
    else setRows((data || []) as any);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("debts-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "debts" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "debt_payments" }, () => {
        load();
        if (detail) loadPayments(detail.id);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadPayments = async (debtId: string) => {
    const { data } = await supabase
      .from("debt_payments")
      .select("*")
      .eq("debt_id", debtId)
      .order("created_at", { ascending: true });
    setPayments((data || []) as any);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => (tab === "all" ? true : r.status === tab))
      .filter(
        (r) =>
          !q ||
          r.debtor_name.toLowerCase().includes(q) ||
          (r.debtor_phone || "").toLowerCase().includes(q) ||
          (r.note || "").toLowerCase().includes(q),
      );
  }, [rows, query, tab]);

  const totals = useMemo(() => {
    let openCount = 0,
      openAmount = 0;
    for (const r of rows) {
      if (r.status === "open") {
        openCount++;
        openAmount += Number(r.original_amount) - Number(r.paid_amount);
      }
    }
    return { openCount, openAmount };
  }, [rows]);

  const openDetail = async (d: Debt) => {
    setDetail(d);
    await loadPayments(d.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Wallet className="h-6 w-6 text-amber-600" /> Hutang / Kasbon
          {totals.openCount > 0 && (
            <Badge variant="destructive" className="ml-1">
              {totals.openCount} belum lunas
            </Badge>
          )}
        </h1>
      </div>

      {totals.openCount > 0 && (
        <Card className="flex items-start gap-3 border-amber-400 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="flex-1">
            <div className="text-sm font-semibold">
              Ada {totals.openCount} hutang belum dilunasi — total {formatRupiah(totals.openAmount)}
            </div>
            <div className="text-xs opacity-80">
              Tagih pelanggan/karyawan atau catat pembayaran di sini.
            </div>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {(["open", "paid", "all"] as const).map((k) => (
          <Button
            key={k}
            size="sm"
            variant={tab === k ? "default" : "outline"}
            onClick={() => setTab(k)}
          >
            {k === "open" ? "Belum Lunas" : k === "paid" ? "Lunas" : "Semua"}
          </Button>
        ))}
        <div className="relative ml-auto min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cari nama / no. HP / catatan..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Tanggal</th>
                <th className="p-3">Pengutang</th>
                <th className="p-3">Tipe</th>
                <th className="p-3 text-right">Nominal</th>
                <th className="p-3 text-right">Dibayar</th>
                <th className="p-3 text-right">Sisa</th>
                <th className="p-3">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    Memuat...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-muted-foreground">
                    <Wallet className="mx-auto mb-3 h-12 w-12 opacity-30" />
                    {tab === "open" ? "Tidak ada hutang aktif 🎉" : "Belum ada data"}
                  </td>
                </tr>
              ) : (
                filtered.map((d) => {
                  const sisa = Number(d.original_amount) - Number(d.paid_amount);
                  return (
                    <tr key={d.id} className="border-t hover:bg-muted/40">
                      <td className="p-3 text-xs">
                        {new Date(d.created_at).toLocaleDateString("id-ID", {
                          day: "2-digit",
                          month: "short",
                          year: "2-digit",
                        })}
                      </td>
                      <td className="p-3">
                        <div className="font-medium">{d.debtor_name}</div>
                        {d.debtor_phone && (
                          <div className="text-xs text-muted-foreground">{d.debtor_phone}</div>
                        )}
                        {d.note && (
                          <div className="text-xs italic text-muted-foreground">{d.note}</div>
                        )}
                      </td>
                      <td className="p-3">
                        {d.debtor_type === "employee" ? (
                          <Badge variant="outline" className="gap-1">
                            <Users className="h-3 w-3" /> Karyawan
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <User className="h-3 w-3" /> Pelanggan
                          </Badge>
                        )}
                      </td>
                      <td className="p-3 text-right">{formatRupiah(d.original_amount)}</td>
                      <td className="p-3 text-right text-success">
                        {formatRupiah(d.paid_amount)}
                      </td>
                      <td className="p-3 text-right font-semibold">
                        {sisa > 0 ? (
                          <span className="text-destructive">{formatRupiah(sisa)}</span>
                        ) : (
                          <span className="text-success">Rp 0</span>
                        )}
                      </td>
                      <td className="p-3">
                        {d.status === "paid" ? (
                          <Badge className="gap-1 bg-success text-white hover:bg-success/90">
                            <CheckCircle2 className="h-3 w-3" /> LUNAS
                          </Badge>
                        ) : (
                          <Badge variant="destructive">BELUM LUNAS</Badge>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openDetail(d)}>
                            Detail
                          </Button>
                          {d.status === "open" && (
                            <Button size="sm" onClick={() => setPayDebt(d)}>
                              Bayar
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <PayDialog
        debt={payDebt}
        onClose={() => setPayDebt(null)}
        onPaid={() => {
          setPayDebt(null);
          load();
        }}
      />

      <DetailDialog
        debt={detail}
        payments={payments}
        onClose={() => setDetail(null)}
        onDeletePayment={async (id) => {
          if (!confirm("Hapus pembayaran ini?")) return;
          const { error } = await supabase.from("debt_payments").delete().eq("id", id);
          if (error) return toast.error(error.message);
          toast.success("Pembayaran dihapus");
          if (detail) loadPayments(detail.id);
          load();
        }}
      />
    </div>
  );
}

function PayDialog({
  debt,
  onClose,
  onPaid,
}: {
  debt: Debt | null;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "qris" | "transfer" | "other">("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (debt) {
      const sisa = Number(debt.original_amount) - Number(debt.paid_amount);
      setAmount(String(sisa));
      setMethod("cash");
      setNote("");
    }
  }, [debt]);

  if (!debt) return null;
  const sisa = Number(debt.original_amount) - Number(debt.paid_amount);

  const submit = async () => {
    const amt = Number(String(amount).replace(/[^\d]/g, ""));
    if (amt <= 0) return toast.error("Nominal harus > 0");
    if (amt > sisa) return toast.error(`Nominal melebihi sisa hutang (${formatRupiah(sisa)})`);
    setSaving(true);
    // Get open shift if any
    let shift_id: string | null = null;
    try {
      const raw = localStorage.getItem("dp.active_shift");
      if (raw) shift_id = JSON.parse(raw)?.shift_id ?? null;
    } catch {}
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await supabase.from("debt_payments").insert({
      tenant_id: debt.tenant_id,
      debt_id: debt.id,
      amount: amt,
      method,
      note: note.trim() || null,
      shift_id,
      created_by: userRes.user?.id ?? null,
    } as any);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(amt >= sisa ? "🎉 Hutang LUNAS!" : `Pembayaran ${formatRupiah(amt)} tercatat`);
    onPaid();
  };

  return (
    <Dialog open={!!debt} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bayar Hutang — {debt.debtor_name}</DialogTitle>
          <DialogDescription>
            Sisa hutang: <b className="text-destructive">{formatRupiah(sisa)}</b> dari total{" "}
            {formatRupiah(debt.original_amount)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nominal Dibayar</Label>
            <Input
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
              className="h-12 text-2xl"
            />
            <div className="mt-2 flex flex-wrap gap-1">
              <Button size="sm" variant="outline" onClick={() => setAmount(String(sisa))}>
                Lunas ({formatRupiah(sisa)})
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAmount(String(Math.round(sisa / 2)))}>
                Setengah
              </Button>
            </div>
          </div>
          <div>
            <Label>Metode</Label>
            <div className="mt-1 grid grid-cols-4 gap-1">
              {(["cash", "qris", "transfer", "other"] as const).map((m) => (
                <Button
                  key={m}
                  size="sm"
                  variant={method === m ? "default" : "outline"}
                  onClick={() => setMethod(m)}
                >
                  {m === "cash" ? "💵" : m === "qris" ? "📱" : m === "transfer" ? "🏦" : "•"}{" "}
                  {m.toUpperCase()}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <Label>Catatan (opsional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. cicilan 1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Menyimpan..." : "Simpan Pembayaran"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailDialog({
  debt,
  payments,
  onClose,
  onDeletePayment,
}: {
  debt: Debt | null;
  payments: Payment[];
  onClose: () => void;
  onDeletePayment: (id: string) => void;
}) {
  if (!debt) return null;
  const sisa = Number(debt.original_amount) - Number(debt.paid_amount);
  return (
    <Dialog open={!!debt} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Detail Hutang — {debt.debtor_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-lg border p-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tanggal</span>
              <span>{new Date(debt.created_at).toLocaleString("id-ID")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tipe</span>
              <span>{debt.debtor_type === "employee" ? "Karyawan" : "Pelanggan"}</span>
            </div>
            {debt.debtor_phone && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">No. HP</span>
                <span>{debt.debtor_phone}</span>
              </div>
            )}
            {debt.note && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Catatan</span>
                <span>{debt.note}</span>
              </div>
            )}
            <div className="mt-2 border-t pt-2">
              <div className="flex justify-between">
                <span>Total Hutang</span>
                <span className="font-semibold">{formatRupiah(debt.original_amount)}</span>
              </div>
              <div className="flex justify-between text-success">
                <span>Sudah Dibayar</span>
                <span className="font-semibold">{formatRupiah(debt.paid_amount)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold">
                <span>Sisa</span>
                <span className={sisa > 0 ? "text-destructive" : "text-success"}>
                  {formatRupiah(sisa)}
                </span>
              </div>
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
              Riwayat Pembayaran
            </div>
            {payments.length === 0 ? (
              <div className="rounded border p-3 text-center text-xs text-muted-foreground">
                Belum ada pembayaran
              </div>
            ) : (
              <div className="space-y-1">
                {payments.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded border p-2 text-xs"
                  >
                    <div>
                      <div className="font-semibold">{formatRupiah(p.amount)}</div>
                      <div className="text-muted-foreground">
                        {new Date(p.created_at).toLocaleString("id-ID")} • {p.method.toUpperCase()}
                        {p.note ? ` • ${p.note}` : ""}
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onDeletePayment(p.id)}
                      className="h-7 w-7 text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
