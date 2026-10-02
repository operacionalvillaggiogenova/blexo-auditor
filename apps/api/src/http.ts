import { z } from "zod";
import type { Context } from "hono";
import { AppError } from "./errors";
import type { AppEnv } from "./types";

export async function parseJson<T>(c: Context<AppEnv>, schema: z.ZodType<T>): Promise<T> {
  let value: unknown;
  try {
    value = await c.req.json();
  } catch {
    throw new AppError(400, "INVALID_JSON", "O corpo da requisição não contém JSON válido.");
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "root";
      fieldErrors[key] ??= [];
      fieldErrors[key].push(issue.message);
    }
    throw new AppError(422, "VALIDATION_ERROR", "Revise os campos informados.", fieldErrors);
  }
  return result.data;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function dateYear(date: string): number {
  return Number(date.slice(0, 4));
}

export function tenantId(c: Context<AppEnv>): string {
  const tenant = c.get("auth").tenantId;
  if (!tenant) throw new AppError(403, "TENANT_REQUIRED", "Esta operação exige um condomínio ativo.");
  return tenant;
}

export function decodeCursor(cursor: string | undefined): string | null {
  if (!cursor) return null;
  try {
    return atob(cursor);
  } catch {
    throw new AppError(400, "INVALID_CURSOR", "Cursor de paginação inválido.");
  }
}

export function encodeCursor(value: string | undefined): string | null {
  return value ? btoa(value) : null;
}
