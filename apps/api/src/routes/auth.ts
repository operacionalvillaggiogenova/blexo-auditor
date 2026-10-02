import { bootstrapSchema, loginSchema } from "@blexo/contracts";
import { deleteCookie, setCookie } from "hono/cookie";
import { Hono } from "hono";
import { AppError } from "../errors";
import { nowIso, parseJson } from "../http";
import { requireAuth } from "../middleware/auth";
import { assertRateLimit, requestIp } from "../rate-limit";
import { hashPassword, verifyPassword } from "../security/password";
import { createOpaqueToken, hashToken, safeStringEqual } from "../security/tokens";
import type { AppEnv } from "../types";

type LoginRow = {
  id: string;
  tenant_id: string | null;
  email: string;
  display_name: string;
  password_hash: string;
  role: "SUPER_ADMIN" | "ADMIN" | "OPERATOR" | "VIEWER";
};

const auth = new Hono<AppEnv>();

function sessionCookieOptions(c: Parameters<typeof setCookie>[0]) {
  return {
    httpOnly: true,
    secure: c.env.APP_ENV === "production",
    sameSite: "Strict" as const,
    path: "/",
    maxAge: 60 * 60 * 12,
  };
}

auth.post("/bootstrap", async (c) => {
  await assertRateLimit(c.env.DB, "bootstrap", requestIp(c.req.raw.headers), 5, 60 * 60);
  const providedToken = c.req.header("X-Bootstrap-Token") ?? "";
  if (!c.env.BOOTSTRAP_TOKEN || !safeStringEqual(providedToken, c.env.BOOTSTRAP_TOKEN)) {
    throw new AppError(403, "INVALID_BOOTSTRAP_TOKEN", "Token de inicialização inválido.");
  }
  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1").first();
  if (existing) throw new AppError(409, "ALREADY_BOOTSTRAPPED", "A plataforma já possui um super administrador.");
  const input = await parseJson(c, bootstrapSchema);
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  const passwordHash = await hashPassword(input.password);
  await c.env.DB.prepare(`
    INSERT INTO users (
      id, tenant_id, email, display_name, password_hash, role, status,
      password_changed_at, last_login_at, created_at, updated_at
    ) VALUES (?, NULL, ?, ?, ?, 'SUPER_ADMIN', 'ACTIVE', ?, NULL, ?, ?)
  `).bind(id, input.email.toLowerCase(), input.displayName, passwordHash, timestamp, timestamp, timestamp).run();
  return c.json({ id, email: input.email.toLowerCase(), role: "SUPER_ADMIN" }, 201);
});

auth.post("/login", async (c) => {
  const input = await parseJson(c, loginSchema);
  const ip = requestIp(c.req.raw.headers);
  await Promise.all([
    assertRateLimit(c.env.DB, "login-ip", ip, 30, 15 * 60),
    assertRateLimit(c.env.DB, "login-account", `${ip}:${input.email.toLowerCase()}`, 10, 15 * 60),
  ]);
  const row = await c.env.DB.prepare(`
    SELECT id, tenant_id, email, display_name, password_hash, role
    FROM users
    WHERE email = ? COLLATE NOCASE AND status = 'ACTIVE'
    LIMIT 1
  `).bind(input.email).first<LoginRow>();
  if (!row || !(await verifyPassword(input.password, row.password_hash))) {
    throw new AppError(401, "INVALID_CREDENTIALS", "E-mail ou senha inválidos.");
  }
  const token = createOpaqueToken();
  const tokenHash = await hashToken(token, c.env.SESSION_SECRET);
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT INTO sessions (
        id, user_id, token_hash, ip_address, user_agent,
        last_seen_at, expires_at, revoked_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)
    `).bind(
      id,
      row.id,
      tokenHash,
      c.req.header("CF-Connecting-IP") ?? null,
      c.req.header("User-Agent") ?? null,
      timestamp,
      expiresAt,
      timestamp,
    ),
    c.env.DB.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?")
      .bind(timestamp, timestamp, row.id),
  ]);
  setCookie(c, "blexo_session", token, sessionCookieOptions(c));
  return c.json({
    user: {
      id: row.id,
      tenantId: row.tenant_id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
    },
  });
});

auth.post("/logout", requireAuth, async (c) => {
  const token = c.req.header("Cookie")?.match(/(?:^|;\s*)blexo_session=([^;]+)/)?.[1];
  if (token) {
    const tokenHash = await hashToken(decodeURIComponent(token), c.env.SESSION_SECRET);
    await c.env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL")
      .bind(nowIso(), tokenHash).run();
  }
  deleteCookie(c, "blexo_session", { path: "/" });
  return c.json({ ok: true });
});

auth.get("/me", requireAuth, (c) => c.json({ user: c.get("auth") }));

export default auth;
