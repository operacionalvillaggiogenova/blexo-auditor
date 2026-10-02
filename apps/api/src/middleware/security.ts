import { createMiddleware } from "hono/factory";
import { AppError } from "../errors";
import type { AppEnv } from "../types";

export const requestContext = createMiddleware<AppEnv>(async (c, next) => {
  const requestId = c.req.header("X-Request-Id") || crypto.randomUUID();
  c.set("requestId", requestId);
  c.header("X-Request-Id", requestId);
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "same-origin");
  c.header("X-Frame-Options", "DENY");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  c.header("Content-Security-Policy", "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'");
  if (c.env.APP_ENV === "production") c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  await next();
});

export const protectOrigin = createMiddleware<AppEnv>(async (c, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(c.req.method)) return next();
  const origin = c.req.header("Origin");
  const host = c.req.header("Host");
  if (origin && host && new URL(origin).host !== host) {
    throw new AppError(403, "INVALID_ORIGIN", "Origem da requisição não autorizada.");
  }
  await next();
});
