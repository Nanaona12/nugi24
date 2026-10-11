import { useEffect, useRef, useState } from "react";
import { Banknote, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cashCountTotal } from "@/lib/cash-count";
import { formatRupiah } from "@/lib/format";

export function ClosingCashCount({ onApply }: { onApply: (total: number) => void }) {
  const [entries, setEntries] = useState([{ id: 0, amount: "", note: "" }]);
  const [nextId, setNextId] = useState(1);
  const pendingFocus = useRef<number | null>(null);
  const amountInputs = useRef(new Map<number, HTMLInputElement>());
  const addEntry = () => {
    pendingFocus.current = nextId;
    setEntries(current => [...current, { id: nextId, amount: "", note: "" }]);
    setNextId(value => value + 1);
  };
  useEffect(() => {
    if (pendingFocus.current === null) return;
    amountInputs.current.get(pendingFocus.current)?.focus();
    pendingFocus.current = null;
  }, [entries]);
  const total = cashCountTotal(entries.map(entry => entry.amount));
  const reset = () => { setEntries([{ id: 0, amount: "", note: "" }]); setNextId(1); };
  return <section className="space-y-3 border-t pt-3">
    <div className="flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Banknote className="h-4 w-4" />Jumlahkan uang</h3>
      <Button type="button" variant="ghost" size="icon" aria-label="Kosongkan hitungan" title="Kosongkan hitungan" onClick={reset}><RotateCcw className="h-4 w-4" /></Button>
    </div>
    <div className="space-y-3">
      {entries.map((entry, index) => <div key={entry.id} className="grid grid-cols-[minmax(0,1fr)_36px] items-start gap-2">
        <div className="grid min-w-0 gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor={`cash-amount-${entry.id}`} className="text-xs text-muted-foreground">Nominal {index + 1} (Rp)</label>
            <Input ref={node => { if (node) amountInputs.current.set(entry.id, node); else amountInputs.current.delete(entry.id); }} id={`cash-amount-${entry.id}`} aria-label={`Nominal uang ${index + 1}`} inputMode="numeric" value={entry.amount ? Number(entry.amount).toLocaleString("id-ID") : ""} placeholder="0" className="h-9 tabular-nums" onKeyDown={event => {
              if (event.key !== "+" || event.ctrlKey || event.altKey || event.metaKey || event.nativeEvent.isComposing) return;
              event.preventDefault();
              if (!event.repeat) addEntry();
            }} onChange={event => {
              const amount = event.target.value.replace(/\D/g, "").slice(0, 12);
              setEntries(current => current.map(item => item.id === entry.id ? { ...item, amount } : item));
            }} />
          </div>
          <div className="space-y-1">
            <label htmlFor={`cash-note-${entry.id}`} className="text-xs text-muted-foreground">Catatan (opsional)</label>
            <Input id={`cash-note-${entry.id}`} aria-label={`Catatan uang ${index + 1}`} value={entry.note} placeholder="Uang laci / uang tambahan" maxLength={200} className="h-9" onChange={event => setEntries(current => current.map(item => item.id === entry.id ? { ...item, note: event.target.value } : item))} />
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon" className="mt-5 h-9 w-9" aria-label={`Hapus nominal ${index + 1}`} title="Hapus nominal" onClick={() => entries.length === 1 ? reset() : setEntries(current => current.filter(item => item.id !== entry.id))}><Trash2 className="h-4 w-4" /></Button>
      </div>)}
    </div>
    <Button type="button" variant="outline" size="sm" title="Tambah nominal (+ saat mengisi nominal)" onClick={addEntry}><Plus className="h-4 w-4" />Tambah nominal</Button>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
      <div><p className="text-xs text-muted-foreground">Total uang terhitung</p><p className="text-lg font-semibold tabular-nums">{formatRupiah(total)}</p></div>
      <Button type="button" onClick={() => onApply(total)}>Gunakan sebagai fisik kas</Button>
    </div>
  </section>;
}