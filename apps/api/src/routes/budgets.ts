import { createBudgetSchema, createBudgetVersionSchema } from "@blexo/contracts";
import { Hono } from "hono";
import { auditStatement } from "../audit";
import { AppError, conflict, notFound } from "../errors";
import { nowIso, parseJson, tenantId } from "../http";
import { requireAuth, requireRoles } from "../middleware/auth";
import type { AppEnv } from "../types";

const budgets = new Hono<AppEnv>();
budgets.use("*", requireAuth);

budgets.get("/", requireRoles("ADMIN", "OPERATOR", "VIEWER"), async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT b.id, b.fiscal_year, b.name, b.status, b.created_at,
      bv.id AS approved_version_id, bv.version_number AS approved_version_number,
      (SELECT COUNT(*) FROM budget_versions x WHERE x.tenant_id = b.tenant_id AND x.budget_id = b.id) AS version_count
    FROM budgets b LEFT JOIN budget_versions bv
      ON bv.tenant_id = b.tenant_id AND bv.budget_id = b.id AND bv.status = 'APPROVED'
    WHERE b.tenant_id = ? ORDER BY b.fiscal_year DESC
  `).bind(tenantId(c)).all();
  return c.json({ items: result.results });
});

budgets.post("/", requireRoles("ADMIN"), async (c) => {
  const tenant = tenantId(c);
  const input = await parseJson(c, createBudgetSchema);
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO budgets (id, tenant_id, fiscal_year, name, status, created_by, created_at) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)")
      .bind(id, tenant, input.fiscalYear, input.name, c.get("auth").id, timestamp),
    auditStatement(c.env.DB, {
      tenantId: tenant, actorUserId: c.get("auth").id, entityType: "budget", entityId: id,
      action: "CREATE", after: input, requestId: c.get("requestId"), createdAt: timestamp,
    }),
  ]);
  return c.json({ id }, 201);
});

budgets.get("/:id", requireRoles("ADMIN", "OPERATOR", "VIEWER"), async (c) => {
  const tenant = tenantId(c);
  const budget = await c.env.DB.prepare("SELECT * FROM budgets WHERE tenant_id = ? AND id = ?")
    .bind(tenant, c.req.param("id")).first();
  if (!budget) notFound("Orçamento não encontrado.");
  const versions = await c.env.DB.prepare(`
    SELECT bv.*, u.display_name AS approved_by_name,
      COALESCE((SELECT SUM(amount_cents) FROM budget_items bi WHERE bi.tenant_id = bv.tenant_id AND bi.budget_version_id = bv.id), 0) AS total_cents
    FROM budget_versions bv LEFT JOIN users u ON u.tenant_id = bv.tenant_id AND u.id = bv.approved_by
    WHERE bv.tenant_id = ? AND bv.budget_id = ? ORDER BY bv.version_number DESC
  `).bind(tenant, c.req.param("id")).all();
  return c.json({ ...budget, versions: versions.results });
});

budgets.post("/:id/versions", requireRoles("ADMIN"), async (c) => {
  const tenant = tenantId(c);
  const budgetId = c.req.param("id");
  const input = await parseJson(c, createBudgetVersionSchema);
  const budget = await c.env.DB.prepare("SELECT id FROM budgets WHERE tenant_id = ? AND id = ? AND status = 'ACTIVE'")
    .bind(tenant, budgetId).first();
  if (!budget) notFound("Orçamento não encontrado.");
  const accountIds = [...new Set(input.items.map((item) => item.chartAccountId))];
  const placeholders = accountIds.map(() => "?").join(",");
  const found = await c.env.DB.prepare(`SELECT COUNT(*) AS count FROM chart_accounts WHERE tenant_id = ? AND status = 'ACTIVE' AND id IN (${placeholders})`)
    .bind(tenant, ...accountIds).first<{ count: number }>();
  if ((found?.count ?? 0) !== accountIds.length) throw new AppError(422, "INVALID_CHART_ACCOUNT", "Uma ou mais contas contábeis são inválidas.");
  const existingKeys = new Set<string>();
  for (const item of input.items) {
    const key = `${item.chartAccountId}:${item.monthNumber}`;
    if (existingKeys.has(key)) throw new AppError(422, "DUPLICATE_BUDGET_ITEM", "A mesma conta e mês não podem ser repetidos.");
    existingKeys.add(key);
  }
  const current = await c.env.DB.prepare("SELECT COALESCE(MAX(version_number), 0) AS value FROM budget_versions WHERE tenant_id = ? AND budget_id = ?")
    .bind(tenant, budgetId).first<{ value: number }>();
  const versionNumber = (current?.value ?? 0) + 1;
  const versionId = crypto.randomUUID();
  const timestamp = nowIso();
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(`
      INSERT INTO budget_versions (id, tenant_id, budget_id, version_number, version_type, status, reason, approved_by, approved_at, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, NULL, NULL, ?, ?)
    `).bind(versionId, tenant, budgetId, versionNumber, input.versionType, input.reason ?? null, c.get("auth").id, timestamp),
  ];
  input.items.forEach((item) => statements.push(c.env.DB.prepare(`
    INSERT INTO budget_items (id, tenant_id, budget_version_id, chart_account_id, month_number, amount_cents, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), tenant, versionId, item.chartAccountId, item.monthNumber, item.amountCents, timestamp)));
  statements.push(auditStatement(c.env.DB, {
    tenantId: tenant, actorUserId: c.get("auth").id, entityType: "budget_version", entityId: versionId,
    action: "CREATE_DRAFT", after: { ...input, items: `${input.items.length} itens` },
    requestId: c.get("requestId"), createdAt: timestamp,
  }));
  await c.env.DB.batch(statements);
  return c.json({ id: versionId, versionNumber }, 201);
});

budgets.get("/:budgetId/versions/:versionId/items", requireRoles("ADMIN", "OPERATOR", "VIEWER"), async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT bi.id, bi.month_number, bi.amount_cents, ca.id AS chart_account_id, ca.code, ca.name, ca.nature
    FROM budget_items bi JOIN budget_versions bv ON bv.tenant_id = bi.tenant_id AND bv.id = bi.budget_version_id
    JOIN chart_accounts ca ON ca.tenant_id = bi.tenant_id AND ca.id = bi.chart_account_id
    WHERE bi.tenant_id = ? AND bv.budget_id = ? AND bi.budget_version_id = ? ORDER BY ca.code, bi.month_number
  `).bind(tenantId(c), c.req.param("budgetId"), c.req.param("versionId")).all();
  return c.json({ items: result.results });
});

budgets.post("/:budgetId/versions/:versionId/approve", requireRoles("ADMIN"), async (c) => {
  const tenant = tenantId(c);
  const budgetId = c.req.param("budgetId");
  const versionId = c.req.param("versionId");
  const version = await c.env.DB.prepare("SELECT * FROM budget_versions WHERE tenant_id = ? AND budget_id = ? AND id = ?")
    .bind(tenant, budgetId, versionId).first<Record<string, unknown>>();
  if (!version) notFound("Versão de orçamento não encontrada.");
  if (version.status !== "DRAFT") conflict("BUDGET_NOT_DRAFT", "Somente uma versão em rascunho pode ser aprovada.");
  const timestamp = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE budget_versions SET status = 'SUPERSEDED' WHERE tenant_id = ? AND budget_id = ? AND status = 'APPROVED'").bind(tenant, budgetId),
    c.env.DB.prepare("UPDATE budget_versions SET status = 'APPROVED', approved_by = ?, approved_at = ? WHERE tenant_id = ? AND id = ? AND status = 'DRAFT'")
      .bind(c.get("auth").id, timestamp, tenant, versionId),
    auditStatement(c.env.DB, {
      tenantId: tenant, actorUserId: c.get("auth").id, entityType: "budget_version", entityId: versionId,
      action: "APPROVE", before: version, after: { status: "APPROVED" }, requestId: c.get("requestId"), createdAt: timestamp,
    }),
  ]);
  return c.json({ ok: true });
});

export default budgets;
