import {
  cancelMovementSchema,
  createMovementSchema,
  replaceAllocationsSchema,
  updateMovementSchema,
} from "@blexo/contracts";
import { allocateByPercentage, validateAmountAllocations } from "@blexo/domain";
import { Hono } from "hono";
import { z } from "zod";
import { auditStatement } from "../audit";
import { AppError, conflict, forbidden, notFound } from "../errors";
import { dateYear, nowIso, parseJson, tenantId } from "../http";
import { requireAuth, requireRoles } from "../middleware/auth";
import { assertPeriodOpen } from "../periods";
import type { AppEnv } from "../types";

type MovementRow = Record<string, unknown> & {
  id: string;
  accounting_date: string;
  amount_cents: number;
  source_type: string;
  version: number;
  status: string;
};

const movements = new Hono<AppEnv>();
movements.use("*", requireAuth);

movements.get("/", requireRoles("ADMIN", "OPERATOR", "VIEWER"), async (c) => {
  const tenant = tenantId(c);
  const query = c.req.query();
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 100);
  const result = await c.env.DB.prepare(`
    SELECT
      fm.id, fm.public_number, fm.source_type, fm.accounting_date, fm.competence_date,
      fm.direction, fm.amount_cents, fm.description, fm.justification, fm.status, fm.version,
      ba.description AS bank_account_description, s.name AS supplier_name,
      COALESCE(SUM(ma.amount_cents), 0) AS allocated_cents,
      CASE
        WHEN COUNT(ma.id) = 0 THEN 'UNCLASSIFIED'
        WHEN COALESCE(SUM(ma.amount_cents), 0) < fm.amount_cents THEN 'PARTIAL'
        WHEN COALESCE(SUM(ma.amount_cents), 0) = fm.amount_cents THEN 'CLASSIFIED'
        ELSE 'DIVERGENT'
      END AS classification_status
    FROM financial_movements fm
    JOIN bank_accounts ba ON ba.tenant_id = fm.tenant_id AND ba.id = fm.bank_account_id
    LEFT JOIN suppliers s ON s.tenant_id = fm.tenant_id AND s.id = fm.supplier_id
    LEFT JOIN movement_allocations ma ON ma.tenant_id = fm.tenant_id AND ma.financial_movement_id = fm.id
    WHERE fm.tenant_id = ?
      AND (? IS NULL OR fm.bank_account_id = ?)
      AND (? IS NULL OR fm.accounting_date >= ?)
      AND (? IS NULL OR fm.accounting_date <= ?)
      AND (? IS NULL OR fm.source_type = ?)
      AND (? IS NULL OR fm.status = ?)
      AND (? IS NULL OR fm.description LIKE '%' || ? || '%')
    GROUP BY fm.id
    ORDER BY fm.accounting_date DESC, fm.public_number DESC
    LIMIT ?
  `).bind(
    tenant,
    query.bankAccountId ?? null, query.bankAccountId ?? null,
    query.dateFrom ?? null, query.dateFrom ?? null,
    query.dateTo ?? null, query.dateTo ?? null,
    query.sourceType ?? null, query.sourceType ?? null,
    query.status ?? null, query.status ?? null,
    query.description ?? null, query.description ?? null,
    limit,
  ).all();
  return c.json({ items: result.results });
});

movements.get("/:id", requireRoles("ADMIN", "OPERATOR", "VIEWER"), async (c) => {
  const tenant = tenantId(c);
  const id = c.req.param("id");
  const movement = await c.env.DB.prepare(`
    SELECT fm.*, ba.description AS bank_account_description, s.name AS supplier_name,
           bt.history_code, bt.category_code, bt.document_number, bt.source_event_date
    FROM financial_movements fm
    JOIN bank_accounts ba ON ba.tenant_id = fm.tenant_id AND ba.id = fm.bank_account_id
    LEFT JOIN suppliers s ON s.tenant_id = fm.tenant_id AND s.id = fm.supplier_id
    LEFT JOIN bank_transactions bt ON bt.tenant_id = fm.tenant_id AND bt.id = fm.bank_transaction_id
    WHERE fm.tenant_id = ? AND fm.id = ?
  `).bind(tenant, id).first();
  if (!movement) notFound("Movimento não encontrado.");
  const [allocations, evidences] = await Promise.all([
    c.env.DB.prepare(`
      SELECT ma.*, ca.code AS chart_account_code, ca.name AS chart_account_name, f.name AS fund_name
      FROM movement_allocations ma
      LEFT JOIN chart_accounts ca ON ca.tenant_id = ma.tenant_id AND ca.id = ma.chart_account_id
      LEFT JOIN funds f ON f.tenant_id = ma.tenant_id AND f.id = ma.fund_id
      WHERE ma.tenant_id = ? AND ma.financial_movement_id = ? ORDER BY ma.line_number
    `).bind(tenant, id).all(),
    c.env.DB.prepare(`
      SELECT id, evidence_type, original_filename, size_bytes, mime_type, description,
             is_valid_evidence, include_in_report, status, created_at
      FROM evidences WHERE tenant_id = ? AND financial_movement_id = ? AND status <> 'CANCELLED'
      ORDER BY created_at
    `).bind(tenant, id).all(),
  ]);
  return c.json({ ...movement, allocations: allocations.results, evidences: evidences.results });
});

movements.post("/", requireRoles("ADMIN", "OPERATOR"), async (c) => {
  const tenant = tenantId(c);
  const input = await parseJson(c, createMovementSchema);
  await assertPeriodOpen(c.env.DB, tenant, input.accountingDate);
  const account = await c.env.DB.prepare("SELECT id FROM bank_accounts WHERE tenant_id = ? AND id = ? AND status = 'ACTIVE'")
    .bind(tenant, input.bankAccountId).first();
  if (!account) notFound("Conta bancária não encontrada ou inativa.");
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT INTO financial_movements (
        id, tenant_id, bank_account_id, bank_transaction_id, source_type,
        sequence_year, sequence_number, public_number, accounting_date, competence_date,
        direction, amount_cents, description, justification, supplier_id,
        status, cancelled_at, cancelled_by, cancellation_reason, version,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, NULL, 'MANUAL', ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?,
        'ACTIVE', NULL, NULL, NULL, 1, ?, ?, ?)
    `).bind(
      id, tenant, input.bankAccountId, dateYear(input.accountingDate), input.accountingDate,
      input.competenceDate, input.direction, input.amountCents, input.description,
      input.justification, input.supplierId ?? null, c.get("auth").id, timestamp, timestamp,
    ),
    auditStatement(c.env.DB, {
      tenantId: tenant, actorUserId: c.get("auth").id, entityType: "financial_movement", entityId: id,
      action: "CREATE_MANUAL", after: input, requestId: c.get("requestId"), createdAt: timestamp,
    }),
  ]);
  const created = await c.env.DB.prepare("SELECT id, public_number, version FROM financial_movements WHERE tenant_id = ? AND id = ?")
    .bind(tenant, id).first();
  return c.json(created, 201);
});

movements.patch("/:id", requireRoles("ADMIN", "OPERATOR"), async (c) => {
  const tenant = tenantId(c);
  const id = c.req.param("id");
  const input = await parseJson(c, updateMovementSchema);
  const before = await c.env.DB.prepare("SELECT * FROM financial_movements WHERE tenant_id = ? AND id = ?")
    .bind(tenant, id).first<MovementRow>();
  if (!before) notFound("Movimento não encontrado.");
  if (before.status !== "ACTIVE") conflict("MOVEMENT_CANCELLED", "Movimento cancelado não pode ser alterado.");
  if (before.version !== input.expectedVersion) conflict("VERSION_CONFLICT", "O movimento foi alterado por outro usuário.");
  if (before.source_type === "MANUAL" && input.justification === null) {
    throw new AppError(422, "JUSTIFICATION_REQUIRED", "Lançamentos manuais devem manter uma justificativa.");
  }
  await assertPeriodOpen(c.env.DB, tenant, before.accounting_date);
  const timestamp = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare(`
      UPDATE financial_movements SET competence_date = COALESCE(?, competence_date),
        description = COALESCE(?, description), justification = ?, supplier_id = ?,
        version = version + 1, updated_at = ?
      WHERE tenant_id = ? AND id = ? AND version = ?
    `).bind(
      input.competenceDate ?? null,
      input.description ?? null,
      input.justification === undefined ? before.justification ?? null : input.justification,
      input.supplierId === undefined ? before.supplier_id ?? null : input.supplierId,
      timestamp, tenant, id, input.expectedVersion,
    ),
    auditStatement(c.env.DB, {
      tenantId: tenant, actorUserId: c.get("auth").id, entityType: "financial_movement", entityId: id,
      action: "UPDATE", before, after: input, requestId: c.get("requestId"), createdAt: timestamp,
    }),
  ]);
  return c.json({ ok: true, version: input.expectedVersion + 1 });
});

movements.put("/:id/allocations", requireRoles("ADMIN", "OPERATOR"), async (c) => {
  const tenant = tenantId(c);
  const id = c.req.param("id");
  const input = await parseJson(c, replaceAllocationsSchema);
  const movement = await c.env.DB.prepare("SELECT * FROM financial_movements WHERE tenant_id = ? AND id = ?")
    .bind(tenant, id).first<MovementRow>();
  if (!movement) notFound("Movimento não encontrado.");
  if (movement.status !== "ACTIVE") conflict("MOVEMENT_CANCELLED", "Movimento cancelado não pode ser classificado.");
  if (movement.version !== input.expectedVersion) conflict("VERSION_CONFLICT", "O movimento foi alterado por outro usuário.");
  await assertPeriodOpen(c.env.DB, tenant, movement.accounting_date);
  if (input.items.some((item) => item.classificationType === "IGNORED") && c.get("auth").role !== "ADMIN") forbidden("Somente administradores podem ignorar movimentos.");

  const amounts = input.mode === "AMOUNT"
    ? input.items.map((item) => {
        if (item.amountCents === undefined || item.percentagePpm !== undefined) throw new AppError(422, "INVALID_ALLOCATION", "Rateio por valor exige somente valores.");
        return item.amountCents;
      })
    : allocateByPercentage(movement.amount_cents, input.items.map((item) => {
        if (item.percentagePpm === undefined || item.amountCents !== undefined) throw new AppError(422, "INVALID_ALLOCATION", "Rateio percentual exige somente percentuais.");
        return { percentagePpm: item.percentagePpm };
      }));
  validateAmountAllocations(movement.amount_cents, amounts.map((amountCents) => ({ amountCents })));

  const beforeAllocations = await c.env.DB.prepare("SELECT * FROM movement_allocations WHERE tenant_id = ? AND financial_movement_id = ? ORDER BY line_number")
    .bind(tenant, id).all();
  const timestamp = nowIso();
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare("DELETE FROM movement_allocations WHERE tenant_id = ? AND financial_movement_id = ?").bind(tenant, id),
  ];
  input.items.forEach((item, index) => {
    statements.push(c.env.DB.prepare(`
      INSERT INTO movement_allocations (
        id, tenant_id, financial_movement_id, line_number, allocation_mode,
        classification_type, chart_account_id, fund_id, amount_cents, percentage_ppm,
        description, justification, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(), tenant, id, index + 1, input.mode, item.classificationType,
      item.chartAccountId ?? null, item.fundId ?? null, amounts[index] ?? 0,
      input.mode === "PERCENTAGE" ? item.percentagePpm ?? null : null,
      item.description ?? null, item.justification ?? null, c.get("auth").id, timestamp, timestamp,
    ));
  });
  statements.push(c.env.DB.prepare("UPDATE financial_movements SET version = version + 1, updated_at = ? WHERE tenant_id = ? AND id = ? AND version = ?")
    .bind(timestamp, tenant, id, input.expectedVersion));
  statements.push(auditStatement(c.env.DB, {
    tenantId: tenant, actorUserId: c.get("auth").id, entityType: "financial_movement", entityId: id,
    action: "REPLACE_ALLOCATIONS", before: beforeAllocations.results, after: input,
    requestId: c.get("requestId"), createdAt: timestamp,
  }));
  await c.env.DB.batch(statements);
  return c.json({ ok: true, version: input.expectedVersion + 1 });
});

movements.post("/:id/cancel", requireRoles("ADMIN"), async (c) => {
  const tenant = tenantId(c);
  const id = c.req.param("id");
  const input = await parseJson(c, cancelMovementSchema);
  const movement = await c.env.DB.prepare("SELECT * FROM financial_movements WHERE tenant_id = ? AND id = ?")
    .bind(tenant, id).first<MovementRow & { source_type: string }>();
  if (!movement) notFound("Movimento não encontrado.");
  if (movement.source_type !== "MANUAL") throw new AppError(422, "BANK_MOVEMENT_IMMUTABLE", "Movimentos bancários não podem ser cancelados.");
  if (movement.version !== input.expectedVersion) conflict("VERSION_CONFLICT", "O movimento foi alterado por outro usuário.");
  await assertPeriodOpen(c.env.DB, tenant, movement.accounting_date);
  const timestamp = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare(`
      UPDATE financial_movements SET status = 'CANCELLED', cancelled_at = ?, cancelled_by = ?,
        cancellation_reason = ?, version = version + 1, updated_at = ?
      WHERE tenant_id = ? AND id = ? AND version = ?
    `).bind(timestamp, c.get("auth").id, input.reason, timestamp, tenant, id, input.expectedVersion),
    auditStatement(c.env.DB, {
      tenantId: tenant, actorUserId: c.get("auth").id, entityType: "financial_movement", entityId: id,
      action: "CANCEL", before: movement, after: { status: "CANCELLED" }, reason: input.reason,
      requestId: c.get("requestId"), createdAt: timestamp,
    }),
  ]);
  return c.json({ ok: true });
});

const linkTransferSchema = z.object({ sourceMovementId: z.uuid(), targetMovementId: z.uuid() });
movements.post("/links/internal-transfer", requireRoles("ADMIN", "OPERATOR"), async (c) => {
  const tenant = tenantId(c);
  const input = await parseJson(c, linkTransferSchema);
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT INTO movement_links (id, tenant_id, link_type, source_movement_id, target_movement_id, created_by, created_at)
      VALUES (?, ?, 'INTERNAL_TRANSFER', ?, ?, ?, ?)
    `).bind(id, tenant, input.sourceMovementId, input.targetMovementId, c.get("auth").id, timestamp),
    auditStatement(c.env.DB, {
      tenantId: tenant, actorUserId: c.get("auth").id, entityType: "movement_link", entityId: id,
      action: "CREATE_INTERNAL_TRANSFER", after: input, requestId: c.get("requestId"), createdAt: timestamp,
    }),
  ]);
  return c.json({ id }, 201);
});

export default movements;
