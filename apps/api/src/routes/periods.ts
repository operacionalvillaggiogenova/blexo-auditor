import { closePeriodSchema, reopenPeriodSchema } from "@blexo/contracts";
import { Hono } from "hono";
import { auditStatement } from "../audit";
import { AppError, conflict, notFound } from "../errors";
import { nowIso, parseJson, tenantId } from "../http";
import { requireAuth, requireRoles } from "../middleware/auth";
import type { AppEnv } from "../types";

const periods = new Hono<AppEnv>();
periods.use("*", requireAuth);

periods.get("/", requireRoles("ADMIN", "OPERATOR", "VIEWER"), async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT pc.*, cb.display_name AS closed_by_name, rb.display_name AS reopened_by_name
    FROM period_closings pc
    LEFT JOIN users cb ON cb.tenant_id = pc.tenant_id AND cb.id = pc.closed_by
    LEFT JOIN users rb ON rb.tenant_id = pc.tenant_id AND rb.id = pc.reopened_by
    WHERE pc.tenant_id = ? ORDER BY fiscal_year DESC, month_number DESC
  `).bind(tenantId(c)).all();
  return c.json({ items: result.results });
});

async function periodWarnings(db: D1Database, tenant: string, year: number, month: number) {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const row = await db.prepare(`
    SELECT
      SUM(CASE WHEN fm.status = 'ACTIVE' AND NOT EXISTS (
        SELECT 1 FROM movement_allocations ma WHERE ma.tenant_id = fm.tenant_id AND ma.financial_movement_id = fm.id
      ) THEN 1 ELSE 0 END) AS unclassified_count,
      SUM(CASE WHEN fm.status = 'ACTIVE' AND NOT EXISTS (
        SELECT 1 FROM evidences e WHERE e.tenant_id = fm.tenant_id AND e.financial_movement_id = fm.id AND e.status = 'ACTIVE' AND e.is_valid_evidence = 1
      ) THEN 1 ELSE 0 END) AS without_evidence_count,
      COUNT(CASE WHEN fm.status = 'ACTIVE' THEN 1 END) AS active_count
    FROM financial_movements fm WHERE fm.tenant_id = ? AND substr(fm.accounting_date, 1, 7) = ?
  `).bind(tenant, prefix).first<Record<string, number>>();
  return {
    unclassifiedCount: row?.unclassified_count ?? 0,
    withoutEvidenceCount: row?.without_evidence_count ?? 0,
    activeCount: row?.active_count ?? 0,
  };
}

periods.get("/:year/:month/check", requireRoles("ADMIN", "OPERATOR", "VIEWER"), async (c) => {
  const year = Number(c.req.param("year"));
  const month = Number(c.req.param("month"));
  if (!Number.isInteger(year) || year < 2000 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new AppError(422, "INVALID_PERIOD", "Período inválido.");
  }
  return c.json({ warnings: await periodWarnings(c.env.DB, tenantId(c), year, month) });
});

periods.post("/close", requireRoles("ADMIN"), async (c) => {
  const tenant = tenantId(c);
  const input = await parseJson(c, closePeriodSchema);
  const existing = await c.env.DB.prepare("SELECT * FROM period_closings WHERE tenant_id = ? AND fiscal_year = ? AND month_number = ?")
    .bind(tenant, input.fiscalYear, input.monthNumber).first<Record<string, unknown>>();
  if (existing?.status === "CLOSED") conflict("PERIOD_ALREADY_CLOSED", "Este período já está fechado.");
  const warnings = await periodWarnings(c.env.DB, tenant, input.fiscalYear, input.monthNumber);
  if (!input.force && (warnings.unclassifiedCount > 0 || warnings.withoutEvidenceCount > 0)) {
    throw new AppError(409, "PERIOD_HAS_WARNINGS", "Há pendências no período. Revise-as ou confirme o fechamento forçado.");
  }
  const timestamp = nowIso();
  const id = typeof existing?.id === "string" ? existing.id : crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT INTO period_closings (id, tenant_id, fiscal_year, month_number, status, warning_snapshot_json,
        close_reason, closed_by, closed_at, reopened_by, reopened_at, reopen_reason, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'CLOSED', ?, ?, ?, ?, NULL, NULL, NULL, 1, ?, ?)
      ON CONFLICT(tenant_id, fiscal_year, month_number) DO UPDATE SET
        status = 'CLOSED', warning_snapshot_json = excluded.warning_snapshot_json, close_reason = excluded.close_reason,
        closed_by = excluded.closed_by, closed_at = excluded.closed_at, reopened_by = NULL, reopened_at = NULL,
        reopen_reason = NULL, version = period_closings.version + 1, updated_at = excluded.updated_at
    `).bind(id, tenant, input.fiscalYear, input.monthNumber, JSON.stringify(warnings), input.reason ?? null,
      c.get("auth").id, timestamp, timestamp, timestamp),
    auditStatement(c.env.DB, {
      tenantId: tenant, actorUserId: c.get("auth").id, entityType: "period_closing", entityId: id,
      action: "CLOSE", before: existing, after: { ...input, warnings }, reason: input.reason ?? undefined,
      requestId: c.get("requestId"), createdAt: timestamp,
    }),
  ]);
  return c.json({ id, warnings });
});

periods.post("/:id/reopen", requireRoles("ADMIN"), async (c) => {
  const tenant = tenantId(c);
  const id = c.req.param("id");
  const input = await parseJson(c, reopenPeriodSchema);
  const before = await c.env.DB.prepare("SELECT * FROM period_closings WHERE tenant_id = ? AND id = ?")
    .bind(tenant, id).first<Record<string, unknown>>();
  if (!before) notFound("Fechamento não encontrado.");
  if (before.status !== "CLOSED") conflict("PERIOD_NOT_CLOSED", "O período já está aberto.");
  if (before.version !== input.expectedVersion) conflict("VERSION_CONFLICT", "O fechamento foi alterado por outro usuário.");
  const timestamp = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare(`
      UPDATE period_closings SET status = 'OPEN', reopened_by = ?, reopened_at = ?, reopen_reason = ?,
        version = version + 1, updated_at = ? WHERE tenant_id = ? AND id = ? AND version = ?
    `).bind(c.get("auth").id, timestamp, input.reason, timestamp, tenant, id, input.expectedVersion),
    auditStatement(c.env.DB, {
      tenantId: tenant, actorUserId: c.get("auth").id, entityType: "period_closing", entityId: id,
      action: "REOPEN", before, after: { status: "OPEN" }, reason: input.reason,
      requestId: c.get("requestId"), createdAt: timestamp,
    }),
  ]);
  return c.json({ ok: true, version: input.expectedVersion + 1 });
});

export default periods;
