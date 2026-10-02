import { describe, expect, it } from "vitest";
import { allocateByPercentage, calculateBalance, validateAmountAllocations } from "../src";

describe("rateio", () => {
  it("preserva todos os centavos no rateio percentual", () => {
    expect(allocateByPercentage(10_001, [
      { percentagePpm: 333_333 },
      { percentagePpm: 333_333 },
      { percentagePpm: 333_334 },
    ])).toEqual([3_333, 3_333, 3_335]);
  });

  it("rejeita diferença de um centavo", () => {
    expect(() => validateAmountAllocations(500_000, [
      { amountCents: 350_000 },
      { amountCents: 149_999 },
    ])).toThrow(/igual/);
  });
});

describe("saldo", () => {
  it("considera movimentos manuais e bancários ativos", () => {
    expect(calculateBalance(100_000, [
      { direction: "CREDIT", amountCents: 50_000, status: "ACTIVE" },
      { direction: "DEBIT", amountCents: 20_000, status: "ACTIVE" },
      { direction: "DEBIT", amountCents: 99_000, status: "CANCELLED" },
    ])).toBe(130_000);
  });
});
