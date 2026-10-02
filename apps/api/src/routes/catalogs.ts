import { createChartAccountSchema, createSupplierSchema } from "@blexo/contracts";
import { Hono } from "hono";
import { z } from "zod";
import { auditStatement } from "../audit";
import { conflict, notFound } from "../errors";
import { nowIso, parseJson, tenantId } from "../http";
import { requireAuth, requireRoles } from "../middleware/auth";
import type { AppEnv } from "../types";

const catalogs = new Hono<AppEnv>();
catalogs.use("*", requireAuth);

catalogs.get("/chart-accounts", requireRoles("ADMIN", "OPERATOR", "VIEWER"), async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT id, parent_id, code, name, level, nature, status, version
    FROM chart_accounts WHERE tenant_id = ? ORDER BY code
  `).bind(tenantId(c)).all();
  return c.json({ items: result.results });
});

catalogs.post("/chart-accounts", requireRoles("ADMIN"), async (c) => {
  const tenant = tenantId(c);
  const input = await parseJson(c, createChartAccountSchema);
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT INTO chart_accounts (
        id, tenant_id, parent_id, code, name, level, nature, status, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 1, ?, ?)
    `).bind(id, tenant, input.parentId ?? null, input.code, input.name, input.level, input.nature, timestamp, timestamp),
    auditStatement(c.env.DB, {
      tenantId: tenant, actorUserId: c.get("auth").id, entityType: "chart_account", entityId: id,
      action: "CREATE", after: input, requestId: c.get("requestId"), createdAt: timestamp,
    }),
  ]);
  return c.json({ id }, 201);
});

const updateChartAccountSchema = createChartAccountSchema.partial().extend({
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  expectedVersion: z.number().int().positive(),
});

catalogs.patch("/chart-accounts/:id", requireRoles("ADMIN"), async (c) => {
  const tenant = tenantId(c);
  const id = c.req.param("id");
  const input = await parseJson(c, updateChartAccountSchema);
  const before = await c.env.DB.prepare("SELECT * FROM chart_accounts WHERE tenant_id = ? AND id = ?")
    .bind(tenant, id).first<Record<string, unknown>>();
  if (!before) notFound("Conta contábil não encontrada.");
  if (before.version !== input.expectedVersion) conflict("VERSION_CONFLICT", "A conta foi alterada por outro usuário.");
  const timestamp = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare(`
      UPDATE chart_accounts SET parent_id = COALESCE(?, parent_id), code = COALESCE(?, code),
        name = COALESCE(?, name), level = COALESCE(?, level), nature = COALESCE(?, nature),
        status = COALESCE(?, status), version = version + 1, updated_at = ?
      WHERE tenant_id = ? AND id = ? AND version = ?
    `).bind(input.parentId ?? null, input.code ?? null, input.name ?? null, input.level ?? null,
      input.nature ?? null, input.status ?? null, timestamp, tenant, id, input.expectedVersion),
    auditStatement(c.env.DB, {
      tenantId: tenant, actorUserId: c.get("auth").id, entityType: "chart_account", entityId: id,
      action: "UPDATE", before, after: input, requestId: c.get("requestId"), createdAt: timestamp,
    }),
  ]);
  return c.json({ ok: true });
});

catalogs.get("/suppliers", requireRoles("ADMIN", "OPERATOR", "VIEWER"), async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT id, name, tax_id, category, phone, email, notes, status, version
    FROM suppliers WHERE tenant_id = ? ORDER BY name
  `).bind(tenantId(c)).all();
  return c.json({ items: result.results });
});

catalogs.post("/suppliers", requireRoles("ADMIN", "OPERATOR"), async (c) => {
  const tenant = tenantId(c);
  const input = await parseJson(c, createSupplierSchema);
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT INTO suppliers (
        id, tenant_id, name, tax_id, category, phone, email, notes,
        status, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 1, ?, ?)
    `).bind(id, tenant, input.name, input.taxId ?? null, input.category ?? null, input.phone ?? null,
      input.email ?? null, input.notes ?? null, timestamp, timestamp),
    auditStatement(c.env.DB, {
      tenantId: tenant, actorUserId: c.get("auth").id, entityType: "supplier", entityId: id,
      action: "CREATE", after: input, requestId: c.get("requestId"), createdAt: timestamp,
    }),
  ]);
  return c.json({ id }, 201);
});

const updateSupplierSchema = createSupplierSchema.partial().extend({
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  expectedVersion: z.number().int().positive(),
});

catalogs.patch("/suppliers/:id", requireRoles("ADMIN", "OPERATOR"), async (c) => {
  const tenant = tenantId(c);
  const id = c.req.param("id");
  const input = await parseJson(c, updateSupplierSchema);
  const before = await c.env.DB.prepare("SELECT * FROM suppliers WHERE tenant_id = ? AND id = ?")
    .bind(tenant, id).first<Record<string, unknown>>();
  if (!before) notFound("Fornecedor não encontrado.");
  if (before.version !== input.expectedVersion) conflict("VERSION_CONFLICT", "O fornecedor foi alterado por outro usuário.");
  const timestamp = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare(`
      UPDATE suppliers SET name = COALESCE(?, name), tax_id = COALESCE(?, tax_id),
        category = COALESCE(?, category), phone = COALESCE(?, phone), email = COALESCE(?, email),
        notes = COALESCE(?, notes), status = COALESCE(?, status), version = version + 1, updated_at = ?
      WHERE tenant_id = ? AND id = ? AND version = ?
    `).bind(input.name ?? null, input.taxId ?? null, input.category ?? null, input.phone ?? null,
      input.email ?? null, input.notes ?? null, input.status ?? null, timestamp, tenant, id, input.expectedVersion),
    auditStatement(c.env.DB, {
      tenantId: tenant, actorUserId: c.get("auth").id, entityType: "supplier", entityId: id,
      action: "UPDATE", before, after: input, requestId: c.get("requestId"), createdAt: timestamp,
    }),
  ]);
  return c.json({ ok: true });
});

export default catalogs;
