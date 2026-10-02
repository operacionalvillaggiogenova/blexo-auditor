# Blexo Auditor Financeiro

Aplicação web responsiva, multi-tenant e online para auditoria financeira condominial. Importa extratos CNAB240 de Itaú e Sicredi, reúne movimentos bancários e manuais em um livro único, classifica e rateia valores, vincula comprovantes e gera balancetes.

## Recursos implementados

- autenticação por sessão segura e perfis `SUPER_ADMIN`, `ADMIN`, `OPERATOR` e `VIEWER`;
- isolamento obrigatório por condomínio a partir da sessão, nunca do corpo da requisição;
- cadastro de condomínios, usuários, contas bancárias, plano de contas e fornecedores;
- importação CNAB240, operação `E`, serviço `04`, segmento `E`, com perfis Itaú 341 e Sicredi 748;
- prévia, decisão de possíveis duplicidades e confirmação idempotente;
- movimentos bancários imutáveis, lançamentos manuais canceláveis e numeração anual única;
- rateio por valor ou percentual, sem perda de centavos;
- comprovantes PDF/JPG/PNG em R2;
- fundos, orçamento mensal versionado e fechamento/reabertura de período;
- dashboard, conciliação, balancete, livro financeiro, índice de evidências e PDFs;
- trilha de auditoria append-only e limitação persistente de tentativas sensíveis.

O saldo inicial de cada conta é configurado manualmente e trava após o primeiro movimento. Saldos iniciais/finais informados no CNAB não são persistidos nem usados. O balancete usa a data contábil.

## Arquitetura

- `apps/web`: React 19, Vite e CSS responsivo;
- `apps/api`: Cloudflare Worker com Hono;
- `packages/cnab240`: parser por bytes e perfis bancários;
- `packages/contracts`: contratos Zod compartilhados;
- `packages/domain`: regras monetárias e rateio;
- `migrations`: Cloudflare D1/SQLite `STRICT`;
- arquivos originais e comprovantes: Cloudflare R2.

## Executar localmente

Requisitos: Node.js 22 ou superior e Python 3 para a validação independente das migrations.

```powershell
npm install
Copy-Item apps/api/.dev.vars.example apps/api/.dev.vars
npm run db:migrate:local
npm run dev
```

A aplicação abre em `http://localhost:5173` e a API em `http://localhost:8787/api`.

No primeiro uso, crie o superadministrador com o token definido em `apps/api/.dev.vars`:

```powershell
$body = @{ email = "admin@exemplo.com"; displayName = "Super Admin"; password = "uma-senha-segura" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:8787/api/auth/bootstrap" -Headers @{ "X-Bootstrap-Token" = "local-bootstrap-token" } -ContentType "application/json" -Body $body
```

## Qualidade

```powershell
npm run typecheck
npm test
npm run build
```

Os testes cobrem parser Itaú/Sicredi, dinheiro e rateio, segurança, formatação e invariantes do banco. `scripts/validate_migrations.py` aplica todas as migrations em banco vazio e testa isolamento entre tenants, numeração, imutabilidade de movimentos e auditoria.

## Publicação

Os bindings de produção ficam em `apps/api/wrangler.jsonc`. Para uma nova conta, ajuste o ID do D1, o bucket R2 e o `account_id`, configure `BOOTSTRAP_TOKEN` e `SESSION_SECRET` como secrets e execute:

```powershell
npm run db:migrate:remote
npm run deploy
```

A homologação produtiva do parser permanece condicionada a arquivos reais anonimizados de Itaú e Sicredi; os testes atuais usam fixtures sintéticas representativas.

## Documentação

- [Especificação funcional](docs/01-especificacao-funcional.md)
- [Arquitetura](docs/02-arquitetura.md)
- [Modelo de dados](docs/03-modelo-de-dados.md)
- [Importação CNAB240](docs/04-importacao-cnab240.md)
- [API](docs/05-api.md)
- [Plano e critérios de aceite](docs/06-plano-de-implementacao.md)
- [Backup e recuperação](docs/07-backup-recuperacao.md)
