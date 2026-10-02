export type AuditInput = {
  tenantId: string;
  actorUserId: string;
  entityType: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  ipAddress?: string | null;
  requestId: string;
  createdAt: string;
};

export function auditStatement(db: D1Database, input: AuditInput): D1PreparedStatement {
  return db.prepare(`
    INSERT INTO audit_logs (
      id, tenant_id, actor_user_id, entity_type, entity_id, action,
      before_json, after_json, reason, ip_address, request_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    input.tenantId,
    input.actorUserId,
    input.entityType,
    input.entityId,
    input.action,
    input.before === undefined ? null : JSON.stringify(input.before),
    input.after === undefined ? null : JSON.stringify(input.after),
    input.reason ?? null,
    input.ipAddress ?? null,
    input.requestId,
    input.createdAt,
  );
}
