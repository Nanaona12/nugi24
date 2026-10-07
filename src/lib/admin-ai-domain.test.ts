import { describe, expect, it } from "vitest";
import { assertOwnedProducts, calculateProfit, jakartaDateRange, validatePoDraft, type AdminAiPoDraft } from "./admin-ai-domain";

const draft: AdminAiPoDraft = { supplier: "Supplier Uji", notes: null, payment_terms: "cash", due_date: null, invoice_no: null,
  items: [{ product_id: null, product_code: null, product_name: "Djarum Coklat", qty: 5, unit_name: "bungkus", unit_conversion: 12, unit_cost: 17000, sell_price: null, category: null }] };

describe("AI admin business rules", () => {
  it("does not add cash surplus to profit", () => {
    expect(calculateProfit([{ subtotal: 7000, unit_cost: 1000, qty: 2 }], [{ difference: 300, shortage_resolution: null }]).net_profit).toBe(5000);
  });
  it("only store losses and legacy shortages reduce profit", () => {
    expect(calculateProfit([{ subtotal: 7000, unit_cost: 1000, qty: 2 }], [
      { difference: -300, shortage_resolution: "pending" }, { difference: -300, shortage_resolution: "salary_deduction" },
      { difference: -300, shortage_resolution: "store_loss" }, { difference: -100, shortage_resolution: null },
    ]).net_profit).toBe(4600);
  });
  it("preserves five packs rather than sixty base pieces", () => {
    const result = validatePoDraft(draft);
    expect(result.items[0]?.qty).toBe(5);
    expect(result.items[0]?.unit_conversion).toBe(12);
    expect(result.items.reduce((s, x) => s + x.qty * x.unit_cost, 0)).toBe(85000);
  });
  it("requires a due date for credit purchases", () => {
    expect(() => validatePoDraft({ ...draft, payment_terms: "credit" })).toThrow("jatuh tempo");
  });
  it("scopes product ids to the active store", () => {
    expect(() => assertOwnedProducts(["other-store-product"], new Set(["my-product"]))).toThrow("toko aktif");
  });
  it("includes the whole requested Jakarta date", () => {
    expect(jakartaDateRange("2026-10-05", "2026-10-07")).toEqual({ start: "2026-10-04T17:00:00.000Z", end: "2026-10-07T17:00:00.000Z" });
  });
  it("excludes profit before the last reset", () => {
    expect(jakartaDateRange("2026-09-05", "2026-09-10", "2026-09-06T01:00:00Z").start).toBe("2026-09-06T01:00:00.000Z");
  });
});