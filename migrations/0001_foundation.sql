PRAGMA foreign_keys = ON;

CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cnpj TEXT NOT NULL,
  address_json TEXT,
  unit_count INTEGER NOT NULL DEFAULT 0 CHECK (unit_count >= 0),
  fiscal_year_start_month INTEGER NOT NULL DEFAULT 1 CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  currency_code TEXT NOT NULL DEFAULT 'BRL' CHECK (length(currency_code) = 3),
  date_format TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
  logo_r2_key TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (cnpj)
) STRICT;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  email TEXT NOT NULL COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'VIEWER')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  password_changed_at TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CHECK (
    (role = 'SUPER_ADMIN' AND tenant_id IS NULL)
    OR
    (role <> 'SUPER_ADMIN' AND tenant_id IS NOT NULL)
  ),
  UNIQUE (email),
  UNIQUE (tenant_id, id)
) STRICT;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE (token_hash)
) STRICT;

CREATE TABLE password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE (token_hash)
) STRICT;

CREATE TABLE bank_accounts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  bank_code TEXT NOT NULL CHECK (length(bank_code) = 3),
  branch_number TEXT NOT NULL,
  branch_check_digit TEXT NOT NULL DEFAULT '',
  account_number TEXT NOT NULL,
  account_check_digit TEXT NOT NULL DEFAULT '',
  branch_account_check_digit TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('CHECKING', 'SAVINGS', 'INVESTMENT', 'APPLICATION')),
  opening_balance_cents INTEGER NOT NULL DEFAULT 0 CHECK (abs(opening_balance_cents) <= 9007199254740991),
  opening_balance_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id),
  UNIQUE (tenant_id, bank_code, branch_number, account_number, account_check_digit),
  UNIQUE (tenant_id, id)
) STRICT;

CREATE TABLE tenant_settings (
  tenant_id TEXT NOT NULL,
  setting_key TEXT NOT NULL,
  setting_value_json TEXT NOT NULL CHECK (json_valid(setting_value_json)),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, setting_key),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (tenant_id, updated_by) REFERENCES users(tenant_id, id)
) STRICT;

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT CHECK (before_json IS NULL OR json_valid(before_json)),
  after_json TEXT CHECK (after_json IS NULL OR json_valid(after_json)),
  reason TEXT,
  ip_address TEXT,
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (actor_user_id) REFERENCES users(id)
) STRICT;

CREATE INDEX idx_users_tenant_status ON users(tenant_id, status);
CREATE INDEX idx_sessions_user_active ON sessions(user_id, revoked_at, expires_at);
CREATE INDEX idx_bank_accounts_tenant_status ON bank_accounts(tenant_id, status);
CREATE INDEX idx_audit_logs_tenant_entity ON audit_logs(tenant_id, entity_type, entity_id, created_at);
CREATE INDEX idx_audit_logs_tenant_created ON audit_logs(tenant_id, created_at);

CREATE TRIGGER audit_logs_no_update
BEFORE UPDATE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs are append-only');
END;

CREATE TRIGGER audit_logs_no_delete
BEFORE DELETE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs are append-only');
END;
