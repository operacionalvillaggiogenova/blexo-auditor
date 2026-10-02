PRAGMA foreign_keys = ON;

CREATE TABLE chart_accounts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  parent_id TEXT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 3),
  nature TEXT NOT NULL CHECK (nature IN ('INCOME', 'EXPENSE', 'NEUTRAL')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (tenant_id, parent_id) REFERENCES chart_accounts(tenant_id, id),
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, id)
) STRICT;

CREATE TABLE suppliers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  tax_id TEXT,
  category TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  UNIQUE (tenant_id, id)
) STRICT;

CREATE TABLE funds (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  opening_balance_cents INTEGER NOT NULL DEFAULT 0 CHECK (abs(opening_balance_cents) <= 9007199254740991),
  opening_balance_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  UNIQUE (tenant_id, name),
  UNIQUE (tenant_id, id)
) STRICT;

CREATE TABLE bank_imports (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  bank_code TEXT NOT NULL CHECK (length(bank_code) = 3),
  original_filename TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  file_sha256 TEXT NOT NULL CHECK (length(file_sha256) = 64),
  parser_profile TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  layout_version TEXT,
  status TEXT NOT NULL CHECK (status IN ('UPLOADED', 'PARSING', 'PREVIEW_READY', 'CONFIRMING', 'COMPLETED', 'REJECTED', 'FAILED')),
  record_count INTEGER NOT NULL DEFAULT 0 CHECK (record_count >= 0),
  new_count INTEGER NOT NULL DEFAULT 0 CHECK (new_count >= 0),
  duplicate_count INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_count >= 0),
  error_count INTEGER NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  debit_total_cents INTEGER NOT NULL DEFAULT 0 CHECK (debit_total_cents >= 0),
  credit_total_cents INTEGER NOT NULL DEFAULT 0 CHECK (credit_total_cents >= 0),
  issues_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(issues_json)),
  imported_by TEXT NOT NULL,
  confirmed_by TEXT,
  confirmed_at TEXT,
  rejection_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (tenant_id, imported_by) REFERENCES users(tenant_id, id),
  FOREIGN KEY (tenant_id, confirmed_by) REFERENCES users(tenant_id, id),
  UNIQUE (tenant_id, file_sha256),
  UNIQUE (r2_key),
  UNIQUE (tenant_id, id)
) STRICT;

CREATE TABLE bank_import_lots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  bank_import_id TEXT NOT NULL,
  bank_account_id TEXT NOT NULL,
  lot_number TEXT NOT NULL,
  first_movement_date TEXT,
  last_movement_date TEXT,
  record_count INTEGER NOT NULL DEFAULT 0 CHECK (record_count >= 0),
  created_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id, bank_import_id) REFERENCES bank_imports(tenant_id, id),
  FOREIGN KEY (tenant_id, bank_account_id) REFERENCES bank_accounts(tenant_id, id),
  UNIQUE (tenant_id, bank_import_id, lot_number),
  UNIQUE (tenant_id, id)
) STRICT;

CREATE TABLE bank_import_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  bank_import_id TEXT NOT NULL,
  bank_import_lot_id TEXT NOT NULL,
  bank_account_id TEXT NOT NULL,
  source_line_number INTEGER NOT NULL CHECK (source_line_number > 0),
  record_sequence TEXT NOT NULL,
  accounting_date TEXT NOT NULL,
  source_event_date TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 9007199254740991),
  category_code TEXT,
  history_code TEXT,
  description TEXT NOT NULL,
  document_number TEXT,
  raw_record_sha256 TEXT NOT NULL CHECK (length(raw_record_sha256) = 64),
  fingerprint TEXT NOT NULL CHECK (length(fingerprint) = 64),
  status TEXT NOT NULL CHECK (status IN ('NEW', 'POSSIBLE_DUPLICATE', 'CONFIRMED_DUPLICATE', 'ERROR', 'READY', 'IMPORTED')),
  matched_transaction_id TEXT,
  decision_by TEXT,
  decision_at TEXT,
  error_json TEXT CHECK (error_json IS NULL OR json_valid(error_json)),
  created_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id, bank_import_id) REFERENCES bank_imports(tenant_id, id),
  FOREIGN KEY (tenant_id, bank_import_lot_id) REFERENCES bank_import_lots(tenant_id, id),
  FOREIGN KEY (tenant_id, bank_account_id) REFERENCES bank_accounts(tenant_id, id),
  FOREIGN KEY (tenant_id, decision_by) REFERENCES users(tenant_id, id),
  UNIQUE (tenant_id, bank_import_id, source_line_number),
  UNIQUE (tenant_id, id)
) STRICT;

CREATE TABLE bank_transactions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  bank_account_id TEXT NOT NULL,
  bank_import_id TEXT NOT NULL,
  bank_import_item_id TEXT NOT NULL,
  bank_code TEXT NOT NULL CHECK (length(bank_code) = 3),
  accounting_date TEXT NOT NULL,
  source_event_date TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 9007199254740991),
  category_code TEXT,
  history_code TEXT,
  description TEXT NOT NULL,
  document_number TEXT,
  raw_record_sha256 TEXT NOT NULL CHECK (length(raw_record_sha256) = 64),
  fingerprint TEXT NOT NULL CHECK (length(fingerprint) = 64),
  created_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id, bank_account_id) REFERENCES bank_accounts(tenant_id, id),
  FOREIGN KEY (tenant_id, bank_import_id) REFERENCES bank_imports(tenant_id, id),
  FOREIGN KEY (tenant_id, bank_import_item_id) REFERENCES bank_import_items(tenant_id, id),
  UNIQUE (tenant_id, bank_import_item_id),
  UNIQUE (tenant_id, id)
) STRICT;

CREATE TABLE movement_sequences (
  tenant_id TEXT NOT NULL,
  sequence_year INTEGER NOT NULL CHECK (sequence_year BETWEEN 2000 AND 9999),
  last_value INTEGER NOT NULL CHECK (last_value > 0),
  PRIMARY KEY (tenant_id, sequence_year),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) STRICT;

CREATE TABLE financial_movements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  bank_account_id TEXT NOT NULL,
  bank_transaction_id TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN ('BANK', 'MANUAL')),
  sequence_year INTEGER NOT NULL CHECK (sequence_year BETWEEN 2000 AND 9999),
  sequence_number INTEGER CHECK (sequence_number IS NULL OR sequence_number > 0),
  public_number TEXT,
  accounting_date TEXT NOT NULL,
  competence_date TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 9007199254740991),
  description TEXT NOT NULL,
  justification TEXT,
  supplier_id TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CANCELLED')),
  cancelled_at TEXT,
  cancelled_by TEXT,
  cancellation_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (tenant_id, bank_account_id) REFERENCES bank_accounts(tenant_id, id),
  FOREIGN KEY (tenant_id, bank_transaction_id) REFERENCES bank_transactions(tenant_id, id),
  FOREIGN KEY (tenant_id, supplier_id) REFERENCES suppliers(tenant_id, id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id),
  FOREIGN KEY (tenant_id, cancelled_by) REFERENCES users(tenant_id, id),
  CHECK (
    (source_type = 'BANK' AND bank_transaction_id IS NOT NULL)
    OR
    (source_type = 'MANUAL' AND bank_transaction_id IS NULL)
  ),
  CHECK (source_type <> 'MANUAL' OR COALESCE(length(trim(justification)), 0) > 0),
  CHECK (
    (status = 'ACTIVE' AND cancelled_at IS NULL AND cancelled_by IS NULL AND cancellation_reason IS NULL)
    OR
    (status = 'CANCELLED' AND cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL AND length(trim(cancellation_reason)) > 0)
  ),
  UNIQUE (tenant_id, bank_transaction_id),
  UNIQUE (tenant_id, sequence_year, sequence_number),
  UNIQUE (tenant_id, public_number),
  UNIQUE (tenant_id, id)
) STRICT;

CREATE TABLE movement_allocations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  financial_movement_id TEXT NOT NULL,
  line_number INTEGER NOT NULL CHECK (line_number > 0),
  allocation_mode TEXT NOT NULL CHECK (allocation_mode IN ('AMOUNT', 'PERCENTAGE')),
  classification_type TEXT NOT NULL CHECK (classification_type IN ('INCOME', 'EXPENSE', 'TRANSFER', 'ADJUSTMENT', 'FUND', 'IGNORED')),
  chart_account_id TEXT,
  fund_id TEXT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 9007199254740991),
  percentage_ppm INTEGER CHECK (percentage_ppm IS NULL OR percentage_ppm BETWEEN 1 AND 1000000),
  description TEXT,
  justification TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id, financial_movement_id) REFERENCES financial_movements(tenant_id, id),
  FOREIGN KEY (tenant_id, chart_account_id) REFERENCES chart_accounts(tenant_id, id),
  FOREIGN KEY (tenant_id, fund_id) REFERENCES funds(tenant_id, id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id),
  CHECK (
    (allocation_mode = 'AMOUNT' AND percentage_ppm IS NULL)
    OR
    (allocation_mode = 'PERCENTAGE' AND percentage_ppm IS NOT NULL)
  ),
  CHECK (classification_type IN ('TRANSFER', 'IGNORED') OR chart_account_id IS NOT NULL),
  CHECK (classification_type <> 'FUND' OR fund_id IS NOT NULL),
  UNIQUE (tenant_id, financial_movement_id, line_number),
  UNIQUE (tenant_id, id)
) STRICT;

CREATE TABLE movement_links (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  link_type TEXT NOT NULL CHECK (link_type IN ('INTERNAL_TRANSFER')),
  source_movement_id TEXT NOT NULL,
  target_movement_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id, source_movement_id) REFERENCES financial_movements(tenant_id, id),
  FOREIGN KEY (tenant_id, target_movement_id) REFERENCES financial_movements(tenant_id, id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id),
  CHECK (source_movement_id <> target_movement_id),
  UNIQUE (tenant_id, source_movement_id),
  UNIQUE (tenant_id, target_movement_id),
  UNIQUE (tenant_id, id)
) STRICT;

CREATE INDEX idx_chart_accounts_tenant_parent ON chart_accounts(tenant_id, parent_id, status);
CREATE INDEX idx_suppliers_tenant_name ON suppliers(tenant_id, name, status);
CREATE INDEX idx_funds_tenant_status ON funds(tenant_id, status);
CREATE INDEX idx_bank_imports_tenant_created ON bank_imports(tenant_id, created_at);
CREATE INDEX idx_bank_import_lots_account_date ON bank_import_lots(tenant_id, bank_account_id, last_movement_date);
CREATE INDEX idx_import_items_import_status ON bank_import_items(tenant_id, bank_import_id, status);
CREATE INDEX idx_import_items_fingerprint ON bank_import_items(tenant_id, bank_account_id, fingerprint);
CREATE INDEX idx_bank_transactions_account_date ON bank_transactions(tenant_id, bank_account_id, accounting_date, id);
CREATE INDEX idx_bank_transactions_fingerprint ON bank_transactions(tenant_id, bank_account_id, fingerprint);
CREATE INDEX idx_movements_account_date ON financial_movements(tenant_id, bank_account_id, accounting_date, id);
CREATE INDEX idx_movements_competence ON financial_movements(tenant_id, competence_date, id);
CREATE INDEX idx_movements_status_source ON financial_movements(tenant_id, status, source_type);
CREATE INDEX idx_allocations_movement ON movement_allocations(tenant_id, financial_movement_id, line_number);
CREATE INDEX idx_allocations_chart_account ON movement_allocations(tenant_id, chart_account_id);

CREATE TRIGGER financial_movements_assign_number
AFTER INSERT ON financial_movements
WHEN NEW.sequence_number IS NULL OR NEW.public_number IS NULL
BEGIN
  INSERT INTO movement_sequences (tenant_id, sequence_year, last_value)
  VALUES (NEW.tenant_id, NEW.sequence_year, 1)
  ON CONFLICT (tenant_id, sequence_year)
  DO UPDATE SET last_value = last_value + 1;

  UPDATE financial_movements
  SET
    sequence_number = (
      SELECT last_value
      FROM movement_sequences
      WHERE tenant_id = NEW.tenant_id AND sequence_year = NEW.sequence_year
    ),
    public_number = printf(
      '#%02d%04d',
      NEW.sequence_year % 100,
      (
        SELECT last_value
        FROM movement_sequences
        WHERE tenant_id = NEW.tenant_id AND sequence_year = NEW.sequence_year
      )
    )
  WHERE id = NEW.id;
END;

CREATE TRIGGER financial_movements_reject_explicit_number
BEFORE INSERT ON financial_movements
WHEN NEW.sequence_number IS NOT NULL OR NEW.public_number IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'movement numbers are assigned by the database');
END;

CREATE TRIGGER financial_movements_protect_number
BEFORE UPDATE OF tenant_id, sequence_year, sequence_number, public_number, source_type, bank_transaction_id
ON financial_movements
WHEN OLD.sequence_number IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'movement identity is immutable');
END;

CREATE TRIGGER bank_transactions_no_update
BEFORE UPDATE ON bank_transactions
BEGIN
  SELECT RAISE(ABORT, 'bank_transactions are immutable');
END;

CREATE TRIGGER bank_transactions_no_delete
BEFORE DELETE ON bank_transactions
BEGIN
  SELECT RAISE(ABORT, 'bank_transactions are immutable');
END;

CREATE TRIGGER bank_movements_protect_source_fields
BEFORE UPDATE OF bank_account_id, bank_transaction_id, source_type, accounting_date, direction, amount_cents
ON financial_movements
WHEN OLD.source_type = 'BANK'
BEGIN
  SELECT RAISE(ABORT, 'bank movement source fields are immutable');
END;

CREATE TRIGGER financial_movements_no_delete
BEFORE DELETE ON financial_movements
BEGIN
  SELECT RAISE(ABORT, 'financial movements cannot be deleted');
END;

CREATE TRIGGER cancelled_movements_are_final
BEFORE UPDATE OF status ON financial_movements
WHEN OLD.status = 'CANCELLED'
BEGIN
  SELECT RAISE(ABORT, 'cancelled movements cannot be restored');
END;

CREATE TRIGGER bank_account_opening_balance_lock
BEFORE UPDATE OF opening_balance_cents, opening_balance_date ON bank_accounts
WHEN EXISTS (
  SELECT 1
  FROM financial_movements
  WHERE tenant_id = OLD.tenant_id AND bank_account_id = OLD.id
)
BEGIN
  SELECT RAISE(ABORT, 'opening balance cannot change after the first movement');
END;

CREATE TRIGGER internal_transfer_validate
BEFORE INSERT ON movement_links
WHEN NOT EXISTS (
  SELECT 1
  FROM financial_movements source
  JOIN financial_movements target
    ON target.tenant_id = source.tenant_id
  WHERE source.tenant_id = NEW.tenant_id
    AND source.id = NEW.source_movement_id
    AND target.id = NEW.target_movement_id
    AND source.status = 'ACTIVE'
    AND target.status = 'ACTIVE'
    AND source.direction = 'DEBIT'
    AND target.direction = 'CREDIT'
    AND source.amount_cents = target.amount_cents
    AND source.bank_account_id <> target.bank_account_id
)
BEGIN
  SELECT RAISE(ABORT, 'invalid internal transfer pair');
END;

CREATE TRIGGER internal_transfer_source_not_already_linked
BEFORE INSERT ON movement_links
WHEN EXISTS (
  SELECT 1
  FROM movement_links
  WHERE tenant_id = NEW.tenant_id
    AND (source_movement_id = NEW.source_movement_id OR target_movement_id = NEW.source_movement_id)
)
BEGIN
  SELECT RAISE(ABORT, 'source movement is already linked');
END;

CREATE TRIGGER internal_transfer_target_not_already_linked
BEFORE INSERT ON movement_links
WHEN EXISTS (
  SELECT 1
  FROM movement_links
  WHERE tenant_id = NEW.tenant_id
    AND (source_movement_id = NEW.target_movement_id OR target_movement_id = NEW.target_movement_id)
)
BEGIN
  SELECT RAISE(ABORT, 'target movement is already linked');
END;
