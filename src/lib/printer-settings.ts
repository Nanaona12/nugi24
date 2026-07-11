export type PrinterMethod = "browser" | "bluetooth" | "usb" | "rawbt" | "ask";
export type PaperWidth = 58 | 80;

export type PrinterSettings = {
  method: PrinterMethod;
  paper: PaperWidth;
  autoPrint: boolean;
  bt?: { name?: string } | null;
  usb?: { vendorId?: number; productId?: number; name?: string } | null;
};

const KEY = "printer_settings_v1";

export const defaultPrinterSettings: PrinterSettings = {
  method: "browser",
  paper: 58,
  autoPrint: false,
  bt: null,
  usb: null,
};

export function loadPrinterSettings(): PrinterSettings {
  if (typeof window === "undefined") return { ...defaultPrinterSettings };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaultPrinterSettings };
    const parsed = JSON.parse(raw);
    return { ...defaultPrinterSettings, ...parsed };
  } catch {
    return { ...defaultPrinterSettings };
  }
}

export function savePrinterSettings(s: PrinterSettings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function supportsWebBluetooth(): boolean {
  return typeof navigator !== "undefined" && !!(navigator as any).bluetooth;
}
export function supportsWebUsb(): boolean {
  return typeof navigator !== "undefined" && !!(navigator as any).usb;
}
