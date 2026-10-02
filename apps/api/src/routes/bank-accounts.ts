import { createBankAccountSchema } from "@blexo/contracts";
import { Hono } from "hono";
import { z } from "zod";
import { auditStatement } from "../audit";
import { conflict, notFound } from "../errors";
import { nowIso, parseJson, tenantId } from "../http";
import { requireAuth, requireRoles } from "../middleware/auth";
import type { AppEnv } from "../types";

const accounts = new Hono<AppEnv>();
accounts.use("*", requireAuth);

accounts.get("/", requireRoles("ADMIN", "OPERATOR", "VIEWER"), async (c) => {
  const tenant = tenantId(c);
  const result = await c.env.DB.prepare(`
    SELECT
      ba.id, ba.bank_code, ba.branch_number, ba.branch_check_digit,
      ba.account_number, ba.account_check_digit, ba.description, ba.account_type,
      ba.opening_balance_cents, ba.opening_balance_date, ba.status, ba.version,
      ba.opening_balance_cents + COALESCE(SUM(
        CASE
          WHEN fm.status <> 'ACTIVE' THEN 0
          WHEN fm.direction = 'CREDIT' THEN fm.amount_cents
          ELSE -fm.amount_cents
        END
      ), 0) AS current_balance_cents,
      MAX(fm.accounting_date) AS last_movement_date,
      (
        SELECT MAX(bi.confirmed_at)
        FROM bank_import_lots bil
        JOIN bank_imports bi ON bi.tenant_id = bil.tenant_id AND bi.id = bil.bank_import_id
        WHERE bil.tenant_id = ba.tenant_id AND bil.bank_account_id = ba.id AND bi.status = 'COMPLETED'
      ) AS last_import_date
    FROM bank_accounts ba
    LEFT JOIN financial_movements fm
      ON fm.tenant_id = ba.tenant_id AND fm.bank_account_id = ba.id
    WHERE ba.tenant_id = ?
    GROUP BY ba.id
    ORDER BY ba.description
  `).bind(tenant).all();
  return c.json({ items: result.results });
});

accounts.post("/", requireRoles("ADMIN"), async (c) => {
  const tenant = tenantId(c);
  const input = await parseJson(c, createBankAccountSchema);
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT INTO bank_accounts (
        id, tenant_id, bank_code, branch_number, branch_check_digit,
        account_number, account_check_digit, branch_account_check_digit,
        description, account_type, opening_balance_cents, opening_balance_date,
        status, version, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 1, ?, ?, ?)
    `).bind(
      id, tenant, input.bankCode, input.branchNumber, input.branchCheckDigit,
      input.accountNumber, input.accountCheckDigit, input.branchAccountCheckDigit,
      input.description, input.accountType, input.openingBalanceCents, input.openingBalanceDate,
      c.get("auth").id, timestamp, timestamp,
    ),
    auditStatement(c.env.DB, {
      tenantId: tenant,
      actorUserId: c.get("auth").id,
      entityType: "bank_account",
      entityId: id,
      action: "CREATE",
      after: input,
      requestId: c.get("requestId"),
      createdAt: timestamp,
    }),
  ]);
  return c.json({ id }, 201);
});

const updateAccountSchema = createBankAccountSchema.partial().extend({
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  expectedVersion: z.number().int().positive(),
});

accounts.patch("/:id", requireRoles("ADMIN"), async (c) => {
  const tenant = tenantId(c);
  const id = c.req.param("id");
  const input = await parseJson(c, updateAccountSchema);
  const before = await c.env.DB.prepare("SELECT * FROM bank_accounts WHERE tenant_id = ? AND id = ?")
    .bind(tenant, id).first<Record<string, unknown>>();
  if (!before) notFound("Conta bancária não encontrada.");
  if (before.version !== input.expectedVersion) conflict("VERSION_CONFLICT", "A conta foi alterada por outro usuário.");
  const timestamp = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare(`
      UPDATE bank_accounts SET
        bank_code = COALESCE(?, bank_code),
        branch_number = COALESCE(?, branch_number),
        branch_check_digit = COALESCE(?, branch_check_digit),
        account_number = COALESCE(?, account_number),
        account_check_digit = COALESCE(?, account_check_digit),
        branch_account_check_digit = COALESCE(?, branch_account_check_digit),
        description = COALESCE(?, description),
        account_type = COALESCE(?, account_type),
        opening_balance_cents = COALESCE(?, opening_balance_cents),
        opening_balance_date = COALESCE(?, opening_balance_date),
        status = COALESCE(?, status),
        version = version + 1,
        updated_at = ?
      WHERE tenant_id = ? AND id = ? AND version = ?
    `).bind(
      input.bankCode ?? null, input.branchNumber ?? null, input.branchCheckDigit ?? null,
      input.accountNumber ?? null, input.accountCheckDigit ?? null, input.branchAccountCheckDigit ?? null,
      input.description ?? null, input.accountType ?? null, input.openingBalanceCents ?? null,
      input.openingBalanceDate ?? null, input.status ?? null, timestamp, tenant, id, input.expectedVersion,
    ),
    auditStatement(c.env.DB, {
      tenantId: tenant,
      actorUserId: c.get("auth").id,
      entityType: "bank_account",
      entityId: id,
      action: "UPDATE",
      before,
      after: input,
      requestId: c.get("requestId"),
      createdAt: timestamp,
    }),
  ]);
  return c.json({ ok: true });
});

export default accounts;
