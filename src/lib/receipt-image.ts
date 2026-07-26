import { formatRupiah } from "@/lib/format";

export type ReceiptItem = {
  name: string;
  qty: number;
  unit: string;
  isWholesale?: boolean;
  detail?: string; // e.g. "2 pak × Rp 10.000 + 3 pcs × Rp 1.500"
  subtotal: number;
};

export type ReceiptData = {
  storeName: string;
  storeNote?: string;
  txId: string;
  at: Date;
  items: ReceiptItem[];
  total: number;
  paid: number;
  change: number;
  paymentMethod: string; // cash | qris | split
  cashPart?: number;
  qrisPart?: number;
  customerName?: string | null;
  customerPhone?: string | null;
};

/** Render struk ke PNG (data URL). Width fixed 600px, height auto. */
export function renderReceiptPng(
  r: ReceiptData,
  opts: { preview?: boolean } = {},
): { dataUrl: string; base64: string } {
  const preview = !!opts.preview;
  const W = 600;
  const PAD = 28;
  const lineGap = 6;
  const headerFs = 28;
  const subFs = 14;
  const itemFs = 18;
  const detailFs = 14;
  const totalFs = 22;

  // First pass: measure required height with an offscreen canvas
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = `${itemFs}px ui-sans-serif, system-ui, sans-serif`;

  // Helper for wrapping text
  const wrap = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
    const words = text.split(" ");
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const test = cur ? cur + " " + w : w;
      if (ctx.measureText(test).width > maxWidth) {
        if (cur) lines.push(cur);
        cur = w;
      } else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  };

  const contentW = W - PAD * 2;
  let y = PAD;
  // header
  y += headerFs + 4; // store name
  y += subFs + 4; // note
  y += subFs + 10; // tx id + date
  // optional customer lines
  if (r.customerName) y += subFs + 4;
  if (r.customerPhone) y += subFs + 4;
  y += 1 + 12; // separator

  const itemMeasures: { lines: string[]; detailLines: string[] }[] = [];
  for (const it of r.items) {
    measure.font = `600 ${itemFs}px ui-sans-serif, system-ui, sans-serif`;
    const head = `${it.name}${it.isWholesale ? " (grosir)" : ""}`;
    const hl = wrap(measure, head, contentW - 110);
    measure.font = `${detailFs}px ui-sans-serif, system-ui, sans-serif`;
    const dl = it.detail ? wrap(measure, it.detail, contentW) : [];
    itemMeasures.push({ lines: hl, detailLines: dl });
    y += hl.length * (itemFs + 2) + dl.length * (detailFs + 2) + lineGap + 4;
  }
  y += 1 + 12; // separator
  y += totalFs + 6; // total
  y += itemFs + 4; // paid
  y += itemFs + 10; // change
  y += subFs + PAD; // footer thanks

  const H = Math.ceil(y);

  const canvas = document.createElement("canvas");
  const dpr = 2;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);

  // bg
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  let yy = PAD;
  // store name
  ctx.fillStyle = "#0f172a";
  ctx.textAlign = "center";
  ctx.font = `800 ${headerFs}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText(r.storeName, W / 2, yy + headerFs - 4);
  yy += headerFs + 4;
  if (r.storeNote) {
    ctx.font = `${subFs}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillStyle = "#475569";
    ctx.fillText(r.storeNote, W / 2, yy + subFs - 2);
  }
  yy += subFs + 4;

  ctx.font = `${subFs}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillStyle = "#475569";
  const head1 = `#${r.txId.slice(0, 8).toUpperCase()} • ${r.paymentMethod.toUpperCase()}`;
  ctx.fillText(head1, W / 2, yy + subFs - 2);
  yy += subFs + 4;
  ctx.fillText(r.at.toLocaleString("id-ID"), W / 2, yy + subFs - 2);
  yy += subFs + 10;

  // customer info (optional)
  if (r.customerName) {
    ctx.font = `${subFs}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillStyle = "#475569";
    ctx.fillText(`Pelanggan: ${r.customerName}`, W / 2, yy + subFs - 2);
    yy += subFs + 4;
  }
  if (r.customerPhone) {
    ctx.font = `${subFs}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillStyle = "#475569";
    ctx.fillText(`No: ${r.customerPhone}`, W / 2, yy + subFs - 2);
    yy += subFs + 4;
  }

  // separator (dashed)
  ctx.strokeStyle = "#cbd5e1";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(PAD, yy);
  ctx.lineTo(W - PAD, yy);
  ctx.stroke();
  ctx.setLineDash([]);
  yy += 12;

  // items
  ctx.textAlign = "left";
  r.items.forEach((it, i) => {
    const m = itemMeasures[i];
    ctx.fillStyle = "#0f172a";
    ctx.font = `600 ${itemFs}px ui-sans-serif, system-ui, sans-serif`;
    m.lines.forEach((ln, idx) => {
      ctx.fillText(ln, PAD, yy + itemFs);
      if (idx === 0) {
        ctx.textAlign = "right";
        ctx.fillText(formatRupiah(it.subtotal), W - PAD, yy + itemFs);
        ctx.textAlign = "left";
      }
      yy += itemFs + 2;
    });
    if (m.detailLines.length) {
      ctx.font = `${detailFs}px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillStyle = "#64748b";
      for (const dl of m.detailLines) {
        ctx.fillText(dl, PAD, yy + detailFs);
        yy += detailFs + 2;
      }
    }
    yy += lineGap;
  });

  yy += 4;
  ctx.strokeStyle = "#cbd5e1";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(PAD, yy);
  ctx.lineTo(W - PAD, yy);
  ctx.stroke();
  ctx.setLineDash([]);
  yy += 12;

  // total
  ctx.font = `800 ${totalFs}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillStyle = "#0f172a";
  ctx.textAlign = "left";
  ctx.fillText("TOTAL", PAD, yy + totalFs);
  ctx.textAlign = "right";
  ctx.fillStyle = "#16a34a";
  ctx.fillText(formatRupiah(r.total), W - PAD, yy + totalFs);
  yy += totalFs + 6;

  ctx.font = `${itemFs}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillStyle = "#334155";
  ctx.textAlign = "left";
  if (r.paymentMethod === "split") {
    ctx.fillText("Cash", PAD, yy + itemFs);
    ctx.textAlign = "right";
    ctx.fillText(formatRupiah(r.cashPart || 0), W - PAD, yy + itemFs);
    yy += itemFs + 4;
    ctx.textAlign = "left";
    ctx.fillText("QRIS", PAD, yy + itemFs);
    ctx.textAlign = "right";
    ctx.fillText(formatRupiah(r.qrisPart || 0), W - PAD, yy + itemFs);
    yy += itemFs + 4;
    ctx.textAlign = "left";
    ctx.fillText("Total Bayar (SPLIT)", PAD, yy + itemFs);
    ctx.textAlign = "right";
    ctx.fillText(formatRupiah(r.paid), W - PAD, yy + itemFs);
    yy += itemFs + 4;
  } else {
    ctx.fillText(`Bayar (${r.paymentMethod.toUpperCase()})`, PAD, yy + itemFs);
    ctx.textAlign = "right";
    ctx.fillText(formatRupiah(r.paid), W - PAD, yy + itemFs);
    yy += itemFs + 4;
  }

  ctx.textAlign = "left";
  ctx.fillText("Kembali", PAD, yy + itemFs);
  ctx.textAlign = "right";
  ctx.fillText(formatRupiah(r.change), W - PAD, yy + itemFs);
  yy += itemFs + 10;

  ctx.textAlign = "center";
  ctx.font = `${subFs}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillStyle = "#64748b";
  ctx.fillText("Terima kasih sudah berbelanja 🙏", W / 2, yy + subFs);

  const dataUrl = canvas.toDataURL("image/png");
  const base64 = dataUrl.split(",")[1] || "";
  return { dataUrl, base64 };
}
