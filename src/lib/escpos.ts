// Minimal ESC/POS byte builder. Uses CP437-ish ASCII; non-ASCII replaced.
import type { PaperWidth } from "./printer-settings";
import type { ReceiptData } from "./receipt-image";
import { formatRupiah } from "./format";

const ESC = 0x1b;
const GS = 0x1d;

function bytes(...arr: number[]) {
  return new Uint8Array(arr);
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

// Encode as latin1-ish (CP437 fallback via char codes < 256)
function enc(text: string): Uint8Array {
  const clean = text
    .replace(/[×✓✗]/g, "x")
    .replace(/🙏|📲|⬇️/g, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x00-\x7F]/g, "?");
  const out = new Uint8Array(clean.length);
  for (let i = 0; i < clean.length; i++) out[i] = clean.charCodeAt(i) & 0xff;
  return out;
}

const CMD = {
  init: bytes(ESC, 0x40),
  alignLeft: bytes(ESC, 0x61, 0),
  alignCenter: bytes(ESC, 0x61, 1),
  alignRight: bytes(ESC, 0x61, 2),
  boldOn: bytes(ESC, 0x45, 1),
  boldOff: bytes(ESC, 0x45, 0),
  sizeNormal: bytes(GS, 0x21, 0x00),
  sizeDoubleH: bytes(GS, 0x21, 0x01),
  sizeDoubleW: bytes(GS, 0x21, 0x10),
  sizeDouble: bytes(GS, 0x21, 0x11),
  feed: (n: number) => bytes(ESC, 0x64, n),
  cut: bytes(GS, 0x56, 0x00),
};

function widthCols(paper: PaperWidth): number {
  return paper === 80 ? 48 : 32;
}

function padPair(left: string, right: string, cols: number): string {
  const l = left;
  const r = right;
  const space = Math.max(1, cols - l.length - r.length);
  if (l.length + r.length >= cols) {
    // wrap left, right on next line right-aligned
    return l + "\n" + r.padStart(cols);
  }
  return l + " ".repeat(space) + r;
}

function wrap(text: string, cols: number): string[] {
  const out: string[] = [];
  const words = text.split(/\s+/);
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= cols) cur += " " + w;
    else {
      out.push(cur);
      cur = w;
    }
    while (cur.length > cols) {
      out.push(cur.slice(0, cols));
      cur = cur.slice(cols);
    }
  }
  if (cur) out.push(cur);
  return out;
}

export function buildEscposReceipt(r: ReceiptData, paper: PaperWidth): Uint8Array {
  const cols = widthCols(paper);
  const chunks: Uint8Array[] = [];
  chunks.push(CMD.init);

  // Header
  chunks.push(CMD.alignCenter);
  chunks.push(CMD.boldOn, CMD.sizeDoubleW);
  chunks.push(enc(r.storeName + "\n"));
  chunks.push(CMD.sizeNormal, CMD.boldOff);
  if (r.storeNote) chunks.push(enc(r.storeNote + "\n"));
  chunks.push(enc(`#${r.txId.slice(0, 8).toUpperCase()} - ${r.paymentMethod.toUpperCase()}\n`));
  chunks.push(enc(r.at.toLocaleString("id-ID") + "\n"));
  if (r.customerName) chunks.push(enc(`Pelanggan: ${r.customerName}\n`));
  if (r.customerPhone) chunks.push(enc(`No: ${r.customerPhone}\n`));

  chunks.push(CMD.alignLeft);
  chunks.push(enc("-".repeat(cols) + "\n"));

  // Items
  for (const it of r.items) {
    const nameLine = `${it.name}${it.isWholesale ? " (grosir)" : ""}`;
    const priceStr = formatRupiah(it.subtotal);
    // First line: name (wrap) with price on first row if fits
    const nameLines = wrap(nameLine, cols - priceStr.length - 1);
    if (nameLines.length === 0) nameLines.push(nameLine);
    chunks.push(enc(padPair(nameLines[0], priceStr, cols) + "\n"));
    for (let i = 1; i < nameLines.length; i++) chunks.push(enc(nameLines[i] + "\n"));
    if (it.detail) {
      for (const dl of wrap("  " + it.detail, cols)) chunks.push(enc(dl + "\n"));
    }
  }
  chunks.push(enc("-".repeat(cols) + "\n"));

  // Totals
  chunks.push(CMD.boldOn);
  chunks.push(enc(padPair("TOTAL", formatRupiah(r.total), cols) + "\n"));
  chunks.push(CMD.boldOff);
  if (r.paymentMethod === "split") {
    chunks.push(enc(padPair("Cash", formatRupiah(r.cashPart || 0), cols) + "\n"));
    chunks.push(enc(padPair("QRIS", formatRupiah(r.qrisPart || 0), cols) + "\n"));
    chunks.push(enc(padPair("Bayar (SPLIT)", formatRupiah(r.paid), cols) + "\n"));
  } else {
    chunks.push(enc(padPair(`Bayar (${r.paymentMethod.toUpperCase()})`, formatRupiah(r.paid), cols) + "\n"));
  }
  chunks.push(enc(padPair("Kembali", formatRupiah(r.change), cols) + "\n"));

  chunks.push(enc("\n"));
  chunks.push(CMD.alignCenter);
  chunks.push(enc("Terima kasih sudah berbelanja\n"));
  chunks.push(CMD.feed(3));
  chunks.push(CMD.cut);

  return concat(chunks);
}

export function buildReceiptText(r: ReceiptData, paper: PaperWidth): string {
  const cols = widthCols(paper);
  const lines: string[] = [];
  lines.push(r.storeName.toUpperCase());
  if (r.storeNote) lines.push(r.storeNote);
  lines.push(`#${r.txId.slice(0, 8).toUpperCase()} - ${r.paymentMethod.toUpperCase()}`);
  lines.push(r.at.toLocaleString("id-ID"));
  if (r.customerName) lines.push(`Pelanggan: ${r.customerName}`);
  if (r.customerPhone) lines.push(`No: ${r.customerPhone}`);
  lines.push("-".repeat(cols));
  for (const it of r.items) {
    const name = `${it.name}${it.isWholesale ? " (grosir)" : ""}`;
    lines.push(padPair(name, formatRupiah(it.subtotal), cols));
    if (it.detail) lines.push("  " + it.detail);
  }
  lines.push("-".repeat(cols));
  lines.push(padPair("TOTAL", formatRupiah(r.total), cols));
  if (r.paymentMethod === "split") {
    lines.push(padPair("Cash", formatRupiah(r.cashPart || 0), cols));
    lines.push(padPair("QRIS", formatRupiah(r.qrisPart || 0), cols));
    lines.push(padPair("Bayar (SPLIT)", formatRupiah(r.paid), cols));
  } else {
    lines.push(padPair(`Bayar (${r.paymentMethod.toUpperCase()})`, formatRupiah(r.paid), cols));
  }
  lines.push(padPair("Kembali", formatRupiah(r.change), cols));
  lines.push("");
  lines.push("Terima kasih sudah berbelanja".padStart((cols + 28) / 2));
  return lines.join("\n");
}
