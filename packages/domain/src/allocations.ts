import { addCents, assertSafeCents } from "./money";

export type AmountAllocationInput = { amountCents: number };
export type PercentageAllocationInput = { percentagePpm: number };

export function validateAmountAllocations(totalCents: number, items: readonly AmountAllocationInput[]): void {
  if (items.length === 0) throw new Error("Informe ao menos um rateio");
  if (items.some((item) => !Number.isSafeInteger(item.amountCents) || item.amountCents <= 0)) {
    throw new Error("Rateios devem possuir valores inteiros positivos");
  }
  if (addCents(items.map((item) => item.amountCents)) !== totalCents) {
    throw new Error("A soma dos rateios deve ser igual ao valor do movimento");
  }
}

export function allocateByPercentage(
  totalCents: number,
  items: readonly PercentageAllocationInput[],
): number[] {
  assertSafeCents(totalCents);
  if (totalCents <= 0 || items.length === 0) throw new Error("Rateio inválido");
  const percentageTotal = items.reduce((sum, item) => sum + item.percentagePpm, 0);
  if (percentageTotal !== 1_000_000) throw new Error("Os percentuais devem somar 100%");
  if (items.some((item) => !Number.isInteger(item.percentagePpm) || item.percentagePpm <= 0)) {
    throw new Error("Percentuais devem ser inteiros positivos");
  }

  let allocated = 0;
  return items.map((item, index) => {
    const amount = index === items.length - 1
      ? totalCents - allocated
      : Math.floor((totalCents * item.percentagePpm) / 1_000_000);
    allocated += amount;
    if (amount <= 0) throw new Error("O percentual gerou uma linha zerada");
    return amount;
  });
}
