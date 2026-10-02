import { describe, expect, it } from "vitest";
import { buildSyntheticCnab, parseCnab240, splitCnabRecords } from "../src";

describe("CNAB240", () => {
  it.each(["341", "748"] as const)("interpreta extrato do banco %s", (bankCode) => {
    const file = buildSyntheticCnab({
      bankCode,
      transactions: [
        { accountingDate: "30092026", direction: "D", amountCents: 500_000, description: "PIX EMPRESA ABC" },
        { accountingDate: "30092026", direction: "C", amountCents: 125_050, description: "CREDITO PIX" },
      ],
    });
    const parsed = parseCnab240(file);
    expect(parsed.bankCode).toBe(bankCode);
    expect(parsed.issues).toEqual([]);
    expect(parsed.totals).toEqual({ records: 2, debitCents: 500_000, creditCents: 125_050 });
    expect(parsed.lots[0]?.transactions[0]).toMatchObject({
      accountingDate: "2026-09-30",
      direction: "DEBIT",
      amountCents: 500_000,
      description: "PIX EMPRESA ABC",
    });
  });

  it("rejeita linha que não possui 240 bytes", () => {
    expect(splitCnabRecords(new TextEncoder().encode("curta\n")).issues[0]).toMatchObject({
      code: "INVALID_RECORD_LENGTH",
      lineNumber: 1,
    });
  });

  it("rejeita banco não suportado", () => {
    const file = buildSyntheticCnab({ bankCode: "341", transactions: [] });
    file[0] = 57;
    expect(() => parseCnab240(file)).toThrow(/não suportado/);
  });
});
