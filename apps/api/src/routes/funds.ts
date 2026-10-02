import { createFundMovementSchema, createFundSchema } from "@blexo/contracts";
import { Hono } from "hono";
import { auditStatement } from "../audit";
import { notFound } from "../errors";
import { nowIso, parseJson, tenantId } from "../http";
import { requireAuth, requireRoles } from "../middleware/auth";
import { assertPeriodOpen } from "../periods";
import type { AppEnv } from "../types";

const funds = new Hono<AppEnv>();
funds.use("*", requireAuth);

funds.get("/", requireRoles("ADMIN", "OPERATOR", "VIEWER"), async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT f.id, f.name, f.purpose, f.opening_balance_cents, f.opening_balance_date, f.status, f.version,
      f.opening_balance_cents + COALESCE(SUM(CASE WHEN fm.status = 'ACTIVE' THEN
        CASE WHEN fm.direction = 'CREDIT' THEN fm.amount_cents ELSE -fm.amount_cents END ELSE 0 END), 0) AS current_balance_cents
    FROM funds f LEFT JOIN fund_movements fm ON fm.tenant_id = f.tenant_id AND fm.fund_id = f.id
    WHERE f.tenant_id = ? GROUP BY f.id ORDER BY f.name
  `).bind(tenantId(c)).all();
  return c.json({ items: result.results });
});

funds.post("/", requireRoles("ADMIN"), async (c) => {
  const tenant = tenantId(c);
  const input = await parseJson(c, createFundSchema);
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT INTO funds (id, tenant_id, name, purpose, opening_balance_cents, opening_balance_date, status, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', 1, ?, ?)
    `).bind(id, tenant, input.name, input.purpose, input.openingBalanceCents, input.openingBalanceDate, timestamp, timestamp),
    auditStatement(c.env.DB, {
      tenantId: tenant, actorUserId: c.get("auth").id, entityType: "fund", entityId: id,
      action: "CREATE", after: input, requestId: c.get("requestId"), createdAt: timestamp,
    }),
  ]);
  return c.json({ id }, 201);
});

funds.get("/:id/movements", requireRoles("ADMIN", "OPERATOR", "VIEWER"), async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT fm.*, m.public_number, m.description AS financial_description
    FROM fund_movements fm LEFT JOIN financial_movements m
      ON m.tenant_id = fm.tenant_id AND m.id = fm.financial_movement_id
    WHERE fm.tenant_id = ? AND fm.fund_id = ? ORDER BY fm.accounting_date DESC, fm.created_at DESC
  `).bind(tenantId(c), c.req.param("id")).all();
  return c.json({ items: result.results });
});

funds.post("/:id/movements", requireRoles("ADMIN", "OPERATOR"), async (c) => {
  const tenant = tenantId(c);
  const fundId = c.req.param("id");
  const input = await parseJson(c, createFundMovementSchema);
  if (input.fundId !== fundId) notFound("Fundo não encontrado.");
  const fund = await c.env.DB.prepare("SELECT id FROM funds WHERE tenant_id = ? AND id = ? AND status = 'ACTIVE'")
    .bind(tenant, fundId).first();
  if (!fund) notFound("Fundo não encontrado ou inativo.");
  await assertPeriodOpen(c.env.DB, tenant, input.accountingDate);
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT INTO fund_movements (id, tenant_id, fund_id, financial_movement_id, movement_type, direction,
        amount_cents, accounting_date, justification, status, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
    `).bind(id, tenant, fundId, input.financialMovementId ?? null, input.movementType, input.direction,
      input.amountCents, input.accountingDate, input.justification ?? null, c.get("auth").id, timestamp),
    auditStatement(c.env.DB, {
      tenantId: tenant, actorUserId: c.get("auth").id, entityType: "fund_movement", entityId: id,
      action: "CREATE", after: input, requestId: c.get("requestId"), createdAt: timestamp,
    }),
  ]);
  return c.json({ id }, 201);
});

export default funds;
