# Plano de implementação

## Princípio

Construir primeiro uma fatia vertical completa, evitando desenvolver muitos cadastros antes de validar o fluxo bancário real.

## Fase 0 — Fundação verificável

Entregas:

- monorepo TypeScript;
- React/Vite e Worker REST;
- ambientes local, preview e produção;
- D1 e R2 separados por ambiente;
- migrations e seed local;
- autenticação e autorização;
- tenant fixado pela sessão;
- contas bancárias;
- audit log transacional;
- CI com lint, tipos, testes e build.

Critérios de aceite:

- usuário do tenant A não lê ou altera dados do tenant B;
- `SUPER_ADMIN` cria tenant e primeiro administrador;
- operador não executa ações exclusivas de administrador;
- testes nunca usam D1/R2 de produção;
- migrations sobem em banco vazio.

## Fase 1 — Fatia vertical bancária

Entregas:

- parser-base FEBRABAN;
- perfis Itaú e Sicredi;
- upload R2 e hash;
- prévia e confirmação;
- importação multi-conta dentro do mesmo tenant;
- duplicidade de arquivo e movimento;
- criação automática de movimento `BANK`;
- tela de movimentos e pendências;
- classificação e justificativa;
- rateio por valor e percentual;
- balancete básico por caixa;
- movimento manual e cancelamento lógico.

Critérios de aceite:

- cada registro aceito tem 240 bytes;
- somente operação `E`, serviço `04`, segmento `E` é importada;
- arquivo de outro tenant é rejeitado;
- reimportação não duplica movimentos;
- arquivo sobreposto importa apenas itens novos confirmados;
- soma dos rateios fecha até o centavo;
- movimento bancário não pode ser alterado ou apagado;
- movimento manual cancelado deixa de afetar saldo e permanece no histórico;
- saldo calculado e balancete usam a mesma base de movimentos ativos.

Gate: homologar com arquivos reais anonimizados de Itaú e Sicredi antes de produção.

## Fase 2 — Evidências e auditoria documental

Entregas:

- upload PDF/JPG/PNG;
- validação por assinatura binária, MIME e tamanho;
- flags de validade e inclusão em relatório;
- estados sem evidência/parcial/completa;
- visualização e download autorizados;
- limpeza de objetos órfãos.

## Fase 3 — Fundos e orçamento

Entregas:

- fundos e movimentos;
- orçamento anual e mensal;
- versões original e revisada;
- comparação realizado × vigente;
- alertas configuráveis.

## Fase 4 — Relatórios

Entregas:

- balancete resumido;
- balancete com índice de evidências;
- livro completo;
- links internos no PDF quando viável;
- relatórios por caixa e competência.

## Fase 5 — Dashboard e fechamento

Entregas:

- indicadores financeiros e de auditoria;
- alertas;
- fechamento mensal com checklist;
- reabertura exclusiva de administrador;
- bloqueio de alterações em período fechado.

## Estratégia de testes

### Unidade

- conversão CNAB para centavos;
- datas DDMMAAAA;
- débito/crédito;
- normalização de fingerprint;
- rateio e arredondamento;
- cálculo de saldos e resultado.

### Propriedade

- rateios nunca criam nem perdem centavos;
- soma das parcelas é sempre o total;
- cancelamento é idempotente;
- fingerprint é estável para a mesma entrada normalizada.

### Integração

- migrations em D1 local;
- constraints multi-tenant;
- transação financeira junto com audit log;
- concorrência na sequência anual;
- confirmação idempotente de importação;
- bloqueio de período fechado;
- falhas compensadas entre D1 e R2.

### End-to-end

```text
login -> conta -> upload -> prévia -> confirmação
-> classificação -> rateio -> evidência -> balancete
```

## Definition of Done

Uma entrega só é concluída quando possui:

- critérios de aceite automatizados;
- autorização backend;
- isolamento de tenant testado;
- audit log quando aplicável;
- estados de erro e carregamento na interface;
- observabilidade sem dados sensíveis;
- documentação atualizada.
