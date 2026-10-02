import { Hono } from "hono";
import { handleError } from "./errors";
import { protectOrigin, requestContext } from "./middleware/security";
import accounts from "./routes/bank-accounts";
import auth from "./routes/auth";
import budgets from "./routes/budgets";
import catalogs from "./routes/catalogs";
import evidences from "./routes/evidences";
import funds from "./routes/funds";
import imports from "./routes/imports";
import movements from "./routes/movements";
import periods from "./routes/periods";
import reports from "./routes/reports";
import tenants from "./routes/tenants";
import users from "./routes/users";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();
app.use("*", requestContext);
app.use("/api/*", protectOrigin);

app.get("/api/health", (c) => c.json({ ok: true, service: "blexo-auditor", environment: c.env.APP_ENV }));
app.route("/api/auth", auth);
app.route("/api/tenants", tenants);
app.route("/api/users", users);
app.route("/api/bank-accounts", accounts);
app.route("/api", catalogs);
app.route("/api/imports", imports);
app.route("/api/movements", movements);
app.route("/api/evidences", evidences);
app.route("/api/funds", funds);
app.route("/api/budgets", budgets);
app.route("/api/periods", periods);
app.route("/api/reports", reports);

app.notFound(async (c) => {
  if (c.req.path.startsWith("/api/")) return c.json({ error: { code: "NOT_FOUND", message: "Rota não encontrada.", requestId: c.get("requestId") } }, 404);
  return c.env.ASSETS.fetch(c.req.raw);
});
app.onError(handleError);

export default app;
