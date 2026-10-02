import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Hono } from "hono";
import { AppError } from "../errors";
import { tenantId } from "../http";
import { requireAuth, requireRoles } from "../middleware/auth";
import type { AppEnv } from "../types";

const reports = new Hono<AppEnv>();
reports.use("*", requireAuth);

function monthRange(value?: string): { from: string; to: string; period: string } {
  const period = value && /^\d{4}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 7);
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  if (month < 1 || month > 12) throw new AppError(422, "INVALID_PERIOD", "Período inválido.");
  const from = `${period}-01`;
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return { from, to: next, period };
}

function safePdfText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "?");
}

reports.get("/dashboard", requireRoles("ADMIN", "OPERATOR", "VIEWER"), async (c) => {
  const tenant = tenantId(c);
  const { from, to, period } = monthRange(c.req.query("period"));
  const [summary, accounts, recent, budget] = await Promise.all([
    c.env.DB.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'ACTIVE' AND direction = 'CREDIT' THEN amount_cents ELSE 0 END), 0) AS credits_cents,
        COALESCE(SUM(CASE WHEN status = 'ACTIVE' AND direction = 'DEBIT' THEN amount_cents ELSE 0 END), 0) AS debits_cents,
        SUM(CASE WHEN status = 'ACTIVE' AND NOT EXISTS (SELECT 1 FROM movement_allocations ma WHERE ma.tenant_id = financial_movements.tenant_id AND ma.financial_movement_id = financial_movements.id) THEN 1 ELSE 0 END) AS unclassified_count,
        COALESCE(SUM(CASE WHEN status = 'ACTIVE' AND NOT EXISTS (SELECT 1 FROM movement_allocations ma WHERE ma.tenant_id = financial_movements.tenant_id AND ma.financial_movement_id = financial_movements.id) THEN amount_cents ELSE 0 END), 0) AS unclassified_value_cents,
        SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS active_count,
        SUM(CASE WHEN status = 'ACTIVE' AND NOT EXISTS (SELECT 1 FROM evidences e WHERE e.tenant_id = financial_movements.tenant_id AND e.financial_movement_id = financial_movements.id AND e.status = 'ACTIVE' AND e.is_valid_evidence = 1) THEN 1 ELSE 0 END) AS without_evidence_count
      FROM financial_movements WHERE tenant_id = ? AND accounting_date >= ? AND accounting_date < ?
    `).bind(tenant, from, to).first(),
    c.env.DB.prepare(`
      SELECT ba.id, ba.description, ba.bank_code,
        ba.opening_balance_cents + COALESCE(SUM(CASE WHEN fm.status = 'ACTIVE' THEN CASE WHEN fm.direction = 'CREDIT' THEN fm.amount_cents ELSE -fm.amount_cents END ELSE 0 END), 0) AS balance_cents,
        MAX(fm.accounting_date) AS last_movement_date
      FROM bank_accounts ba LEFT JOIN financial_movements fm ON fm.tenant_id = ba.tenant_id AND fm.bank_account_id = ba.id
      WHERE ba.tenant_id = ? AND ba.status = 'ACTIVE' GROUP BY ba.id ORDER BY ba.description
    `).bind(tenant).all(),
    c.env.DB.prepare(`
      SELECT public_number, accounting_date, direction, amount_cents, description, source_type
      FROM financial_movements WHERE tenant_id = ? AND status = 'ACTIVE'
      ORDER BY accounting_date DESC, public_number DESC LIMIT 8
    `).bind(tenant).all(),
    c.env.DB.prepare(`
      SELECT
        (SELECT COALESCE(SUM(bi.amount_cents), 0) FROM budgets b
          JOIN budget_versions bv ON bv.tenant_id = b.tenant_id AND bv.budget_id = b.id AND bv.status = 'APPROVED'
          JOIN budget_items bi ON bi.tenant_id = bv.tenant_id AND bi.budget_version_id = bv.id
          WHERE b.tenant_id = ? AND b.fiscal_year = ? AND bi.month_number = ?) AS planned_cents,
        (SELECT COALESCE(SUM(ma.amount_cents), 0) FROM movement_allocations ma
          JOIN financial_movements fm ON fm.tenant_id = ma.tenant_id AND fm.id = ma.financial_movement_id
          WHERE ma.tenant_id = ? AND fm.status = 'ACTIVE' AND fm.accounting_date >= ? AND fm.accounting_date < ?
            AND ma.classification_type IN ('INCOME', 'EXPENSE')) AS actual_cents,
        (SELECT COALESCE(SUM(f.opening_balance_cents + COALESCE((
          SELECT SUM(CASE WHEN fm.status = 'ACTIVE' AND fm.direction = 'CREDIT' THEN fm.amount_cents WHEN fm.status = 'ACTIVE' THEN -fm.amount_cents ELSE 0 END)
          FROM fund_movements fm WHERE fm.tenant_id = f.tenant_id AND fm.fund_id = f.id
        ), 0)), 0) FROM funds f WHERE f.tenant_id = ? AND f.status = 'ACTIVE') AS fund_balance_cents
    `).bind(tenant, Number(period.slice(0, 4)), Number(period.slice(5, 7)), tenant, from, to, tenant).first(),
  ]);
  return c.json({ period, summary, accounts: accounts.results, recent: recent.results, budget });
});

async function trialBalance(db: D1Database, tenant: string, from: string, to: string) {
  const rows = await db.prepare(`
    SELECT ca.id, ca.code, ca.name, ca.nature,
      COALESCE(SUM(CASE WHEN fm.status = 'ACTIVE' AND fm.direction = 'CREDIT' THEN ma.amount_cents ELSE 0 END), 0) AS credit_cents,
      COALESCE(SUM(CASE WHEN fm.status = 'ACTIVE' AND fm.direction = 'DEBIT' THEN ma.amount_cents ELSE 0 END), 0) AS debit_cents,
      COALESCE(SUM(CASE WHEN fm.status = 'ACTIVE' THEN CASE WHEN fm.direction = 'CREDIT' THEN ma.amount_cents ELSE -ma.amount_cents END ELSE 0 END), 0) AS net_cents
    FROM chart_accounts ca
    LEFT JOIN movement_allocations ma ON ma.tenant_id = ca.tenant_id AND ma.chart_account_id = ca.id
    LEFT JOIN financial_movements fm ON fm.tenant_id = ma.tenant_id AND fm.id = ma.financial_movement_id
      AND fm.accounting_date >= ? AND fm.accounting_date < ?
    WHERE ca.tenant_id = ? GROUP BY ca.id ORDER BY ca.code
  `).bind(from, to, tenant).all();
  const unclassified = await db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount_cents ELSE 0 END), 0) AS credit_cents,
      COALESCE(SUM(CASE WHEN direction = 'DEBIT' THEN amount_cents ELSE 0 END), 0) AS debit_cents,
      COUNT(*) AS movement_count
    FROM financial_movements fm WHERE tenant_id = ? AND status = 'ACTIVE' AND accounting_date >= ? AND accounting_date < ?
      AND NOT EXISTS (SELECT 1 FROM movement_allocations ma WHERE ma.tenant_id = fm.tenant_id AND ma.financial_movement_id = fm.id)
  `).bind(tenant, from, to).first();
  return { rows: rows.results, unclassified };
}

reports.get("/trial-balance", requireRoles("ADMIN", "OPERATOR", "VIEWER"), async (c) => {
  const { from, to, period } = monthRange(c.req.query("period"));
  return c.json({ period, basis: "ACCOUNTING_DATE", ...await trialBalance(c.env.DB, tenantId(c), from, to) });
});

reports.get("/budget-comparison", requireRoles("ADMIN", "OPERATOR", "VIEWER"), async (c) => {
  const tenant = tenantId(c);
  const { from, to, period } = monthRange(c.req.query("period"));
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  const result = await c.env.DB.prepare(`
    SELECT ca.code, ca.name, ca.nature, COALESCE(bi.amount_cents, 0) AS planned_cents,
      COALESCE(SUM(CASE WHEN fm.status = 'ACTIVE' THEN ma.amount_cents ELSE 0 END), 0) AS actual_cents
    FROM chart_accounts ca
    LEFT JOIN budgets b ON b.tenant_id = ca.tenant_id AND b.fiscal_year = ? AND b.status = 'ACTIVE'
    LEFT JOIN budget_versions bv ON bv.tenant_id = b.tenant_id AND bv.budget_id = b.id AND bv.status = 'APPROVED'
    LEFT JOIN budget_items bi ON bi.tenant_id = bv.tenant_id AND bi.budget_version_id = bv.id AND bi.chart_account_id = ca.id AND bi.month_number = ?
    LEFT JOIN movement_allocations ma ON ma.tenant_id = ca.tenant_id AND ma.chart_account_id = ca.id
    LEFT JOIN financial_movements fm ON fm.tenant_id = ma.tenant_id AND fm.id = ma.financial_movement_id
      AND fm.accounting_date >= ? AND fm.accounting_date < ?
    WHERE ca.tenant_id = ? GROUP BY ca.id ORDER BY ca.code
  `).bind(year, month, from, to, tenant).all();
  return c.json({ period, items: result.results });
});

reports.get("/reconciliation", requireRoles("ADMIN", "OPERATOR", "VIEWER"), async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT ba.id, ba.description, ba.bank_code, ba.opening_balance_cents,
      COALESCE(SUM(CASE WHEN fm.status = 'ACTIVE' AND fm.direction = 'CREDIT' THEN fm.amount_cents WHEN fm.status = 'ACTIVE' THEN -fm.amount_cents ELSE 0 END), 0) AS movement_net_cents,
      ba.opening_balance_cents + COALESCE(SUM(CASE WHEN fm.status = 'ACTIVE' AND fm.direction = 'CREDIT' THEN fm.amount_cents WHEN fm.status = 'ACTIVE' THEN -fm.amount_cents ELSE 0 END), 0) AS financial_balance_cents,
      ba.opening_balance_cents + COALESCE(SUM(CASE WHEN fm.status = 'ACTIVE' AND fm.direction = 'CREDIT' THEN fm.amount_cents WHEN fm.status = 'ACTIVE' THEN -fm.amount_cents ELSE 0 END), 0) AS accounting_balance_cents,
      0 AS difference_cents
    FROM bank_accounts ba LEFT JOIN financial_movements fm ON fm.tenant_id = ba.tenant_id AND fm.bank_account_id = ba.id
    WHERE ba.tenant_id = ? GROUP BY ba.id ORDER BY ba.description
  `).bind(tenantId(c)).all();
  return c.json({ items: result.results, reconciled: true });
});

reports.get("/trial-balance.pdf", requireRoles("ADMIN", "OPERATOR", "VIEWER"), async (c) => {
  const tenant = tenantId(c);
  const { from, to, period } = monthRange(c.req.query("period"));
  const data = await trialBalance(c.env.DB, tenant, from, to);
  const tenantRow = await c.env.DB.prepare("SELECT name, cnpj FROM tenants WHERE id = ?").bind(tenant).first<{ name: string; cnpj: string }>();
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]);
  let y = 795;
  const addLine = (text: string, options: { bold?: boolean; size?: number; color?: ReturnType<typeof rgb> } = {}) => {
    if (y < 48) { page = pdf.addPage([595, 842]); y = 795; }
    page.drawText(safePdfText(text).slice(0, 105), { x: 42, y, size: options.size ?? 9, font: options.bold ? bold : font, color: options.color ?? rgb(0.12, 0.16, 0.18) });
    y -= (options.size ?? 9) + 5;
  };
  addLine("BLEXO | BALANCETE CONTABIL", { bold: true, size: 16, color: rgb(0.02, 0.43, 0.42) });
  addLine(`${tenantRow?.name ?? "Condominio"}  |  CNPJ: ${tenantRow?.cnpj ?? "-"}  |  Periodo: ${period}  |  Base: data contabil`, { size: 10 });
  addLine("Codigo   Conta                                      Debitos       Creditos        Saldo", { bold: true });
  for (const raw of data.rows) {
    const row = raw as { code: string; name: string; debit_cents: number; credit_cents: number; net_cents: number };
    const money = (v: number) => (v / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
    addLine(`${row.code.padEnd(8)} ${row.name.slice(0, 36).padEnd(37)} ${money(row.debit_cents).padStart(12)} ${money(row.credit_cents).padStart(12)} ${money(row.net_cents).padStart(12)}`);
  }
  const bytes = await pdf.save();
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Response(body, {
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="balancete-${period}.pdf"`, "cache-control": "private, no-store" },
  });
});

reports.get("/ledger", requireRoles("ADMIN", "OPERATOR", "VIEWER"), async (c) => {
  const { from, to, period } = monthRange(c.req.query("period"));
  const result = await c.env.DB.prepare(`
    SELECT fm.id, fm.public_number, fm.accounting_date, fm.competence_date, fm.direction, fm.amount_cents,
      fm.description, fm.source_type, fm.status, ba.description AS bank_account_description,
      (SELECT COUNT(*) FROM evidences e WHERE e.tenant_id = fm.tenant_id AND e.financial_movement_id = fm.id AND e.status = 'ACTIVE') AS evidence_count,
      (SELECT COUNT(*) FROM movement_allocations ma WHERE ma.tenant_id = fm.tenant_id AND ma.financial_movement_id = fm.id) AS allocation_count,
      (SELECT COALESCE(SUM(ma.amount_cents), 0) FROM movement_allocations ma WHERE ma.tenant_id = fm.tenant_id AND ma.financial_movement_id = fm.id) AS allocated_cents
    FROM financial_movements fm
    JOIN bank_accounts ba ON ba.tenant_id = fm.tenant_id AND ba.id = fm.bank_account_id
    WHERE fm.tenant_id = ? AND fm.accounting_date >= ? AND fm.accounting_date < ?
    ORDER BY fm.accounting_date, fm.public_number
  `).bind(tenantId(c), from, to).all();
  return c.json({ period, basis: "ACCOUNTING_DATE", items: result.results });
});

reports.get("/evidence-index", requireRoles("ADMIN", "OPERATOR", "VIEWER"), async (c) => {
  const { from, to, period } = monthRange(c.req.query("period"));
  const result = await c.env.DB.prepare(`
    SELECT fm.id AS movement_id, fm.public_number, fm.accounting_date, fm.description, fm.amount_cents, fm.direction,
      e.id AS evidence_id, e.evidence_type, e.original_filename, e.is_valid_evidence, e.include_in_report
    FROM financial_movements fm LEFT JOIN evidences e
      ON e.tenant_id = fm.tenant_id AND e.financial_movement_id = fm.id AND e.status = 'ACTIVE'
    WHERE fm.tenant_id = ? AND fm.status = 'ACTIVE' AND fm.accounting_date >= ? AND fm.accounting_date < ?
    ORDER BY fm.accounting_date, fm.public_number, e.created_at
  `).bind(tenantId(c), from, to).all();
  return c.json({ period, items: result.results });
});

reports.get("/accountability.pdf", requireRoles("ADMIN", "OPERATOR", "VIEWER"), async (c) => {
  const tenant = tenantId(c);
  const { from, to, period } = monthRange(c.req.query("period"));
  const includeDocuments = c.req.query("includeDocuments") === "1";
  const [tenantRow, movements] = await Promise.all([
    c.env.DB.prepare("SELECT name, cnpj FROM tenants WHERE id = ?").bind(tenant).first<{ name: string; cnpj: string }>(),
    c.env.DB.prepare(`
      SELECT fm.public_number, fm.accounting_date, fm.direction, fm.amount_cents, fm.description,
        ba.description AS account_name, COUNT(DISTINCT e.id) AS evidence_count,
        CASE WHEN COUNT(ma.id) = 0 THEN 'A CLASSIFICAR' ELSE 'CLASSIFICADO' END AS classification
      FROM financial_movements fm JOIN bank_accounts ba ON ba.tenant_id = fm.tenant_id AND ba.id = fm.bank_account_id
      LEFT JOIN evidences e ON e.tenant_id = fm.tenant_id AND e.financial_movement_id = fm.id AND e.status = 'ACTIVE'
      LEFT JOIN movement_allocations ma ON ma.tenant_id = fm.tenant_id AND ma.financial_movement_id = fm.id
      WHERE fm.tenant_id = ? AND fm.status = 'ACTIVE' AND fm.accounting_date >= ? AND fm.accounting_date < ?
      GROUP BY fm.id ORDER BY fm.accounting_date, fm.public_number
    `).bind(tenant, from, to).all(),
  ]);
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([842, 595]);
  let y = 548;
  const line = (value: string, size = 8, strong = false) => {
    if (y < 38) { page = pdf.addPage([842, 595]); y = 548; }
    page.drawText(safePdfText(value).slice(0, 150), { x: 32, y, size, font: strong ? bold : font, color: rgb(0.1, 0.16, 0.18) });
    y -= size + 5;
  };
  line("BLEXO | LIVRO FINANCEIRO E INDICE DE EVIDENCIAS", 15, true);
  line(`${tenantRow?.name ?? "Condominio"} | CNPJ ${tenantRow?.cnpj ?? "-"} | Periodo ${period} | Base: data contabil`, 9);
  y -= 8;
  line("Numero   Data        Conta                 Descricao                                  Valor       Classificacao  Docs", 8, true);
  const format = (amount: number) => (amount / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  for (const raw of movements.results) {
    const row = raw as Record<string, unknown>;
    const signed = `${row.direction === "CREDIT" ? "+" : "-"}${format(Number(row.amount_cents))}`;
    line(`${String(row.public_number).padEnd(9)} ${String(row.accounting_date).padEnd(11)} ${String(row.account_name).slice(0, 20).padEnd(21)} ${String(row.description).slice(0, 42).padEnd(43)} ${signed.padStart(12)}  ${String(row.classification).padEnd(13)} ${String(row.evidence_count)}`);
  }
  if (includeDocuments) {
    const evidences = await c.env.DB.prepare(`
      SELECT e.r2_key, e.mime_type, e.original_filename, e.evidence_type,
        fm.public_number, fm.description AS movement_description
      FROM evidences e JOIN financial_movements fm
        ON fm.tenant_id = e.tenant_id AND fm.id = e.financial_movement_id
      WHERE e.tenant_id = ? AND e.status = 'ACTIVE' AND e.is_valid_evidence = 1 AND e.include_in_report = 1
        AND fm.status = 'ACTIVE' AND fm.accounting_date >= ? AND fm.accounting_date < ?
      ORDER BY fm.accounting_date, fm.public_number, e.created_at LIMIT 100
    `).bind(tenant, from, to).all<Record<string, unknown>>();
    let embeddedBytes = 0;
    for (const evidence of evidences.results) {
      const object = await c.env.FILES.get(String(evidence.r2_key));
      if (!object || embeddedBytes + object.size > 50 * 1024 * 1024) continue;
      const content = await object.arrayBuffer();
      embeddedBytes += content.byteLength;
      try {
        const cover = pdf.addPage([595, 842]);
        cover.drawText(safePdfText(`EVIDENCIA ${String(evidence.public_number)} | ${String(evidence.evidence_type)}`).slice(0, 90), { x: 38, y: 800, size: 13, font: bold, color: rgb(0.02, 0.43, 0.42) });
        cover.drawText(safePdfText(String(evidence.movement_description)).slice(0, 90), { x: 38, y: 778, size: 9, font });
        cover.drawText(safePdfText(String(evidence.original_filename)).slice(0, 90), { x: 38, y: 761, size: 8, font, color: rgb(0.35, 0.45, 0.46) });
        if (evidence.mime_type === "application/pdf") {
          const source = await PDFDocument.load(content, { ignoreEncryption: false });
          const copied = await pdf.copyPages(source, source.getPageIndices());
          copied.forEach((copiedPage) => pdf.addPage(copiedPage));
        } else {
          const image = evidence.mime_type === "image/png" ? await pdf.embedPng(content) : await pdf.embedJpg(content);
          const dimensions = image.scaleToFit(519, 690);
          cover.drawImage(image, { x: (595 - dimensions.width) / 2, y: 45, width: dimensions.width, height: dimensions.height });
        }
      } catch {
        const warning = pdf.addPage([595, 842]);
        warning.drawText("Documento nao pode ser incorporado; consulte o arquivo original no sistema.", { x: 38, y: 790, size: 10, font, color: rgb(0.7, 0.2, 0.2) });
      }
    }
  }
  const bytes = await pdf.save();
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Response(body, { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="prestacao-contas-${period}${includeDocuments ? "-completa" : ""}.pdf"`, "cache-control": "private, no-store" } });
});

reports.get("/audit", requireRoles("ADMIN"), async (c) => {
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || 100, 1), 500);
  const result = await c.env.DB.prepare(`
    SELECT al.id, al.entity_type, al.entity_id, al.action, al.reason, al.request_id, al.created_at,
      u.display_name AS actor_name, u.email AS actor_email
    FROM audit_logs al JOIN users u ON u.id = al.actor_user_id
    WHERE al.tenant_id = ? ORDER BY al.created_at DESC LIMIT ?
  `).bind(tenantId(c), limit).all();
  return c.json({ items: result.results });
});

export default reports;
