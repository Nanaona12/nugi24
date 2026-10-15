import { describe, it, expect } from "vitest";
import { tierFor, recommendedReward, DEFAULT_LOYALTY } from "./loyalty";

describe("loyalty", () => {
  it("tier mengikuti ambang laba default", () => {
    expect(tierFor(99999, DEFAULT_LOYALTY)).toBe("Bronze");
    expect(tierFor(100000, DEFAULT_LOYALTY)).toBe("Silver");
    expect(tierFor(300000, DEFAULT_LOYALTY)).toBe("Gold");
    expect(tierFor(750000, DEFAULT_LOYALTY)).toBe("Platinum");
  });
  it("reward maksimal 5% laba, dikurangi yang sudah diberikan", () => {
    expect(recommendedReward(420000, 0, DEFAULT_LOYALTY)).toBe(21000);
    expect(recommendedReward(420000, 20000, DEFAULT_LOYALTY)).toBe(1000);
    expect(recommendedReward(420000, 25000, DEFAULT_LOYALTY)).toBe(0);
    expect(recommendedReward(-5000, 0, DEFAULT_LOYALTY)).toBe(0);
  });
});
