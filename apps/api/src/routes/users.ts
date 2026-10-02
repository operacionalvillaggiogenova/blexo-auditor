import { createUserSchema } from "@blexo/contracts";
import { Hono } from "hono";
import { z } from "zod";
import { auditStatement } from "../audit";
import { AppError, notFound } from "../errors";
import { nowIso, parseJson, tenantId } from "../http";
import { requireAuth, requireRoles } from "../middleware/auth";
import { hashPassword } from "../security/password";
import type { AppEnv } from "../types";

const users = new Hono<AppEnv>();
users.use("*", requireAuth, requireRoles("ADMIN"));

users.get("/", async (c) => {
  const tenant = tenantId(c);
  const result = await c.env.DB.prepare(`
    SELECT id, email, display_name, role, status, last_login_at, created_at, updated_at
    FROM users WHERE tenant_id = ? ORDER BY display_name
  `).bind(tenant).all();
  return c.json({ items: result.results });
});

users.post("/", async (c) => {
  const tenant = tenantId(c);
  const input = await parseJson(c, createUserSchema);
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  const passwordHash = await hashPassword(input.password);
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(`
        INSERT INTO users (
          id, tenant_id, email, display_name, password_hash, role, status,
          password_changed_at, last_login_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, NULL, ?, ?)
      `).bind(id, tenant, input.email.toLowerCase(), input.displayName, passwordHash, input.role, timestamp, timestamp, timestamp),
      auditStatement(c.env.DB, {
        tenantId: tenant,
        actorUserId: c.get("auth").id,
        entityType: "user",
        entityId: id,
        action: "CREATE",
        after: { email: input.email.toLowerCase(), displayName: input.displayName, role: input.role },
        requestId: c.get("requestId"),
        createdAt: timestamp,
      }),
    ]);
  } catch (error) {
    if (String(error).includes("UNIQUE")) throw new AppError(409, "EMAIL_EXISTS", "E-mail já cadastrado.");
    throw error;
  }
  return c.json({ id }, 201);
});

const updateUserSchema = z.object({
  displayName: z.string().trim().min(2).max(120).optional(),
  role: z.enum(["ADMIN", "OPERATOR", "VIEWER"]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

users.patch("/:id", async (c) => {
  const tenant = tenantId(c);
  const id = c.req.param("id");
  const input = await parseJson(c, updateUserSchema);
  const before = await c.env.DB.prepare("SELECT id, display_name, role, status FROM users WHERE tenant_id = ? AND id = ?")
    .bind(tenant, id).first<Record<string, unknown>>();
  if (!before) notFound("Usuário não encontrado.");
  const timestamp = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare(`
      UPDATE users SET
        display_name = COALESCE(?, display_name),
        role = COALESCE(?, role),
        status = COALESCE(?, status),
        updated_at = ?
      WHERE tenant_id = ? AND id = ?
    `).bind(input.displayName ?? null, input.role ?? null, input.status ?? null, timestamp, tenant, id),
    auditStatement(c.env.DB, {
      tenantId: tenant,
      actorUserId: c.get("auth").id,
      entityType: "user",
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

users.post("/:id/revoke-sessions", async (c) => {
  const tenant = tenantId(c);
  const id = c.req.param("id");
  const user = await c.env.DB.prepare("SELECT id FROM users WHERE tenant_id = ? AND id = ?").bind(tenant, id).first();
  if (!user) notFound("Usuário não encontrado.");
  await c.env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL")
    .bind(nowIso(), id).run();
  return c.json({ ok: true });
});

export default users;
