import { describe, expect, it } from "vitest";
import { cashCountTotal } from "./cash-count";

describe("closing cash count", () => {
  it("adds arbitrary amounts as physical cash, not sales", () => {
    expect(cashCountTotal(["150.000", "20.000", "30.000"])).toBe(200000);
  });
  it("keeps an empty count at zero", () => {
    expect(cashCountTotal([])).toBe(0);
  });
  it("rejects negative, fractional, malformed and unsafe amounts", () => {
    expect(cashCountTotal(["-1000", "1.5", "1,5", "abc", "9007199254740992", "2000"])).toBe(2000);
  });
  it("recalculates edited and removed amounts", () => {
    expect(cashCountTotal(["150000", "25000", "30000"])).toBe(205000);
    expect(cashCountTotal(["150000", "30000"])).toBe(180000);
  });
});