# Arquitetura

## 1. Visão geral

```text
Navegador
  React + TypeScript + Vite
          |
          | HTTPS / JSON
          v
Cloudflare Worker API
  autenticação, autorização, domínio e importação
       |                         |
       v                         v
Cloudflare D1               Cloudflare R2
dados e auditoria           CNABs, evidências e relatórios
```

A aplicação é responsiva e exclusivamente online. Nenhum dado financeiro é disponibilizado para edição offline.

## 2. Estrutura recomendada do repositório

```text
apps/
  web/                    React/Vite
  api/                    Cloudflare Worker REST
packages/
  contracts/              schemas compartilhados e DTOs
  domain/                 regras financeiras puras
  cnab240/                parser-base e perfis Itaú/Sicredi
migrations/               migrations D1 versionadas
docs/                     especificações e ADRs
fixtures/                 CNABs sintéticos sem dados reais
```

Um monorepo evita duplicação de tipos entre frontend, API e parser. O Worker pode servir a API e os assets compilados, mantendo um único domínio de aplicação.

## 3. Componentes

### Web

- React e TypeScript;
- React Router;
- Tailwind CSS;
- formulários com validação baseada nos contratos compartilhados;
- nenhuma confiança em permissões do frontend;
- estado de sessão obtido em `/api/v1/auth/me`;
- tela de conexão necessária quando a rede estiver indisponível.

### API

- REST sob `/api/v1`;
- autenticação por cookie `HttpOnly`, `Secure` e `SameSite`;
- autorização por papel no backend;
- tenant resolvido exclusivamente da sessão;
- validação de entrada em todos os endpoints;
- alterações financeiras e `audit_logs` no mesmo `D1 batch`;
- respostas paginadas por cursor;
- idempotência nos comandos de importação e criação sensível.

### D1

- tabelas `STRICT`;
- valores financeiros em centavos;
- datas civis em `YYYY-MM-DD`;
- instantes em ISO-8601 UTC;
- índices iniciando por `tenant_id`;
- foreign keys habilitadas;
- migrations promovidas separadamente por ambiente.

### R2

Chaves lógicas:

```text
/{tenant_id}/bank-imports/{year}/{month}/{uuid}
/{tenant_id}/evidences/{year}/{movement_id}/{uuid}
/{tenant_id}/reports/{year}/{month}/{uuid}
```

O nome original é metadado, nunca a chave do objeto. Buckets não são públicos. Downloads passam por autorização ou URL assinada curta.

## 4. Ambientes

`development`, `preview` e `production` possuem bindings próprios de D1 e R2. Testes e previews nunca usam recursos de produção.

Pipeline mínimo:

```text
lint -> typecheck -> testes unitários -> testes de integração D1
     -> build -> deploy preview -> smoke test -> deploy production
```

Aplicar migration em produção é uma etapa explícita, precedida de backup.

## 5. Autenticação

O modelo suporta autenticação própria por e-mail e senha:

- hash com implementação de `scrypt` compatível com Workers;
- sessão aleatória armazenada apenas como hash;
- rotação após login e mudança de privilégio;
- expiração absoluta e por inatividade;
- revogação por usuário;
- rate limit de login;
- recuperação de senha com token de uso único.

A troca futura por um provedor de identidade não altera `tenant_id` nem o modelo de autorização.

## 6. Consistência D1/R2

Uploads usam estado intermediário:

```text
PENDING_UPLOAD -> UPLOADED -> VERIFIED -> ACTIVE
                              \-> REJECTED
```

O objeto é enviado com chave gerada pelo servidor, validado por tamanho, extensão, MIME e assinatura binária, e só então associado ao registro ativo. Uma rotina remove objetos temporários órfãos.

## 7. Observabilidade

- `request_id` em toda requisição e erro;
- logs estruturados sem documentos, senhas ou tokens;
- métricas de importações, duplicidades e falhas;
- alertas para erro de parser, falha de backup e inconsistência D1/R2;
- auditoria de download de evidências sensíveis quando necessário.

## 8. Backup

- Time Travel do D1 como recuperação de curto prazo;
- exportação programada de D1 para armazenamento de backup;
- inventário periódico de objetos R2 e hashes;
- cópia em domínio de falha separado;
- restauração ensaiada e documentada;
- RPO e RTO definidos antes da produção.
