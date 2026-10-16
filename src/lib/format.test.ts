import { describe, expect, it } from "vitest";
import { parseDecimalQty, toBaseQty, formatQty } from "./format";

describe("jumlah desimal kasir", () => {
  it("menerima koma sebagai desimal", () => {
    expect(parseDecimalQty("1,2")).toBe(1.2);
  });
  it("menolak teks tidak valid", () => {
    expect(Number.isNaN(parseDecimalQty("abc"))).toBe(true);
  });
  it("1,2 kg tepung dengan isi 1000 gram = 1200 gram stok", () => {
    expect(toBaseQty(1.2, 1000)).toBe(1200);
  });
  it("1,2 kg telur dengan isi 16 butir dibulatkan ke 19 butir", () => {
    expect(toBaseQty(1.2, 16)).toBe(19);
  });
  it("menampilkan 1,25 gaya Indonesia", () => {
    expect(formatQty(1.25)).toBe("1,25");
  });
});
