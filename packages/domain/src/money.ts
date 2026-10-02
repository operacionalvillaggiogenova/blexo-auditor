import type { Direction } from "@blexo/contracts";

export function assertSafeCents(value: number): number {
  if (!Number.isSafeInteger(value)) throw new Error("Valor monetário fora do intervalo seguro");
  return value;
}

export function signedCents(direction: Direction, amountCents: number): number {
  assertSafeCents(amountCents);
  if (amountCents <= 0) throw new Error("O valor deve ser maior que zero");
  return direction === "DEBIT" ? -amountCents : amountCents;
}

export function addCents(values: readonly number[]): number {
  return values.reduce((total, value) => assertSafeCents(total + value), 0);
}

export function formatBrl(cents: number): string {
  assertSafeCents(cents);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}
