import { describe, expect, it } from "vitest";
import { cashCountTotal } from "./cash-count";

describe("closing cash count", () => {
  it("adds denomination counts as physical cash, not sales", () => {
    expect(cashCountTotal({ 100000: "2", 50000: "3", 2000: "4", 500: "5" })).toBe(360500);
  });
  it("keeps an empty count at zero", () => {
    expect(cashCountTotal({})).toBe(0);
  });
  it("rejects negative and fractional counts", () => {
    expect(cashCountTotal({ 100000: "-1", 50000: "1.5", 1000: "2" })).toBe(2000);
  });
});