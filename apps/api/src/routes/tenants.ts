import { createUserSchema } from "@blexo/contracts";
import { Hono } from "hono";
import { z } from "zod";
import { auditStatement } from "../audit";
import { AppError, notFound } from "../errors";
import { nowIso, parseJson } from "../http";
import { requireAuth, requireRoles } from "../middleware/auth";
import { hashPassword } from "../security/password";
import type { AppEnv } from "../types";

const tenants = new Hono<AppEnv>();

const createTenantSchema = z.object({
  name: z.string().trim().min(2).max(160),
  cnpj: z.string().regex(/^\d{14}$/),
  address: z.record(z.string(), z.unknown()).nullable().optional(),
  unitCount: z.number().int().min(0).default(0),
  fiscalYearStartMonth: z.number().int().min(1).max(12).default(1),
  admin: createUserSchema.pick({ email: true, displayName: true, password: true }),
});

tenants.use("*", requireAuth, requireRoles("SUPER_ADMIN"));

tenants.get("/", async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT id, name, cnpj, unit_count, fiscal_year_start_month, status, created_at, updated_at
    FROM tenants
    ORDER BY name
  `).all();
  return c.json({ items: result.results });
});

tenants.post("/", async (c) => {
  const input = await parseJson(c, createTenantSchema);
  const tenantId = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const timestamp = nowIso();
  const passwordHash = await hashPassword(input.admin.password);
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(`
        INSERT INTO tenants (
          id, name, cnpj, address_json, unit_count, fiscal_year_start_month,
          currency_code, date_format, logo_r2_key, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'BRL', 'DD/MM/YYYY', NULL, 'ACTIVE', ?, ?)
      `).bind(
        tenantId,
        input.name,
        input.cnpj,
        input.address ? JSON.stringify(input.address) : null,
        input.unitCount,
        input.fiscalYearStartMonth,
        timestamp,
        timestamp,
      ),
      c.env.DB.prepare(`
        INSERT INTO users (
          id, tenant_id, email, display_name, password_hash, role, status,
          password_changed_at, last_login_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'ADMIN', 'ACTIVE', ?, NULL, ?, ?)
      `).bind(adminId, tenantId, input.admin.email.toLowerCase(), input.admin.displayName, passwordHash, timestamp, timestamp, timestamp),
      auditStatement(c.env.DB, {
        tenantId,
        actorUserId: c.get("auth").id,
        entityType: "tenant",
        entityId: tenantId,
        action: "CREATE",
        after: { name: input.name, cnpj: input.cnpj, adminId },
        requestId: c.get("requestId"),
        ipAddress: c.req.header("CF-Connecting-IP"),
        createdAt: timestamp,
      }),
    ]);
  } catch (error) {
    if (String(error).includes("UNIQUE")) throw new AppError(409, "TENANT_EXISTS", "CNPJ ou e-mail já cadastrado.");
    throw error;
  }
  return c.json({ id: tenantId, adminId }, 201);
});

tenants.get("/:id", async (c) => {
  const row = await c.env.DB.prepare(`
    SELECT id, name, cnpj, address_json, unit_count, fiscal_year_start_month,
           currency_code, date_format, status, created_at, updated_at
    FROM tenants WHERE id = ?
  `).bind(c.req.param("id")).first();
  if (!row) notFound("Condomínio não encontrado.");
  return c.json(row);
});

export default tenants;
