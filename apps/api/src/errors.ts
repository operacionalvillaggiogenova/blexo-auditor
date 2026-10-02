import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppEnv } from "./types";

export class AppError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: string,
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export function notFound(message = "Recurso não encontrado"): never {
  throw new AppError(404, "NOT_FOUND", message);
}

export function conflict(code: string, message: string): never {
  throw new AppError(409, code, message);
}

export function forbidden(message = "Você não possui permissão para esta ação"): never {
  throw new AppError(403, "FORBIDDEN", message);
}

export function handleError(error: Error, c: Context<AppEnv>) {
  const requestId = c.get("requestId") || crypto.randomUUID();
  if (error instanceof AppError) {
    return c.json({
      error: {
        code: error.code,
        message: error.message,
        fieldErrors: error.fieldErrors,
        requestId,
      },
    }, error.status);
  }
  console.error(JSON.stringify({ requestId, error: error.message, stack: error.stack }));
  return c.json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Ocorreu um erro inesperado.",
      requestId,
    },
  }, 500);
}
