import { z } from "zod";

export const uuidSchema = z.string().uuid();
export const dateSchema = z.iso.date();
export const instantSchema = z.iso.datetime({ offset: true });
export const moneyCentsSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const signedMoneyCentsSchema = z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type ApiError = {
  error: {
    code: string;
    message: string;
    fieldErrors?: Record<string, string[]>;
    requestId: string;
  };
};

export type Paginated<T> = {
  items: T[];
  nextCursor: string | null;
};
