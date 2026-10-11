import { useState } from "react";
import { Banknote, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CASH_DENOMINATIONS, cashCountTotal } from "@/lib/cash-count";
import { formatRupiah } from "@/lib/format";

export function ClosingCashCount({ onApply }: { onApply: (total: number) => void }) {
  const [counts, setCounts] = useState<Record<number, string>>({});
  const total = cashCountTotal(counts);
  return <section className="space-y-3 border-t pt-3">
    <div className="flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Banknote className="h-4 w-4" />Hitung pecahan uang</h3>
      <Button type="button" variant="ghost" size="icon" aria-label="Kosongkan hitungan" title="Kosongkan hitungan" onClick={() => setCounts({})}><RotateCcw className="h-4 w-4" /></Button>
    </div>
    <div className="grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2">
      {CASH_DENOMINATIONS.map(value => <div key={value} className="grid grid-cols-[1fr_80px] items-center gap-2">
        <label htmlFor={`cash-count-${value}`} className="text-sm tabular-nums">{formatRupiah(value)}</label>
        <Input id={`cash-count-${value}`} aria-label={`Jumlah pecahan ${value}`} inputMode="numeric" value={counts[value] ?? ""} placeholder="0" maxLength={6} className="h-9 text-right tabular-nums" onChange={event => setCounts(current => ({ ...current, [value]: event.target.value.replace(/\D/g, "").slice(0, 6) }))} />
      </div>)}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
      <div><p className="text-xs text-muted-foreground">Total uang terhitung</p><p className="text-lg font-semibold tabular-nums">{formatRupiah(total)}</p></div>
      <Button type="button" onClick={() => onApply(total)}>Gunakan sebagai fisik kas</Button>
    </div>
  </section>;
}