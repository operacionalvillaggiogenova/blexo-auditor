import { sha256Hex } from "./crypto";
import { AppError } from "./errors";

export async function assertRateLimit(
  db: D1Database,
  scope: string,
  key: string,
  maximum: number,
  windowSeconds: number,
): Promise<void> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const bucketStart = Math.floor(nowSeconds / windowSeconds) * windowSeconds;
  const keyHash = await sha256Hex(`${scope}:${key}`);
  const expiresAt = new Date((bucketStart + windowSeconds + 60) * 1000).toISOString();
  const row = await db.prepare(`
    INSERT INTO security_rate_limits (scope, key_hash, bucket_start, request_count, expires_at)
    VALUES (?, ?, ?, 1, ?)
    ON CONFLICT(scope, key_hash, bucket_start)
    DO UPDATE SET request_count = request_count + 1
    RETURNING request_count
  `).bind(scope, keyHash, bucketStart, expiresAt).first<{ request_count: number }>();
  if (Number(row?.request_count ?? 1) > maximum) {
    throw new AppError(429, "RATE_LIMITED", "Muitas tentativas. Aguarde alguns minutos e tente novamente.");
  }
}

export function requestIp(headers: Headers): string {
  return headers.get("CF-Connecting-IP")
    ?? headers.get("X-Forwarded-For")?.split(",")[0]?.trim()
    ?? "local";
}
