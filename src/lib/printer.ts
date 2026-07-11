import type { ReceiptData } from "./receipt-image";
import { buildEscposReceipt, buildReceiptText } from "./escpos";
import type { PaperWidth, PrinterSettings } from "./printer-settings";

const BT_SERVICE = 0x18f0; // 000018f0-0000-1000-8000-00805f9b34fb
const BT_CHAR = 0x2af1;

function isMobile(): boolean {
  return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** Print via browser dialog with @page sized for thermal paper. */
export function printBrowser(r: ReceiptData, paper: PaperWidth): void {
  const widthMm = paper;
  const text = buildReceiptText(r, paper);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Struk</title>
<style>
  @page { size: ${widthMm}mm auto; margin: 3mm; }
  html,body{margin:0;padding:0;background:#fff;color:#000}
  pre{font-family:'Courier New',ui-monospace,monospace;font-size:${paper===58?"11px":"12px"};line-height:1.25;white-space:pre;margin:0}
</style></head><body><pre>${text.replace(/[&<>]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;"} as any)[c])}</pre>
<script>window.onload=()=>{setTimeout(()=>{window.print();setTimeout(()=>window.close(),400)},150)}<\/script>
</body></html>`;

  // On mobile, popup windows are often blocked or don't trigger print dialog.
  // Prefer iframe fallback which is more reliable across Android Chrome/WebView.
  const useIframe = isMobile() || !window.open;
  if (!useIframe) {
    const w = window.open("", "_blank", "width=380,height=640");
    if (w) {
      w.document.open();
      w.document.write(html);
      w.document.close();
      return;
    }
  }
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      throw new Error("Browser tidak bisa membuka dialog cetak. Coba metode RawBT (untuk printer POS Android) atau Bluetooth/USB.");
    }
    setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 3000);
  }, 300);
}

/** Print via RawBT app (Android). Requires user to install RawBT from Play Store.
 *  RawBT drives built-in / Bluetooth / USB thermal printers on Android POS devices. */
export function printRawBT(r: ReceiptData, paper: PaperWidth): void {
  const bytes = buildEscposReceipt(r, paper);
  // base64 encode
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  // RawBT intent — opens the RawBT app which sends the ESC/POS payload to the configured printer
  const url = `intent:base64,${b64}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;
  window.location.href = url;
}

// ------------------- Bluetooth -------------------
let btDeviceCache: any = null;
let btCharCache: any = null;

export async function pairBluetooth(): Promise<{ name: string }> {
  const nav: any = navigator;
  if (!nav.bluetooth) throw new Error("Browser tidak mendukung Web Bluetooth (pakai Chrome/Edge Android/desktop)");
  const device = await nav.bluetooth.requestDevice({
    filters: [{ services: [BT_SERVICE] }],
    optionalServices: [BT_SERVICE],
  }).catch(async () => {
    // Fallback: allow user to pick any
    return nav.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: [BT_SERVICE] });
  });
  btDeviceCache = device;
  return { name: device.name || "Bluetooth Printer" };
}

async function getBtChar(): Promise<any> {
  const nav: any = navigator;
  if (!nav.bluetooth) throw new Error("Browser tidak mendukung Web Bluetooth");
  if (btCharCache && btDeviceCache?.gatt?.connected) return btCharCache;
  if (!btDeviceCache) {
    // Re-pair (user gesture required)
    await pairBluetooth();
  }
  const server = await btDeviceCache.gatt.connect();
  const service = await server.getPrimaryService(BT_SERVICE);
  const characteristics = await service.getCharacteristics();
  // Prefer writable char (WriteWithoutResponse)
  const writable = characteristics.find((c: any) => c.properties?.write || c.properties?.writeWithoutResponse) || characteristics[0];
  btCharCache = writable;
  return writable;
}

async function sendBluetoothBytes(data: Uint8Array): Promise<void> {
  const ch = await getBtChar();
  const CHUNK = 180;
  for (let i = 0; i < data.length; i += CHUNK) {
    const slice = data.slice(i, i + CHUNK);
    if (ch.writeValueWithoutResponse) await ch.writeValueWithoutResponse(slice);
    else await ch.writeValue(slice);
    // small delay so slow printers keep up
    await new Promise((res) => setTimeout(res, 20));
  }
}

// ------------------- USB -------------------
let usbDeviceCache: any = null;
let usbEndpoint: number | null = null;

export async function pairUsb(): Promise<{ name: string; vendorId: number; productId: number }> {
  const nav: any = navigator;
  if (!nav.usb) throw new Error("Browser tidak mendukung Web USB (pakai Chrome/Edge desktop)");
  const device = await nav.usb.requestDevice({ filters: [{ classCode: 7 }] }).catch(async () => {
    return nav.usb.requestDevice({ filters: [] });
  });
  usbDeviceCache = device;
  return { name: (device.productName as string) || "USB Printer", vendorId: device.vendorId, productId: device.productId };
}

async function ensureUsbOpen(): Promise<void> {
  if (!usbDeviceCache) throw new Error("Printer USB belum dipasangkan. Buka Pengaturan → Pasangkan Printer USB.");
  const d = usbDeviceCache;
  if (!d.opened) await d.open();
  if (d.configuration === null) await d.selectConfiguration(1);
  const iface = d.configuration.interfaces[0];
  const num = iface.interfaceNumber;
  try { await d.claimInterface(num); } catch { /* already claimed */ }
  const alt = iface.alternate;
  const ep = alt.endpoints.find((e: any) => e.direction === "out");
  if (!ep) throw new Error("Endpoint printer tidak ditemukan");
  usbEndpoint = ep.endpointNumber;
}

async function sendUsbBytes(data: Uint8Array): Promise<void> {
  await ensureUsbOpen();
  const CHUNK = 4096;
  for (let i = 0; i < data.length; i += CHUNK) {
    await usbDeviceCache.transferOut(usbEndpoint!, data.slice(i, i + CHUNK));
  }
}

// ------------------- Public API -------------------
export async function printReceipt(r: ReceiptData, settings: PrinterSettings): Promise<void> {
  const method = settings.method;
  if (method === "browser") return printBrowser(r, settings.paper);
  if (method === "rawbt") return printRawBT(r, settings.paper);
  if (method === "bluetooth") {
    const bytes = buildEscposReceipt(r, settings.paper);
    return sendBluetoothBytes(bytes);
  }
  if (method === "usb") {
    const bytes = buildEscposReceipt(r, settings.paper);
    return sendUsbBytes(bytes);
  }
  // ask: default to browser
  return printBrowser(r, settings.paper);
}

export async function testPrint(settings: PrinterSettings): Promise<void> {
  const now = new Date();
  const demo: ReceiptData = {
    storeName: "UJI CETAK PRINTER",
    storeNote: "Ini contoh struk untuk memastikan printer Anda bekerja",
    txId: "TEST0000",
    at: now,
    items: [
      { name: "Contoh Produk A", qty: 2, unit: "pcs", detail: "2 x Rp 5.000", subtotal: 10000 },
      { name: "Contoh Produk B (grosir)", qty: 1, unit: "pak", isWholesale: true, detail: "1 pak x Rp 25.000", subtotal: 25000 },
    ],
    total: 35000,
    paid: 50000,
    change: 15000,
    paymentMethod: "cash",
  };
  return printReceipt(demo, settings);
}
