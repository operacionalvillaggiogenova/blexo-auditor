import { z } from "zod";
import { dateSchema, moneyCentsSchema, uuidSchema } from "./common";

export const createFundSchema = z.object({
  name: z.string().trim().min(2).max(120),
  purpose: z.string().trim().min(3).max(1000),
  openingBalanceCents: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  openingBalanceDate: dateSchema,
});

export const createFundMovementSchema = z.object({
  fundId: uuidSchema,
  financialMovementId: uuidSchema.nullable().optional(),
  movementType: z.enum(["CONTRIBUTION", "WITHDRAWAL", "INCOME", "TRANSFER", "ADJUSTMENT"]),
  direction: z.enum(["DEBIT", "CREDIT"]),
  amountCents: moneyCentsSchema,
  accountingDate: dateSchema,
  justification: z.string().trim().max(2000).nullable().optional(),
});

export const createBudgetSchema = z.object({
  fiscalYear: z.number().int().min(2000).max(9999),
  name: z.string().trim().min(2).max(120),
});

export const budgetItemSchema = z.object({
  chartAccountId: uuidSchema,
  monthNumber: z.number().int().min(1).max(12),
  amountCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});

export const createBudgetVersionSchema = z.object({
  versionType: z.enum(["ORIGINAL", "REVISED"]),
  reason: z.string().trim().max(2000).nullable().optional(),
  items: z.array(budgetItemSchema).min(1).max(5000),
});

export const closePeriodSchema = z.object({
  fiscalYear: z.number().int().min(2000).max(9999),
  monthNumber: z.number().int().min(1).max(12),
  reason: z.string().trim().max(2000).nullable().optional(),
  force: z.boolean().default(false),
});

export const reopenPeriodSchema = z.object({
  reason: z.string().trim().min(5).max(2000),
  expectedVersion: z.number().int().positive(),
});
