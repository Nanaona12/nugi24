import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Printer, Bluetooth, Usb, TestTube2, Smartphone } from "lucide-react";
import {
  defaultPrinterSettings,
  loadPrinterSettings,
  savePrinterSettings,
  supportsWebBluetooth,
  supportsWebUsb,
  isAndroid,
  type PrinterSettings,
} from "@/lib/printer-settings";
import { pairBluetooth, pairUsb, testPrint } from "@/lib/printer";

export function PrinterSettingsCard() {
  const [s, setS] = useState<PrinterSettings>(defaultPrinterSettings);
  const [busy, setBusy] = useState(false);
  const hasBt = supportsWebBluetooth();
  const hasUsb = supportsWebUsb();
  const onAndroid = isAndroid();

  useEffect(() => { setS(loadPrinterSettings()); }, []);

  const update = (patch: Partial<PrinterSettings>) => {
    const n = { ...s, ...patch };
    setS(n);
    savePrinterSettings(n);
  };

  const doPairBt = async () => {
    setBusy(true);
    try {
      const info = await pairBluetooth();
      update({ bt: { name: info.name }, method: "bluetooth" });
      toast.success(`Terhubung: ${info.name}`);
    } catch (e: any) { toast.error(e?.message || "Gagal pasangkan Bluetooth"); }
    finally { setBusy(false); }
  };

  const doPairUsb = async () => {
    setBusy(true);
    try {
      const info = await pairUsb();
      update({ usb: { name: info.name, vendorId: info.vendorId, productId: info.productId }, method: "usb" });
      toast.success(`Terhubung: ${info.name}`);
    } catch (e: any) { toast.error(e?.message || "Gagal pasangkan USB"); }
    finally { setBusy(false); }
  };

  const doTest = async () => {
    setBusy(true);
    try {
      await testPrint(s);
      toast.success("Uji cetak dikirim");
    } catch (e: any) { toast.error(e?.message || "Gagal uji cetak"); }
    finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Printer className="h-5 w-5" />Printer Struk</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Cetak struk fisik dari kasir atau riwayat. Semua pengaturan tersimpan di perangkat ini. Bluetooth & USB hanya berfungsi di Chrome/Edge (Android/Desktop) via HTTPS.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Metode Print</Label>
            <Select value={s.method} onValueChange={(v) => update({ method: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="browser">Browser Print (universal)</SelectItem>
                <SelectItem value="bluetooth" disabled={!hasBt}>Bluetooth Thermal {hasBt ? "" : "(tidak didukung browser ini)"}</SelectItem>
                <SelectItem value="usb" disabled={!hasUsb}>USB Thermal {hasUsb ? "" : "(tidak didukung browser ini)"}</SelectItem>
                <SelectItem value="ask">Tanya setiap kali</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Ukuran Kertas</Label>
            <Select value={String(s.paper)} onValueChange={(v) => update({ paper: Number(v) as 58 | 80 })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="58">58mm (mini/mobile)</SelectItem>
                <SelectItem value="80">80mm (kasir meja)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label>Cetak otomatis setelah transaksi</Label>
            <p className="text-xs text-muted-foreground">Struk langsung dikirim ke printer saat pembayaran sukses.</p>
          </div>
          <Switch checked={s.autoPrint} onCheckedChange={(v) => update({ autoPrint: v })} />
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-md border p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium"><Bluetooth className="h-4 w-4" />Bluetooth</div>
            <p className="text-xs text-muted-foreground">
              {s.bt?.name ? `Terpasang: ${s.bt.name}` : "Belum dipasangkan"}
            </p>
            <Button size="sm" variant="outline" onClick={doPairBt} disabled={busy || !hasBt}>
              Pasangkan Printer Bluetooth
            </Button>
          </div>
          <div className="rounded-md border p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium"><Usb className="h-4 w-4" />USB</div>
            <p className="text-xs text-muted-foreground">
              {s.usb?.name ? `Terpasang: ${s.usb.name}` : "Belum dipasangkan"}
            </p>
            <Button size="sm" variant="outline" onClick={doPairUsb} disabled={busy || !hasUsb}>
              Pasangkan Printer USB
            </Button>
          </div>
        </div>

        <div>
          <Button onClick={doTest} disabled={busy}>
            <TestTube2 className="mr-2 h-4 w-4" /> Uji Cetak
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
