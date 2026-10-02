# Especificação funcional

## 1. Objetivo

O Blexo Auditor Financeiro recebe movimentos de contas correntes, permite sua classificação e justificação, incorpora ajustes manuais e produz balancetes auditáveis. Não pretende substituir um ERP contábil, cobrança condominial ou sistema fiscal.

## 2. Escopo da primeira versão

Incluído:

- tenants e usuários;
- perfis `SUPER_ADMIN`, `ADMIN`, `OPERATOR` e `VIEWER`;
- cadastro de contas bancárias;
- importação de extrato CNAB240 Itaú e Sicredi;
- prévia, confirmação e proteção contra duplicidade;
- movimentos bancários e manuais em um livro financeiro único;
- classificação, justificativa e rateio;
- plano de contas hierárquico;
- fornecedores;
- evidências PDF, JPG e PNG;
- transferências entre contas próprias;
- fundos e orçamento versionado;
- balancete por caixa e competência;
- fechamento e reabertura mensal;
- trilha de auditoria.

Excluído:

- importação financeira por PDF ou Excel;
- operação offline ou PWA;
- contas a pagar completas;
- cobrança de moradores, boletos, folha ou fiscal;
- Open Finance e integração bancária em tempo real;
- conciliação automática sem confirmação;
- aplicativo de moradores e WhatsApp.

## 3. Conceitos

### Registro bancário

`bank_transaction` é a representação imutável de um registro detalhe do segmento E de um extrato CNAB240. Seus campos de origem não podem ser editados ou apagados.

### Movimento financeiro

`financial_movement` é a unidade numerada exibida no livro e no balancete.

- Origem `BANK`: criado automaticamente para um `bank_transaction`.
- Origem `MANUAL`: criado por um operador para um ajuste posterior.

Ambas as origens participam dos mesmos cálculos. Movimentos manuais sempre indicam a conta bancária afetada.

### Rateio

Um movimento mantém um único número e pode ser distribuído entre várias contas contábeis por valor ou percentual. Os valores canônicos do rateio são armazenados em centavos.

### Evidência

Documento relacionado ao movimento. O arquivo fica em R2 e seus metadados ficam em D1. Formatos aceitos na primeira versão: PDF, JPG e PNG.

## 4. Datas

Todo movimento possui:

- `accounting_date`: data contábil; comanda o balancete de caixa;
- `competence_date`: competência gerencial/contábil; comanda o balancete por competência;
- `created_at`: instante UTC de criação no sistema.

Para origem bancária, `accounting_date` vem do campo G088 do CNAB. A data de ocorrência G089 pode ser preservada como metadado técnico da transação, mas não comanda o balancete.

## 5. Valores e sinais

- Valores são `INTEGER` em centavos e sempre maiores que zero.
- Débito e crédito são armazenados separadamente em `direction`.
- O valor assinado é derivado: débito negativo, crédito positivo.
- Valores devem permanecer dentro de `Number.MAX_SAFE_INTEGER` na API JavaScript.

## 6. Saldo por conta

Cada conta possui saldo inicial manual e data inicial. O saldo calculado é:

```text
saldo inicial
+ créditos bancários ativos
- débitos bancários ativos
+ créditos manuais ativos
- débitos manuais ativos
```

Saldos inicial e final existentes nos extratos CNAB são usados somente na validação estrutural do arquivo e não são persistidos.

Depois de existirem movimentos, o saldo inicial não é editado. Correções são lançamentos manuais auditados.

## 7. Classificação

Tipos permitidos:

- `INCOME`;
- `EXPENSE`;
- `TRANSFER`;
- `ADJUSTMENT`;
- `FUND`;
- `IGNORED`.

Um movimento sem rateio permanece `UNCLASSIFIED` e aparece no grupo `A classificar`, sem desaparecer dos totais de caixa.

`IGNORED` exige justificativa e autorização de `ADMIN`. Ele continua afetando o saldo da conta quando representa movimento bancário, mas não compõe receitas ou despesas.

## 8. Rateio

- Um rateio usa somente valores ou somente percentuais.
- Rateio percentual soma exatamente 100%.
- Rateio por valor soma exatamente o valor do movimento.
- O cálculo percentual é convertido para centavos; eventual resíduo vai para a última linha.
- Linhas zeradas ou negativas são proibidas.
- Após fechamento do período, rateios ficam bloqueados.

## 9. Transferências internas

Os dois lados continuam afetando os saldos das respectivas contas, mas não compõem receitas ou despesas. Débito e crédito podem ser vinculados por uma relação `INTERNAL_TRANSFER`.

## 10. Cancelamento

Movimentos manuais podem ser cancelados logicamente. O cancelamento exige motivo, usuário e data. O movimento deixa de sensibilizar saldos e relatórios, mas permanece consultável e auditado.

Registros bancários nunca são cancelados ou apagados. Eventuais estornos bancários são novos registros recebidos do banco.

## 11. Numeração

Movimentos bancários e manuais compartilham uma sequência anual por tenant:

```text
#260001
#260002
#270001
```

A sequência reinicia por exercício, números cancelados não são reutilizados e lacunas são permitidas.

## 12. Multi-tenancy

- Usuário comum pertence a um único tenant.
- O tenant vem da sessão autenticada.
- Toda tabela de negócio possui `tenant_id` obrigatório.
- Relações de negócio usam chaves estrangeiras compostas por `tenant_id` e `id` quando aplicável.
- `ADMIN`, `OPERATOR` e `VIEWER` atuam somente no próprio tenant.
- `SUPER_ADMIN` cria e administra tenants e usuários administrativos.
- Consultas, comandos e índices relevantes começam pelo tenant.

## 13. Permissões

| Ação | SUPER_ADMIN | ADMIN | OPERATOR | VIEWER |
|---|---:|---:|---:|---:|
| Criar tenant | Sim | Não | Não | Não |
| Administrar usuários do tenant | Sim | Sim | Não | Não |
| Administrar contas bancárias | Não | Sim | Não | Não |
| Importar CNAB | Não | Sim | Sim | Não |
| Classificar e justificar | Não | Sim | Sim | Não |
| Criar movimento manual | Não | Sim | Sim | Não |
| Cancelar movimento manual | Não | Sim | Não | Não |
| Ignorar movimento | Não | Sim | Não | Não |
| Anexar evidência | Não | Sim | Sim | Não |
| Fechar ou reabrir período | Não | Sim | Não | Não |
| Consultar e gerar relatório | Não | Sim | Sim | Sim |

O `SUPER_ADMIN` não opera dados financeiros por padrão; suporte excepcional deve ser explícito e auditado.
