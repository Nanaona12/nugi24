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
import { AlertTriangle, Truck, Search, CheckCircle2, Trash2, CalendarClock } from "lucide-react";
import { debtDueInfo, type SupplierDebt, type SupplierDebtPayment } from "@/lib/supplier-debt";

export const Route = createFileRoute("/_authenticated/hutang-supplier")({
  component: SupplierDebtPage,
  head: () => ({
    meta: [
      { title: "Hutang Supplier — Pembelian Tempo" },
      {
        name: "description",
        content:
          "Kelola faktur pembelian tempo: pantau jatuh tempo, catat pembayaran ke supplier, dan sinkron otomatis ke pembukuan toko.",
      },
      { property: "og:title", content: "Hutang Supplier — Pembelian Tempo" },
      {
        property: "og:description",
        content: "Pantau faktur supplier jatuh tempo dan catat pembayarannya.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6 text-sm">Tidak ditemukan</div>,
});

function SupplierDebtPage() {
  const [rows, setRows] = useState<SupplierDebt[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"open" | "paid" | "all">("open");
  const [payDebt, setPayDebt] = useState<SupplierDebt | null>(null);
  const [detail, setDetail] = useState<SupplierDebt | null>(null);
  const [payments, setPayments] = useState<SupplierDebtPayment[]>([]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("supplier_debts")
      .select("*")
      .order("due_date", { ascending: true, nullsFirst: false });
    if (error) toast.error("Gagal memuat: " + error.message);
    else setRows((data || []) as SupplierDebt[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("supplier-debts-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "supplier_debts" }, () => load())
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "supplier_debt_payments" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const loadPayments = async (debtId: string) => {
    const { data } = await (supabase as any)
      .from("supplier_debt_payments")
      .select("*")
      .eq("debt_id", debtId)
      .order("created_at", { ascending: true });
    setPayments((data || []) as SupplierDebtPayment[]);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => (tab === "all" ? true : tab === "paid" ? r.status === "paid" : r.status !== "paid"))
      .filter(
        (r) =>
          !q ||
          r.supplier.toLowerCase().includes(q) ||
          (r.invoice_no || "").toLowerCase().includes(q) ||
          (r.note || "").toLowerCase().includes(q),
      );
  }, [rows, query, tab]);

  const totals = useMemo(() => {
    let openCount = 0,
      openAmount = 0,
      dueSoon = 0;
    for (const r of rows) {
      if (r.status === "paid") continue;
      openCount++;
      openAmount += Number(r.total) - Number(r.paid_amount);
      const info = debtDueInfo(r.due_date, r.status);
      if (info.days != null && info.days <= 3) dueSoon++;
    }
    return { openCount, openAmount, dueSoon };
  }, [rows]);

  return (
    <div className="space-y-4">
      <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
        <Truck className="h-6 w-6 text-amber-600" /> Hutang Supplier
        {totals.openCount > 0 && (
          <Badge variant="destructive">{totals.openCount} faktur belum lunas</Badge>
        )}
      </h1>

      <details className="rounded-lg border bg-muted/40 p-4 text-sm">
        <summary className="cursor-pointer font-semibold">
          Cara pakai Pembelian Tempo (klik untuk buka)
        </summary>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-muted-foreground">
          <li>
            Buka menu <b>PO</b> lalu buat pesanan ke supplier seperti biasa.
          </li>
          <li>
            Di dialog PO, bagian <b>Termin</b> pilih <b>Tempo</b>, isi{" "}
            <b>Tanggal Jatuh Tempo</b> (bisa pakai tombol cepat 7/14/30 hari) dan{" "}
            <b>No. Faktur Supplier</b> bila ada. Pilih <b>Tunai</b> kalau bayar langsung saat barang datang.
          </li>
          <li>
            Saat barang datang, buka PO tersebut lalu klik <b>Terima Barang</b> dan lengkapi jumlah yang
            diterima. Setelah semua item diterima, stok bertambah otomatis.
          </li>
          <li>
            PO <b>Tempo</b> akan muncul di halaman ini sebagai faktur belum lunas — kas di Pembukuan{" "}
            <b>tidak</b> berkurang dulu. PO <b>Tunai</b> langsung tercatat sebagai uang keluar di Pembukuan.
          </li>
          <li>
            Kalau sudah membayar supplier (boleh dicicil), klik tombol <b>Bayar</b> pada faktur, isi nominal
            dan metode (tunai/transfer). Setiap pembayaran otomatis jadi entri uang keluar di Pembukuan dan
            status faktur berubah jadi Sebagian / Lunas.
          </li>
          <li>
            Pantau tanda <b>Jatuh Tempo</b> / <b>Terlambat</b> di daftar, dan lihat ringkasan{" "}
            <b>Hutang Supplier Belum Lunas</b> di halaman Pembukuan agar tahu kas mana yang sebenarnya masih
            harus dibayarkan.
          </li>
        </ol>
      </details>



      {totals.openCount > 0 && (
        <Card className="flex items-start gap-3 border-amber-400 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="flex-1 text-sm">
            <div className="font-semibold">
              Total hutang ke supplier: {formatRupiah(totals.openAmount)}
            </div>
            <div className="text-xs opacity-80">
              {totals.dueSoon > 0
                ? `${totals.dueSoon} faktur jatuh tempo dalam 3 hari atau sudah lewat.`
                : "Uang keluar baru tercatat di pembukuan saat Anda membayar faktur."}
            </div>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {(["open", "paid", "all"] as const).map((k) => (
          <Button key={k} size="sm" variant={tab === k ? "default" : "outline"} onClick={() => setTab(k)}>
            {k === "open" ? "Belum Lunas" : k === "paid" ? "Lunas" : "Semua"}
          </Button>
        ))}
        <div className="relative ml-auto min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cari supplier / no. faktur..."
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
                <th className="p-3">Supplier</th>
                <th className="p-3">Faktur</th>
                <th className="p-3">Jatuh Tempo</th>
                <th className="p-3 text-right">Total</th>
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
                    <Truck className="mx-auto mb-3 h-12 w-12 opacity-30" />
                    {tab === "open" ? "Tidak ada hutang supplier 🎉" : "Belum ada data"}
                  </td>
                </tr>
              ) : (
                filtered.map((d) => {
                  const sisa = Number(d.total) - Number(d.paid_amount);
                  const info = debtDueInfo(d.due_date, d.status);
                  return (
                    <tr key={d.id} className="border-t hover:bg-muted/40">
                      <td className="p-3">
                        <div className="font-medium">{d.supplier}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(d.created_at).toLocaleDateString("id-ID")}
                        </div>
                      </td>
                      <td className="p-3 text-xs">{d.invoice_no || "-"}</td>
                      <td className="p-3 text-xs">
                        {d.due_date ? (
                          <div>
                            <div>{new Date(d.due_date + "T00:00:00").toLocaleDateString("id-ID")}</div>
                            {info.label && (
                              <span
                                className={
                                  info.tone === "overdue" || info.tone === "today"
                                    ? "text-destructive font-semibold"
                                    : info.tone === "soon"
                                      ? "text-amber-600 font-medium"
                                      : "text-muted-foreground"
                                }
                              >
                                {info.label}
                              </span>
                            )}
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="p-3 text-right">{formatRupiah(d.total)}</td>
                      <td className="p-3 text-right text-success">{formatRupiah(d.paid_amount)}</td>
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
                        ) : d.status === "partial" ? (
                          <Badge variant="secondary">SEBAGIAN</Badge>
                        ) : (
                          <Badge variant="destructive">BELUM LUNAS</Badge>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              setDetail(d);
                              await loadPayments(d.id);
                            }}
                          >
                            Detail
                          </Button>
                          {d.status !== "paid" && (
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
          const { error } = await (supabase as any).from("supplier_debt_payments").delete().eq("id", id);
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
  debt: SupplierDebt | null;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "transfer" | "qris" | "other">("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (debt) {
      setAmount(String(Number(debt.total) - Number(debt.paid_amount)));
      setMethod("cash");
      setNote("");
    }
  }, [debt]);

  if (!debt) return null;
  const sisa = Number(debt.total) - Number(debt.paid_amount);

  const submit = async () => {
    const amt = Number(String(amount).replace(/[^\d]/g, ""));
    if (amt <= 0) return toast.error("Nominal harus > 0");
    if (amt > sisa) return toast.error(`Nominal melebihi sisa hutang (${formatRupiah(sisa)})`);
    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("supplier_debt_payments").insert({
      tenant_id: debt.tenant_id,
      debt_id: debt.id,
      amount: amt,
      method,
      note: note.trim() || null,
      created_by: userRes.user?.id ?? null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(amt >= sisa ? "🎉 Faktur LUNAS!" : `Pembayaran ${formatRupiah(amt)} tercatat`);
    onPaid();
  };

  return (
    <Dialog open={!!debt} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bayar Supplier — {debt.supplier}</DialogTitle>
          <DialogDescription>
            Sisa: <b className="text-destructive">{formatRupiah(sisa)}</b> dari total{" "}
            {formatRupiah(debt.total)}. Pembayaran otomatis tercatat sebagai uang keluar di Pembukuan.
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
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAmount(String(Math.round(sisa / 2)))}
              >
                Setengah
              </Button>
            </div>
          </div>
          <div>
            <Label>Metode</Label>
            <div className="mt-1 grid grid-cols-4 gap-1">
              {(["cash", "transfer", "qris", "other"] as const).map((m) => (
                <Button
                  key={m}
                  size="sm"
                  variant={method === m ? "default" : "outline"}
                  onClick={() => setMethod(m)}
                >
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
  debt: SupplierDebt | null;
  payments: SupplierDebtPayment[];
  onClose: () => void;
  onDeletePayment: (id: string) => void;
}) {
  if (!debt) return null;
  const sisa = Number(debt.total) - Number(debt.paid_amount);
  return (
    <Dialog open={!!debt} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Faktur — {debt.supplier}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-lg border p-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tanggal Masuk</span>
              <span>{new Date(debt.created_at).toLocaleString("id-ID")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">No. Faktur</span>
              <span>{debt.invoice_no || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="flex items-center gap-1 text-muted-foreground">
                <CalendarClock className="h-3.5 w-3.5" /> Jatuh Tempo
              </span>
              <span>
                {debt.due_date
                  ? new Date(debt.due_date + "T00:00:00").toLocaleDateString("id-ID")
                  : "-"}
              </span>
            </div>
            <div className="mt-2 border-t pt-2">
              <div className="flex justify-between">
                <span>Total Faktur</span>
                <span className="font-semibold">{formatRupiah(debt.total)}</span>
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
