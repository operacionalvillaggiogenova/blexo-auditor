"""Apply every D1 migration and exercise the critical database invariants."""

from __future__ import annotations

import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def fails(connection: sqlite3.Connection, sql: str, params: tuple[object, ...], message: str) -> None:
    try:
        connection.execute(sql, params)
    except sqlite3.IntegrityError:
        return
    raise AssertionError(message)


def main() -> None:
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys = ON")
    for migration in sorted((ROOT / "migrations").glob("*.sql")):
        db.executescript(migration.read_text(encoding="utf-8"))

    tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    expected = {
        "tenants", "users", "sessions", "bank_accounts", "audit_logs", "chart_accounts",
        "suppliers", "funds", "bank_imports", "bank_import_lots", "bank_import_items",
        "bank_transactions", "financial_movements", "movement_allocations", "movement_links",
        "evidences", "fund_movements", "budgets", "budget_versions", "budget_items", "period_closings",
        "security_rate_limits",
    }
    missing = expected - tables
    assert not missing, f"missing tables: {sorted(missing)}"

    now = "2026-10-01T12:00:00.000Z"
    for tenant in ("tenant-a", "tenant-b"):
        db.execute("""INSERT INTO tenants
          (id,name,cnpj,address_json,unit_count,fiscal_year_start_month,currency_code,date_format,logo_r2_key,status,created_at,updated_at)
          VALUES (?,?,?,?,?,?,'BRL','DD/MM/YYYY',NULL,'ACTIVE',?,?)""",
          (tenant, tenant, "11111111111111" if tenant == "tenant-a" else "22222222222222", None, 1, 1, now, now))
        db.execute("""INSERT INTO users
          (id,tenant_id,email,display_name,password_hash,role,status,password_changed_at,last_login_at,created_at,updated_at)
          VALUES (?,?,?,?,?,'ADMIN','ACTIVE',?,NULL,?,?)""",
          (f"user-{tenant}", tenant, f"{tenant}@example.com", tenant, "test", now, now, now))
        db.execute("""INSERT INTO bank_accounts
          (id,tenant_id,bank_code,branch_number,branch_check_digit,account_number,account_check_digit,branch_account_check_digit,
           description,account_type,opening_balance_cents,opening_balance_date,status,version,created_by,created_at,updated_at)
          VALUES (?,?, '341','1234','','56789','0','','Principal','CHECKING',0,'2026-01-01','ACTIVE',1,?,?,?)""",
          (f"account-{tenant}", tenant, f"user-{tenant}", now, now))

    movement_values = (
        "movement-a", "tenant-a", "account-tenant-a", 2026, "2026-10-01", "2026-10-01",
        "CREDIT", 10000, "Receita", "Ajuste auditável", "user-tenant-a", now, now,
    )
    db.execute("""INSERT INTO financial_movements
      (id,tenant_id,bank_account_id,bank_transaction_id,source_type,sequence_year,sequence_number,public_number,
       accounting_date,competence_date,direction,amount_cents,description,justification,supplier_id,status,
       cancelled_at,cancelled_by,cancellation_reason,version,created_by,created_at,updated_at)
      VALUES (?,?,?,NULL,'MANUAL',?,NULL,NULL,?,?,?,?,?,?,NULL,'ACTIVE',NULL,NULL,NULL,1,?,?,?)""", movement_values)
    number = db.execute("SELECT public_number FROM financial_movements WHERE id = 'movement-a'").fetchone()[0]
    assert number == "#260001", f"unexpected movement number: {number}"

    fails(db, "DELETE FROM financial_movements WHERE id = ?", ("movement-a",), "financial movement was physically deleted")
    fails(db, "UPDATE bank_accounts SET opening_balance_cents = 100 WHERE id = ?", ("account-tenant-a",), "opening balance changed after movement")
    fails(
        db,
        """INSERT INTO movement_allocations
          (id,tenant_id,financial_movement_id,line_number,allocation_mode,classification_type,chart_account_id,fund_id,
           amount_cents,percentage_ppm,description,justification,created_by,created_at,updated_at)
          VALUES ('bad','tenant-b','movement-a',1,'AMOUNT','TRANSFER',NULL,NULL,10000,NULL,NULL,NULL,'user-tenant-b',?,?)""",
        (now, now),
        "cross-tenant allocation was accepted",
    )

    db.execute("""INSERT INTO audit_logs
      (id,tenant_id,actor_user_id,entity_type,entity_id,action,before_json,after_json,reason,ip_address,request_id,created_at)
      VALUES ('audit','tenant-a','user-tenant-a','movement','movement-a','CREATE',NULL,'{}',NULL,NULL,'request',?)""", (now,))
    fails(db, "DELETE FROM audit_logs WHERE id = 'audit'", (), "audit record was deleted")
    db.commit()
    print(f"OK: {len(tables)} tables; tenant guards, numbering and immutability validated")


if __name__ == "__main__":
    main()
