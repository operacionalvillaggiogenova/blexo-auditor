import type { AuthUser } from "@blexo/contracts";

export type Bindings = {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  APP_ENV: string;
  BOOTSTRAP_TOKEN: string;
  SESSION_SECRET: string;
};

export type Variables = {
  auth: AuthUser;
  requestId: string;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: Variables;
};
