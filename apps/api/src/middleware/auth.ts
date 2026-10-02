import type { Role } from "@blexo/contracts";
import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { AppError, forbidden } from "../errors";
import { hashToken } from "../security/tokens";
import type { AppEnv } from "../types";

type SessionRow = {
  user_id: string;
  tenant_id: string | null;
  email: string;
  display_name: string;
  role: Role;
  session_id: string;
};

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, "blexo_session");
  if (!token) throw new AppError(401, "UNAUTHENTICATED", "Faça login para continuar.");
  const tokenHash = await hashToken(token, c.env.SESSION_SECRET);
  const row = await c.env.DB.prepare(`
    SELECT
      u.id AS user_id, u.tenant_id, u.email, u.display_name, u.role,
      s.id AS session_id
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
      AND s.revoked_at IS NULL
      AND s.expires_at > ?
      AND u.status = 'ACTIVE'
    LIMIT 1
  `).bind(tokenHash, new Date().toISOString()).first<SessionRow>();
  if (!row) throw new AppError(401, "SESSION_EXPIRED", "Sua sessão expirou. Faça login novamente.");
  c.set("auth", {
    id: row.user_id,
    tenantId: row.tenant_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
  });
  c.executionCtx.waitUntil(c.env.DB.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), row.session_id).run());
  await next();
});

export function requireRoles(...roles: Role[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    if (!roles.includes(c.get("auth").role)) forbidden();
    await next();
  });
}
