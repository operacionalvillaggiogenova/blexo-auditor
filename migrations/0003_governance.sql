PRAGMA foreign_keys = ON;

CREATE TABLE evidences (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  financial_movement_id TEXT NOT NULL,
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('INVOICE', 'RECEIPT', 'PAYMENT_PROOF', 'CONTRACT', 'QUOTE', 'PHOTO', 'DOCUMENT', 'OTHER')),
  original_filename TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png')),
  description TEXT,
  is_valid_evidence INTEGER NOT NULL DEFAULT 1 CHECK (is_valid_evidence IN (0, 1)),
  include_in_report INTEGER NOT NULL DEFAULT 1 CHECK (include_in_report IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PENDING_UPLOAD', 'UPLOADED', 'VERIFIED', 'ACTIVE', 'REJECTED', 'CANCELLED')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id, financial_movement_id) REFERENCES financial_movements(tenant_id, id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id),
  UNIQUE (r2_key),
  UNIQUE (tenant_id, id)
) STRICT;

CREATE TABLE fund_movements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  fund_id TEXT NOT NULL,
  financial_movement_id TEXT,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('CONTRIBUTION', 'WITHDRAWAL', 'INCOME', 'TRANSFER', 'ADJUSTMENT')),
  direction TEXT NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 9007199254740991),
  accounting_date TEXT NOT NULL,
  justification TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CANCELLED')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id, fund_id) REFERENCES funds(tenant_id, id),
  FOREIGN KEY (tenant_id, financial_movement_id) REFERENCES financial_movements(tenant_id, id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id),
  CHECK (financial_movement_id IS NOT NULL OR length(trim(justification)) > 0),
  UNIQUE (tenant_id, id)
) STRICT;

CREATE TABLE budgets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL CHECK (fiscal_year BETWEEN 2000 AND 9999),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id),
  UNIQUE (tenant_id, fiscal_year),
  UNIQUE (tenant_id, id)
) STRICT;

CREATE TABLE budget_versions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  budget_id TEXT NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  version_type TEXT NOT NULL CHECK (version_type IN ('ORIGINAL', 'REVISED')),
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'APPROVED', 'SUPERSEDED')),
  reason TEXT,
  approved_by TEXT,
  approved_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id, budget_id) REFERENCES budgets(tenant_id, id),
  FOREIGN KEY (tenant_id, approved_by) REFERENCES users(tenant_id, id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id),
  UNIQUE (tenant_id, budget_id, version_number),
  UNIQUE (tenant_id, id)
) STRICT;

CREATE TABLE budget_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  budget_version_id TEXT NOT NULL,
  chart_account_id TEXT NOT NULL,
  month_number INTEGER NOT NULL CHECK (month_number BETWEEN 1 AND 12),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0 AND amount_cents <= 9007199254740991),
  created_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id, budget_version_id) REFERENCES budget_versions(tenant_id, id),
  FOREIGN KEY (tenant_id, chart_account_id) REFERENCES chart_accounts(tenant_id, id),
  UNIQUE (tenant_id, budget_version_id, chart_account_id, month_number),
  UNIQUE (tenant_id, id)
) STRICT;

CREATE TABLE period_closings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL CHECK (fiscal_year BETWEEN 2000 AND 9999),
  month_number INTEGER NOT NULL CHECK (month_number BETWEEN 1 AND 12),
  status TEXT NOT NULL CHECK (status IN ('OPEN', 'CLOSED')),
  warning_snapshot_json TEXT CHECK (warning_snapshot_json IS NULL OR json_valid(warning_snapshot_json)),
  close_reason TEXT,
  closed_by TEXT,
  closed_at TEXT,
  reopened_by TEXT,
  reopened_at TEXT,
  reopen_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (tenant_id, closed_by) REFERENCES users(tenant_id, id),
  FOREIGN KEY (tenant_id, reopened_by) REFERENCES users(tenant_id, id),
  CHECK (
    (status = 'OPEN')
    OR
    (status = 'CLOSED' AND closed_by IS NOT NULL AND closed_at IS NOT NULL)
  ),
  UNIQUE (tenant_id, fiscal_year, month_number),
  UNIQUE (tenant_id, id)
) STRICT;

CREATE INDEX idx_evidences_movement_status ON evidences(tenant_id, financial_movement_id, status);
CREATE INDEX idx_fund_movements_fund_date ON fund_movements(tenant_id, fund_id, accounting_date);
CREATE INDEX idx_budget_versions_budget_status ON budget_versions(tenant_id, budget_id, status);
CREATE INDEX idx_budget_items_account_month ON budget_items(tenant_id, chart_account_id, month_number);
CREATE INDEX idx_period_closings_tenant_period ON period_closings(tenant_id, fiscal_year, month_number, status);

CREATE TRIGGER approved_budget_versions_protect_content
BEFORE UPDATE OF tenant_id, budget_id, version_number, version_type, reason, approved_by, approved_at, created_by, created_at
ON budget_versions
WHEN OLD.status IN ('APPROVED', 'SUPERSEDED')
BEGIN
  SELECT RAISE(ABORT, 'approved budget version content is immutable');
END;

CREATE TRIGGER approved_budget_versions_no_delete
BEFORE DELETE ON budget_versions
WHEN OLD.status IN ('APPROVED', 'SUPERSEDED')
BEGIN
  SELECT RAISE(ABORT, 'approved budget versions cannot be deleted');
END;

CREATE TRIGGER approved_budget_items_no_insert
BEFORE INSERT ON budget_items
WHEN EXISTS (
  SELECT 1
  FROM budget_versions
  WHERE tenant_id = NEW.tenant_id
    AND id = NEW.budget_version_id
    AND status IN ('APPROVED', 'SUPERSEDED')
)
BEGIN
  SELECT RAISE(ABORT, 'approved budget items are immutable');
END;

CREATE TRIGGER approved_budget_items_no_update
BEFORE UPDATE ON budget_items
WHEN EXISTS (
  SELECT 1
  FROM budget_versions
  WHERE tenant_id = OLD.tenant_id
    AND id = OLD.budget_version_id
    AND status IN ('APPROVED', 'SUPERSEDED')
)
BEGIN
  SELECT RAISE(ABORT, 'approved budget items are immutable');
END;

CREATE TRIGGER approved_budget_items_no_delete
BEFORE DELETE ON budget_items
WHEN EXISTS (
  SELECT 1
  FROM budget_versions
  WHERE tenant_id = OLD.tenant_id
    AND id = OLD.budget_version_id
    AND status IN ('APPROVED', 'SUPERSEDED')
)
BEGIN
  SELECT RAISE(ABORT, 'approved budget items are immutable');
END;
