import { z } from "zod";

export const roleSchema = z.enum(["SUPER_ADMIN", "ADMIN", "OPERATOR", "VIEWER"]);
export type Role = z.infer<typeof roleSchema>;

export const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(8).max(200),
});

export const bootstrapSchema = z.object({
  email: z.email().max(254),
  displayName: z.string().trim().min(2).max(120),
  password: z.string().min(12).max(200),
});

export const createUserSchema = z.object({
  email: z.email().max(254),
  displayName: z.string().trim().min(2).max(120),
  password: z.string().min(12).max(200),
  role: z.enum(["ADMIN", "OPERATOR", "VIEWER"]),
});

export type AuthUser = {
  id: string;
  tenantId: string | null;
  email: string;
  displayName: string;
  role: Role;
};
