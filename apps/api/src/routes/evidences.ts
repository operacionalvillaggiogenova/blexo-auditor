import { Hono } from "hono";
import { z } from "zod";
import { auditStatement } from "../audit";
import { sha256Hex } from "../crypto";
import { AppError, notFound } from "../errors";
import { nowIso, parseJson, tenantId } from "../http";
import { requireAuth, requireRoles } from "../middleware/auth";
import { assertPeriodOpen } from "../periods";
import { assertRateLimit } from "../rate-limit";
import type { AppEnv } from "../types";

const evidences = new Hono<AppEnv>();
evidences.use("*", requireAuth);

const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);
const evidenceKinds = new Set(["INVOICE", "RECEIPT", "PAYMENT_PROOF", "CONTRACT", "QUOTE", "PHOTO", "DOCUMENT", "OTHER"]);

function hasValidSignature(bytes: Uint8Array, mime: string): boolean {
  if (mime === "application/pdf") return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  if (mime === "image/png") return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (mime === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
  return false;
}

evidences.post("/", requireRoles("ADMIN", "OPERATOR"), async (c) => {
  const tenant = tenantId(c);
  await assertRateLimit(c.env.DB, "evidence-upload", `${tenant}:${c.get("auth").id}`, 100, 10 * 60);
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) throw new AppError(422, "FILE_REQUIRED", "Selecione um arquivo.");
  if (!allowedTypes.has(file.type)) throw new AppError(422, "INVALID_FILE_TYPE", "Envie PDF, JPG ou PNG.");
  if (file.size < 1 || file.size > 20 * 1024 * 1024) throw new AppError(422, "INVALID_FILE_SIZE", "O arquivo deve ter até 20 MB.");
  const movementId = String(body.movementId ?? "");
  const evidenceType = String(body.evidenceType ?? "DOCUMENT");
  if (!evidenceKinds.has(evidenceType)) throw new AppError(422, "INVALID_EVIDENCE_TYPE", "Tipo de comprovante inválido.");
  const movement = await c.env.DB.prepare("SELECT id, accounting_date FROM financial_movements WHERE tenant_id = ? AND id = ? AND status = 'ACTIVE'")
    .bind(tenant, movementId).first<{ id: string; accounting_date: string }>();
  if (!movement) notFound("Movimento não encontrado.");
  await assertPeriodOpen(c.env.DB, tenant, movement.accounting_date);

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasValidSignature(bytes, file.type)) throw new AppError(422, "INVALID_FILE_CONTENT", "O conteúdo não corresponde ao formato informado.");
  const digest = await sha256Hex(bytes);
  const duplicate = await c.env.DB.prepare(`
    SELECT id FROM evidences WHERE tenant_id = ? AND financial_movement_id = ? AND sha256 = ? AND status <> 'CANCELLED'
  `).bind(tenant, movementId, digest).first();
  if (duplicate) throw new AppError(409, "DUPLICATE_EVIDENCE", "Este arquivo já está anexado ao movimento.");

  const id = crypto.randomUUID();
  const timestamp = nowIso();
  const key = `tenants/${tenant}/evidences/${movementId}/${id}`;
  await c.env.FILES.put(key, bytes, { httpMetadata: { contentType: file.type }, customMetadata: { originalName: file.name, sha256: digest } });
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(`
        INSERT INTO evidences (
          id, tenant_id, financial_movement_id, evidence_type, original_filename, r2_key, sha256,
          size_bytes, mime_type, description, is_valid_evidence, include_in_report, status,
          created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'ACTIVE', ?, ?, ?)
      `).bind(id, tenant, movementId, evidenceType, file.name, key, digest, file.size, file.type,
        body.description ? String(body.description) : null, String(body.includeInReport ?? "true") !== "false" ? 1 : 0,
        c.get("auth").id, timestamp, timestamp),
      auditStatement(c.env.DB, {
        tenantId: tenant, actorUserId: c.get("auth").id, entityType: "evidence", entityId: id,
        action: "UPLOAD", after: { movementId, evidenceType, filename: file.name, digest },
        requestId: c.get("requestId"), createdAt: timestamp,
      }),
    ]);
  } catch (error) {
    await c.env.FILES.delete(key);
    throw error;
  }
  return c.json({ id, sha256: digest }, 201);
});

evidences.get("/:id/download", requireRoles("ADMIN", "OPERATOR", "VIEWER"), async (c) => {
  const row = await c.env.DB.prepare(`
    SELECT r2_key, mime_type, original_filename FROM evidences
    WHERE tenant_id = ? AND id = ? AND status <> 'CANCELLED'
  `).bind(tenantId(c), c.req.param("id")).first<{ r2_key: string; mime_type: string; original_filename: string }>();
  if (!row) notFound("Comprovante não encontrado.");
  const object = await c.env.FILES.get(row.r2_key);
  if (!object) notFound("Arquivo do comprovante não encontrado.");
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", row.mime_type);
  headers.set("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(row.original_filename)}`);
  headers.set("cache-control", "private, no-store");
  return new Response(object.body, { headers });
});

const updateEvidenceSchema = z.object({
  description: z.string().trim().max(1000).nullable().optional(),
  isValidEvidence: z.boolean().optional(),
  includeInReport: z.boolean().optional(),
});

evidences.patch("/:id", requireRoles("ADMIN", "OPERATOR"), async (c) => {
  const tenant = tenantId(c);
  const id = c.req.param("id");
  const input = await parseJson(c, updateEvidenceSchema);
  const before = await c.env.DB.prepare("SELECT * FROM evidences WHERE tenant_id = ? AND id = ? AND status <> 'CANCELLED'")
    .bind(tenant, id).first<Record<string, unknown>>();
  if (!before) notFound("Comprovante não encontrado.");
  const timestamp = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare(`
      UPDATE evidences SET description = ?, is_valid_evidence = COALESCE(?, is_valid_evidence),
        include_in_report = COALESCE(?, include_in_report), updated_at = ? WHERE tenant_id = ? AND id = ?
    `).bind(input.description === undefined ? before.description ?? null : input.description,
      input.isValidEvidence === undefined ? null : Number(input.isValidEvidence),
      input.includeInReport === undefined ? null : Number(input.includeInReport), timestamp, tenant, id),
    auditStatement(c.env.DB, {
      tenantId: tenant, actorUserId: c.get("auth").id, entityType: "evidence", entityId: id,
      action: "UPDATE", before, after: input, requestId: c.get("requestId"), createdAt: timestamp,
    }),
  ]);
  return c.json({ ok: true });
});

evidences.post("/:id/cancel", requireRoles("ADMIN"), async (c) => {
  const tenant = tenantId(c);
  const id = c.req.param("id");
  const before = await c.env.DB.prepare("SELECT * FROM evidences WHERE tenant_id = ? AND id = ? AND status <> 'CANCELLED'")
    .bind(tenant, id).first<Record<string, unknown>>();
  if (!before) notFound("Comprovante não encontrado.");
  const timestamp = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE evidences SET status = 'CANCELLED', updated_at = ? WHERE tenant_id = ? AND id = ?")
      .bind(timestamp, tenant, id),
    auditStatement(c.env.DB, {
      tenantId: tenant, actorUserId: c.get("auth").id, entityType: "evidence", entityId: id,
      action: "CANCEL", before, after: { status: "CANCELLED" }, requestId: c.get("requestId"), createdAt: timestamp,
    }),
  ]);
  return c.json({ ok: true });
});

export default evidences;
