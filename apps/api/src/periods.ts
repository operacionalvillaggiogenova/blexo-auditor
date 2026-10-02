import { AppError } from "./errors";

export async function assertPeriodOpen(db: D1Database, tenantId: string, accountingDate: string): Promise<void> {
  const year = Number(accountingDate.slice(0, 4));
  const month = Number(accountingDate.slice(5, 7));
  const row = await db.prepare(`
    SELECT status FROM period_closings
    WHERE tenant_id = ? AND fiscal_year = ? AND month_number = ?
  `).bind(tenantId, year, month).first<{ status: string }>();
  if (row?.status === "CLOSED") {
    throw new AppError(409, "MOVEMENT_PERIOD_CLOSED", "O período informado está fechado.");
  }
}
