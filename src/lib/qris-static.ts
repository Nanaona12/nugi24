// Convert a static QRIS payload (EMVCo MPM) into a dynamic one by injecting
// a transaction amount (tag 54) and recomputing the CRC16 (tag 63).
// Pure client-side helper — no network calls.

function crc16CCITT(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function tlv(tag: string, value: string): string {
  return `${tag}${value.length.toString().padStart(2, "0")}${value}`;
}

/**
 * Parse top-level TLV entries from a QRIS payload. Used to validate input
 * and to remove existing dynamic-only fields before re-injecting them.
 */
function stripTags(payload: string, tagsToRemove: string[]): string {
  let i = 0;
  let out = "";
  while (i + 4 <= payload.length) {
    const tag = payload.slice(i, i + 2);
    const len = parseInt(payload.slice(i + 2, i + 4), 10);
    if (isNaN(len)) break;
    const end = i + 4 + len;
    if (end > payload.length) break;
    const chunk = payload.slice(i, end);
    if (!tagsToRemove.includes(tag)) out += chunk;
    i = end;
  }
  return out;
}

/**
 * Convert a static QRIS payload string into a dynamic one with a specific amount.
 * - Sets tag 01 ("Point of Initiation") to "12" (dynamic).
 * - Replaces tag 54 (transaction amount) with the given amount.
 * - Removes any existing tag 63 (CRC) and appends a freshly computed one.
 */
export function convertStaticToDynamicQris(rawPayload: string, amount: number): string {
  const payload = (rawPayload || "").trim();
  if (payload.length < 20) throw new Error("Payload QRIS tidak valid");
  if (!/^00\d{2}01/.test(payload)) throw new Error("Format QRIS tidak dikenali");
  const amt = Math.max(1, Math.round(Number(amount) || 0));
  if (amt <= 0) throw new Error("Nominal tidak valid");

  // Remove tag 54 (amount) and tag 63 (CRC) so we can re-insert cleanly.
  let body = stripTags(payload, ["54", "63"]);

  // Set tag 01 to "12" (dynamic). Tag 01 is fixed-length 2 chars right after 00xx.
  // Locate "0102" prefix and replace the following 2 chars.
  body = body.replace(/^(00\d{2})0102\d{2}/, (_m, p1) => `${p1}010212`);

  // Insert tag 54 just before any tail. Easiest: append before CRC reconstruction.
  // We append 54 + amount, then we'll add 6304 + CRC at end.
  body += tlv("54", String(amt));

  const toSign = body + "6304";
  const crc = crc16CCITT(toSign);
  return toSign + crc;
}
