import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ChevronsUpDown, Plus } from "lucide-react";
import { toast } from "sonner";

type SupplierRow = { id: string; name: string; phone: string | null; contact_person: string | null };

export function SupplierCombobox({
  value,
  onChange,
  placeholder = "Nama supplier",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [rows, setRows] = useState<SupplierRow[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await (supabase as any).from("suppliers").select("id, name, phone, contact_person").order("name");
    setRows((data || []) as SupplierRow[]);
  };
  useEffect(() => { load(); }, []);

  const known = rows.some((r) => r.name.toLowerCase() === value.trim().toLowerCase());

  const saveNew = async () => {
    const name = value.trim();
    if (!name) return;
    setSaving(true);
    const { data: tid } = await supabase.rpc("current_tenant_id");
    const { error } = await (supabase as any).from("suppliers").insert({ name, tenant_id: tid });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Supplier "${name}" disimpan`);
    load();
  };

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="flex-1" />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="icon" className="shrink-0" title="Pilih supplier tersimpan">
              <ChevronsUpDown className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(22rem,90vw)] p-0" align="end">
            <Command>
              <CommandInput placeholder="Cari supplier..." />
              <CommandList>
                <CommandEmpty>Belum ada supplier tersimpan.</CommandEmpty>
                <CommandGroup>
                  {rows.map((r) => (
                    <CommandItem key={r.id} value={r.name} onSelect={() => { onChange(r.name); setOpen(false); }}>
                      <span className="truncate">{r.name}</span>
                      {(r.phone || r.contact_person) && (
                        <span className="ml-auto truncate text-xs text-muted-foreground">{r.contact_person || r.phone}</span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      {value.trim() && !known && (
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={saveNew} disabled={saving}>
          <Plus className="mr-1 h-3 w-3" /> Simpan "{value.trim()}" ke daftar supplier
        </Button>
      )}
    </div>
  );
}
