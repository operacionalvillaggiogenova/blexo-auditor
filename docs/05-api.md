# API implementada

## Convenções

- prefixo `/api`;
- JSON e valores monetários em centavos;
- datas civis `YYYY-MM-DD` e instantes ISO-8601 UTC;
- cookie de sessão `HttpOnly`, `SameSite=Strict` e `Secure` em produção;
- tenant obtido exclusivamente da sessão;
- erros no formato `{ "error": { "code", "message", "fieldErrors", "requestId" } }`;
- recursos editáveis usam `expectedVersion` quando há risco de concorrência.

## Rotas

### Autenticação e plataforma

```text
GET  /health
POST /auth/bootstrap
POST /auth/login
POST /auth/logout
GET  /auth/me

GET  /tenants
POST /tenants
GET  /tenants/:id
```

As rotas de tenant exigem `SUPER_ADMIN`. O bootstrap funciona uma única vez e exige `X-Bootstrap-Token`.

### Administração do condomínio

```text
GET   /users
POST  /users
PATCH /users/:id
POST  /users/:id/revoke-sessions

GET   /bank-accounts
POST  /bank-accounts
PATCH /bank-accounts/:id

GET   /chart-accounts
POST  /chart-accounts
PATCH /chart-accounts/:id
GET   /suppliers
POST  /suppliers
PATCH /suppliers/:id
```

### Importações e livro financeiro

```text
GET  /imports
POST /imports                         multipart: file
GET  /imports/:id/preview
POST /imports/:id/decisions
POST /imports/:id/confirm
POST /imports/:id/reject

GET  /movements
POST /movements                       lançamento manual
GET  /movements/:id
PATCH /movements/:id
PUT  /movements/:id/allocations
POST /movements/:id/cancel
POST /movements/links/internal-transfer
```

Possíveis duplicidades recebem decisões `IMPORT` ou `SKIP_DUPLICATE`. O rateio aceita modo `AMOUNT` ou `PERCENTAGE`; percentuais usam partes por milhão e devem somar `1_000_000`.

### Evidências, fundos e orçamento

```text
POST  /evidences                      multipart: file, movementId, evidenceType
GET   /evidences/:id/download
PATCH /evidences/:id
POST  /evidences/:id/cancel

GET  /funds
POST /funds
GET  /funds/:id/movements
POST /funds/:id/movements

GET  /budgets
POST /budgets
GET  /budgets/:id
POST /budgets/:id/versions
GET  /budgets/:budgetId/versions/:versionId/items
POST /budgets/:budgetId/versions/:versionId/approve
```

### Fechamento, relatórios e auditoria

```text
GET  /periods
GET  /periods/:year/:month/check
POST /periods/close
POST /periods/:id/reopen

GET /reports/dashboard
GET /reports/trial-balance
GET /reports/trial-balance.pdf
GET /reports/ledger
GET /reports/evidence-index
GET /reports/accountability.pdf
GET /reports/budget-comparison
GET /reports/reconciliation
GET /reports/audit
```

Os relatórios financeiros usam `accounting_date`. O fechamento bloqueia alterações financeiras no mês e pode ser reaberto somente por administrador, sempre com motivo e auditoria.

`accountability.pdf` gera livro e índice; com `includeDocuments=1`, incorpora até 100 evidências válidas marcadas para o relatório, limitado a 50 MB por geração.
