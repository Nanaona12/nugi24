export type LoyaltySettings = {
  reward_cap_percent: number;
  silver_min: number;
  gold_min: number;
  platinum_min: number;
};

export const DEFAULT_LOYALTY: LoyaltySettings = {
  reward_cap_percent: 5,
  silver_min: 100000,
  gold_min: 300000,
  platinum_min: 750000,
};

export type Tier = "Bronze" | "Silver" | "Gold" | "Platinum";

export function tierFor(profit: number, s: LoyaltySettings): Tier {
  if (profit >= s.platinum_min) return "Platinum";
  if (profit >= s.gold_min) return "Gold";
  if (profit >= s.silver_min) return "Silver";
  return "Bronze";
}

/** Maksimal nilai reward = laba pelanggan x batas %, dikurangi reward yang sudah diberikan. Dibulatkan ke bawah per Rp500. */
export function recommendedReward(profit: number, alreadyGiven: number, s: LoyaltySettings): number {
  const cap = Math.max(0, profit) * (Number(s.reward_cap_percent) || 0) / 100 - Math.max(0, alreadyGiven);
  if (cap <= 0) return 0;
  return Math.floor(cap / 500) * 500;
}

export const normPhone = (p: string | null | undefined) => (p || "").replace(/\D/g, "");
