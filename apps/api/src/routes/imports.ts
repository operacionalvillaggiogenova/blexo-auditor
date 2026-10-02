import { parseCnab240, type ParseIssue, type ParsedTransaction } from "@blexo/cnab240";
import { normalizeBankText } from "@blexo/domain";
import { Hono } from "hono";
import { z } from "zod";
import { auditStatement } from "../audit";
import { sha256Hex } from "../crypto";
import { AppError, conflict, notFound } from "../errors";
import { dateYear, nowIso, parseJson, tenantId } from "../http";
import { requireAuth, requireRoles } from "../middleware/auth";
import { assertRateLimit } from "../rate-limit";
import type { AppEnv } from "../types";

type AccountRow = {
  id: string;
  bank_code: string;
  branch_number: string;
  branch_check_digit: string;
  account_number: string;
  account_check_digit: string;
  branch_account_check_digit: string;
};

type PreviewItem = {
  id: string;
  transaction: ParsedTransaction;
  rawRecordSha256: string;
  fingerprint: string;
  status: "READY" | "POSSIBLE_DUPLICATE";
  matchedTransactionId: string | null;
};

const imports = new Hono<AppEnv>();
imports.use("*", requireAuth);

function normalizeNumber(value: string): string {
  return value.replace(/^0+/, "") || "0";
}

function accountMatches(row: AccountRow, transaction: ParsedTransaction): boolean {
  return row.bank_code === transaction.bankCode
    && normalizeNumber(row.branch_number) === normalizeNumber(transaction.account.branchNumber)
    && normalizeNumber(row.account_number) === normalizeNumber(transaction.account.accountNumber)
    && (!transaction.account.branchCheckDigit || row.branch_check_digit === transaction.account.branchCheckDigit)
    && (!transaction.account.accountCheckDigit || row.account_check_digit === transaction.account.accountCheckDigit)
    && (!transaction.account.branchAccountCheckDigit || row.branch_account_check_digit === transaction.account.branchAccountCheckDigit);
}

async function transactionFingerprint(tenant: string, accountId: string, transaction: ParsedTransaction): Promise<string> {
  return sha256Hex([
    tenant,
    accountId,
    transaction.accountingDate,
    transaction.direction,
    String(transaction.amountCents),
    transaction.historyCode,
    normalizeBankText(transaction.description),
    normalizeBankText(transaction.documentNumber),
  ].join("|"));
}

imports.get("/", requireRoles("ADMIN", "OPERATOR", "VIEWER"), async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT id, bank_code, original_filename, parser_profile, parser_version, layout_version,
           status, record_count, new_count, duplicate_count, error_count,
           debit_total_cents, credit_total_cents, confirmed_at, created_at
    FROM bank_imports WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 100
  `).bind(tenantId(c)).all();
  return c.json({ items: result.results });
});

imports.post("/", requireRoles("ADMIN", "OPERATOR"), async (c) => {
  const tenant = tenantId(c);
  await assertRateLimit(c.env.DB, "cnab-upload", `${tenant}:${c.get("auth").id}`, 50, 10 * 60);
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError(422, "FILE_REQUIRED", "Selecione um arquivo CNAB240.");
  if (file.size <= 0 || file.size > 10 * 1024 * 1024) throw new AppError(422, "INVALID_FILE_SIZE", "O arquivo deve possuir até 10 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const fileHash = await sha256Hex(bytes);
  const existing = await c.env.DB.prepare("SELECT id, status FROM bank_imports WHERE tenant_id = ? AND file_sha256 = ?")
    .bind(tenant, fileHash).first<{ id: string; status: string }>();
  if (existing) conflict("FILE_ALREADY_IMPORTED", `Este arquivo já foi recebido na importação ${existing.id}.`);

  let parsed;
  try {
    parsed = parseCnab240(bytes);
  } catch (error) {
    throw new AppError(422, "INVALID_CNAB", error instanceof Error ? error.message : "Arquivo CNAB inválido.");
  }
  const importId = crypto.randomUUID();
  const timestamp = nowIso();
  const objectDate = timestamp.slice(0, 7).replace("-", "/");
  const r2Key = `${tenant}/bank-imports/${objectDate}/${importId}`;
  await c.env.FILES.put(r2Key, bytes, {
    httpMetadata: { contentType: "text/plain", contentDisposition: `attachment; filename="${file.name.replace(/["\r\n]/g, "_")}"` },
    customMetadata: { sha256: fileHash, tenantId: tenant },
  });

  const accountsResult = await c.env.DB.prepare(`
    SELECT id, bank_code, branch_number, branch_check_digit, account_number,
           account_check_digit, branch_account_check_digit
    FROM bank_accounts WHERE tenant_id = ? AND status = 'ACTIVE'
  `).bind(tenant).all<AccountRow>();
  const accounts = accountsResult.results;
  const issues: ParseIssue[] = [...parsed.issues];
  const resolvedLots: Array<{ lot: typeof parsed.lots[number]; account: AccountRow }> = [];
  for (const lot of parsed.lots) {
    const account = accounts.find((candidate) => accountMatches(candidate, lot.transactions[0] ?? {
      bankCode: parsed.bankCode,
      account: lot.account,
    } as ParsedTransaction));
    if (!account) {
      issues.push({
        severity: "ERROR",
        code: "BANK_ACCOUNT_NOT_FOUND",
        message: `A conta do lote ${lot.lotNumber} não pertence ao condomínio autenticado.`,
      });
    } else {
      resolvedLots.push({ lot, account });
    }
  }

  const errorCount = issues.filter((issue) => issue.severity === "ERROR").length;
  await c.env.DB.prepare(`
    INSERT INTO bank_imports (
      id, tenant_id, bank_code, original_filename, r2_key, file_sha256,
      parser_profile, parser_version, layout_version, status,
      record_count, new_count, duplicate_count, error_count,
      debit_total_cents, credit_total_cents, issues_json,
      imported_by, confirmed_by, confirmed_at, rejection_reason, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, '1.0.0', ?, 'PARSING', ?, 0, 0, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)
  `).bind(
    importId, tenant, parsed.bankCode, file.name, r2Key, fileHash, parsed.profile,
    parsed.fileLayoutVersion, parsed.totals.records, errorCount, parsed.totals.debitCents,
    parsed.totals.creditCents, JSON.stringify(issues), c.get("auth").id, timestamp, timestamp,
  ).run();

  if (errorCount > 0) {
    await c.env.DB.prepare("UPDATE bank_imports SET status = 'PREVIEW_READY', updated_at = ? WHERE tenant_id = ? AND id = ?")
      .bind(nowIso(), tenant, importId).run();
    return c.json({ id: importId, status: "PREVIEW_READY", issues, totals: parsed.totals }, 201);
  }

  const previewItems: Array<PreviewItem & { lotId: string; accountId: string }> = [];
  const statements: D1PreparedStatement[] = [];
  for (const { lot, account } of resolvedLots) {
    const lotId = crypto.randomUUID();
    statements.push(c.env.DB.prepare(`
      INSERT INTO bank_import_lots (
        id, tenant_id, bank_import_id, bank_account_id, lot_number,
        first_movement_date, last_movement_date, record_count, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      lotId, tenant, importId, account.id, lot.lotNumber,
      lot.transactions.map((item) => item.accountingDate).sort()[0] ?? null,
      lot.transactions.map((item) => item.accountingDate).sort().at(-1) ?? null,
      lot.transactions.length, timestamp,
    ));
    for (const transaction of lot.transactions) {
      const [rawRecordSha256, fingerprint] = await Promise.all([
        sha256Hex(transaction.rawRecord),
        transactionFingerprint(tenant, account.id, transaction),
      ]);
      previewItems.push({
        id: crypto.randomUUID(), transaction, rawRecordSha256, fingerprint,
        status: "READY", matchedTransactionId: null, lotId, accountId: account.id,
      });
    }
  }

  if (previewItems.length > 0) {
    const fingerprints = [...new Set(previewItems.map((item) => item.fingerprint))];
    const duplicates = await c.env.DB.prepare(`
      SELECT id, fingerprint FROM bank_transactions
      WHERE tenant_id = ? AND fingerprint IN (SELECT value FROM json_each(?))
    `).bind(tenant, JSON.stringify(fingerprints)).all<{ id: string; fingerprint: string }>();
    const duplicateMap = new Map(duplicates.results.map((item) => [item.fingerprint, item.id]));
    const fingerprintsInFile = new Set<string>();
    for (const item of previewItems) {
      const match = duplicateMap.get(item.fingerprint);
      if (match || fingerprintsInFile.has(item.fingerprint)) {
        item.status = "POSSIBLE_DUPLICATE";
        item.matchedTransactionId = match ?? null;
      }
      fingerprintsInFile.add(item.fingerprint);
      statements.push(c.env.DB.prepare(`
        INSERT INTO bank_import_items (
          id, tenant_id, bank_import_id, bank_import_lot_id, bank_account_id,
          source_line_number, record_sequence, accounting_date, source_event_date,
          direction, amount_cents, category_code, history_code, description,
          document_number, raw_record_sha256, fingerprint, status,
          matched_transaction_id, decision_by, decision_at, error_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?)
      `).bind(
        item.id, tenant, importId, item.lotId, item.accountId,
        item.transaction.sourceLineNumber, item.transaction.recordSequence,
        item.transaction.accountingDate, item.transaction.sourceEventDate,
        item.transaction.direction, item.transaction.amountCents,
        item.transaction.categoryCode, item.transaction.historyCode,
        item.transaction.description, item.transaction.documentNumber,
        item.rawRecordSha256, item.fingerprint, item.status,
        item.matchedTransactionId, timestamp,
      ));
    }
  }

  for (let index = 0; index < statements.length; index += 75) {
    await c.env.DB.batch(statements.slice(index, index + 75));
  }
  const duplicateCount = previewItems.filter((item) => item.status === "POSSIBLE_DUPLICATE").length;
  await c.env.DB.prepare(`
    UPDATE bank_imports SET status = 'PREVIEW_READY', new_count = ?, duplicate_count = ?, updated_at = ?
    WHERE tenant_id = ? AND id = ?
  `).bind(previewItems.length - duplicateCount, duplicateCount, nowIso(), tenant, importId).run();
  return c.json({ id: importId, status: "PREVIEW_READY", issues, totals: parsed.totals, duplicateCount }, 201);
});

imports.get("/:id/preview", requireRoles("ADMIN", "OPERATOR", "VIEWER"), async (c) => {
  const tenant = tenantId(c);
  const id = c.req.param("id");
  const record = await c.env.DB.prepare(`
    SELECT id, bank_code, original_filename, status, record_count, new_count,
           duplicate_count, error_count, debit_total_cents, credit_total_cents,
           issues_json, created_at, confirmed_at
    FROM bank_imports WHERE tenant_id = ? AND id = ?
  `).bind(tenant, id).first<Record<string, unknown>>();
  if (!record) notFound("Importação não encontrada.");
  const items = await c.env.DB.prepare(`
    SELECT bii.id, bii.source_line_number, bii.accounting_date, bii.direction,
           bii.amount_cents, bii.description, bii.document_number, bii.status,
           bii.matched_transaction_id, ba.description AS bank_account_description
    FROM bank_import_items bii
    JOIN bank_accounts ba ON ba.tenant_id = bii.tenant_id AND ba.id = bii.bank_account_id
    WHERE bii.tenant_id = ? AND bii.bank_import_id = ?
    ORDER BY bii.source_line_number
  `).bind(tenant, id).all();
  return c.json({ ...record, issues: JSON.parse(String(record.issues_json)), items: items.results });
});

const decisionsSchema = z.object({
  decisions: z.array(z.object({
    itemId: z.uuid(),
    action: z.enum(["IMPORT", "SKIP_DUPLICATE"]),
  })).min(1).max(1000),
});

imports.post("/:id/decisions", requireRoles("ADMIN", "OPERATOR"), async (c) => {
  const tenant = tenantId(c);
  const importId = c.req.param("id");
  const input = await parseJson(c, decisionsSchema);
  const timestamp = nowIso();
  const statements = input.decisions.map((decision) => c.env.DB.prepare(`
    UPDATE bank_import_items SET status = ?, decision_by = ?, decision_at = ?
    WHERE tenant_id = ? AND bank_import_id = ? AND id = ? AND status = 'POSSIBLE_DUPLICATE'
  `).bind(decision.action === "IMPORT" ? "READY" : "CONFIRMED_DUPLICATE", c.get("auth").id,
    timestamp, tenant, importId, decision.itemId));
  for (let index = 0; index < statements.length; index += 75) await c.env.DB.batch(statements.slice(index, index + 75));
  return c.json({ ok: true });
});

imports.post("/:id/confirm", requireRoles("ADMIN", "OPERATOR"), async (c) => {
  const tenant = tenantId(c);
  const importId = c.req.param("id");
  const record = await c.env.DB.prepare("SELECT * FROM bank_imports WHERE tenant_id = ? AND id = ?")
    .bind(tenant, importId).first<Record<string, unknown>>();
  if (!record) notFound("Importação não encontrada.");
  if (record.status === "COMPLETED") return c.json({ ok: true, alreadyCompleted: true });
  if (record.status !== "PREVIEW_READY" && record.status !== "CONFIRMING") conflict("IMPORT_STATE", "Importação não está pronta para confirmação.");
  if (Number(record.error_count) > 0) throw new AppError(422, "IMPORT_HAS_ERRORS", "Corrija os erros antes de confirmar.");
  const unresolved = await c.env.DB.prepare(`
    SELECT COUNT(*) AS total FROM bank_import_items
    WHERE tenant_id = ? AND bank_import_id = ? AND status = 'POSSIBLE_DUPLICATE'
  `).bind(tenant, importId).first<{ total: number }>();
  if (Number(unresolved?.total) > 0) throw new AppError(422, "DUPLICATE_DECISIONS_REQUIRED", "Decida todos os possíveis duplicados antes de confirmar.");

  const timestamp = nowIso();
  await c.env.DB.prepare("UPDATE bank_imports SET status = 'CONFIRMING', confirmed_by = ?, updated_at = ? WHERE tenant_id = ? AND id = ?")
    .bind(c.get("auth").id, timestamp, tenant, importId).run();
  const ready = await c.env.DB.prepare(`
    SELECT * FROM bank_import_items
    WHERE tenant_id = ? AND bank_import_id = ? AND status = 'READY'
    ORDER BY source_line_number
  `).bind(tenant, importId).all<Record<string, unknown>>();

  for (let index = 0; index < ready.results.length; index += 25) {
    const chunk = ready.results.slice(index, index + 25);
    const statements: D1PreparedStatement[] = [];
    for (const item of chunk) {
      const transactionId = crypto.randomUUID();
      const movementId = crypto.randomUUID();
      statements.push(c.env.DB.prepare(`
        INSERT INTO bank_transactions (
          id, tenant_id, bank_account_id, bank_import_id, bank_import_item_id,
          bank_code, accounting_date, source_event_date, direction, amount_cents,
          category_code, history_code, description, document_number,
          raw_record_sha256, fingerprint, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        transactionId, tenant, item.bank_account_id, importId, item.id,
        record.bank_code, item.accounting_date, item.source_event_date, item.direction,
        item.amount_cents, item.category_code, item.history_code, item.description,
        item.document_number, item.raw_record_sha256, item.fingerprint, timestamp,
      ));
      statements.push(c.env.DB.prepare(`
        INSERT INTO financial_movements (
          id, tenant_id, bank_account_id, bank_transaction_id, source_type,
          sequence_year, sequence_number, public_number, accounting_date, competence_date,
          direction, amount_cents, description, justification, supplier_id,
          status, cancelled_at, cancelled_by, cancellation_reason, version,
          created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'BANK', ?, NULL, NULL, ?, ?, ?, ?, ?, NULL, NULL,
          'ACTIVE', NULL, NULL, NULL, 1, ?, ?, ?)
      `).bind(
        movementId, tenant, item.bank_account_id, transactionId, dateYear(String(item.accounting_date)),
        item.accounting_date, item.accounting_date, item.direction, item.amount_cents,
        item.description, c.get("auth").id, timestamp, timestamp,
      ));
      statements.push(c.env.DB.prepare(`
        UPDATE bank_import_items SET status = 'IMPORTED', matched_transaction_id = ?, decision_by = ?, decision_at = ?
        WHERE tenant_id = ? AND id = ? AND status = 'READY'
      `).bind(transactionId, c.get("auth").id, timestamp, tenant, item.id));
    }
    await c.env.DB.batch(statements);
  }

  const importedCount = ready.results.length;
  await c.env.DB.batch([
    c.env.DB.prepare(`
      UPDATE bank_imports SET status = 'COMPLETED', new_count = ?, confirmed_at = ?, updated_at = ?
      WHERE tenant_id = ? AND id = ?
    `).bind(importedCount, timestamp, timestamp, tenant, importId),
    auditStatement(c.env.DB, {
      tenantId: tenant, actorUserId: c.get("auth").id, entityType: "bank_import", entityId: importId,
      action: "CONFIRM", after: { importedCount, skippedDuplicates: record.duplicate_count },
      requestId: c.get("requestId"), createdAt: timestamp,
    }),
  ]);
  return c.json({ ok: true, importedCount });
});

imports.post("/:id/reject", requireRoles("ADMIN", "OPERATOR"), async (c) => {
  const tenant = tenantId(c);
  const input = await parseJson(c, z.object({ reason: z.string().trim().min(3).max(1000) }));
  const result = await c.env.DB.prepare(`
    UPDATE bank_imports SET status = 'REJECTED', rejection_reason = ?, updated_at = ?
    WHERE tenant_id = ? AND id = ? AND status IN ('UPLOADED', 'PARSING', 'PREVIEW_READY')
  `).bind(input.reason, nowIso(), tenant, c.req.param("id")).run();
  if (!result.meta.changes) notFound("Importação não encontrada ou já concluída.");
  return c.json({ ok: true });
});

export default imports;
