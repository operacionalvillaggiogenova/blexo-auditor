import { z } from "zod";
import { dateSchema, moneyCentsSchema, uuidSchema } from "./common";

export const directionSchema = z.enum(["DEBIT", "CREDIT"]);
export const sourceTypeSchema = z.enum(["BANK", "MANUAL"]);
export const classificationTypeSchema = z.enum([
  "INCOME",
  "EXPENSE",
  "TRANSFER",
  "ADJUSTMENT",
  "FUND",
  "IGNORED",
]);

export const createBankAccountSchema = z.object({
  bankCode: z.string().regex(/^\d{3}$/),
  branchNumber: z.string().trim().min(1).max(10),
  branchCheckDigit: z.string().trim().max(2).default(""),
  accountNumber: z.string().trim().min(1).max(20),
  accountCheckDigit: z.string().trim().max(2).default(""),
  branchAccountCheckDigit: z.string().trim().max(2).default(""),
  description: z.string().trim().min(2).max(120),
  accountType: z.enum(["CHECKING", "SAVINGS", "INVESTMENT", "APPLICATION"]),
  openingBalanceCents: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  openingBalanceDate: dateSchema,
});

export const createMovementSchema = z.object({
  bankAccountId: uuidSchema,
  accountingDate: dateSchema,
  competenceDate: dateSchema,
  direction: directionSchema,
  amountCents: moneyCentsSchema,
  description: z.string().trim().min(2).max(500),
  justification: z.string().trim().min(3).max(2000),
  supplierId: uuidSchema.nullable().optional(),
});

export const updateMovementSchema = z.object({
  competenceDate: dateSchema.optional(),
  description: z.string().trim().min(2).max(500).optional(),
  justification: z.string().trim().min(3).max(2000).nullable().optional(),
  supplierId: uuidSchema.nullable().optional(),
  expectedVersion: z.number().int().positive(),
});

export const allocationItemSchema = z.object({
  chartAccountId: uuidSchema.nullable().optional(),
  fundId: uuidSchema.nullable().optional(),
  classificationType: classificationTypeSchema,
  amountCents: moneyCentsSchema.optional(),
  percentagePpm: z.number().int().min(1).max(1_000_000).optional(),
  description: z.string().trim().max(500).optional(),
  justification: z.string().trim().max(2000).optional(),
});

export const replaceAllocationsSchema = z.object({
  mode: z.enum(["AMOUNT", "PERCENTAGE"]),
  expectedVersion: z.number().int().positive(),
  items: z.array(allocationItemSchema).min(1).max(100),
});

export const cancelMovementSchema = z.object({
  reason: z.string().trim().min(5).max(2000),
  expectedVersion: z.number().int().positive(),
});

export const createChartAccountSchema = z.object({
  parentId: uuidSchema.nullable().optional(),
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(2).max(160),
  level: z.number().int().min(1).max(3),
  nature: z.enum(["INCOME", "EXPENSE", "NEUTRAL"]),
});

export const createSupplierSchema = z.object({
  name: z.string().trim().min(2).max(160),
  taxId: z.string().trim().max(20).nullable().optional(),
  category: z.string().trim().max(80).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  email: z.email().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export type Direction = z.infer<typeof directionSchema>;
export type ClassificationType = z.infer<typeof classificationTypeSchema>;
