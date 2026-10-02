import type { Direction } from "@blexo/contracts";
import { addCents, signedCents } from "./money";

export type BalanceMovement = {
  direction: Direction;
  amountCents: number;
  status: "ACTIVE" | "CANCELLED";
};

export function calculateBalance(openingBalanceCents: number, movements: readonly BalanceMovement[]): number {
  return addCents([
    openingBalanceCents,
    ...movements
      .filter((movement) => movement.status === "ACTIVE")
      .map((movement) => signedCents(movement.direction, movement.amountCents)),
  ]);
}
