# Importação CNAB240

## 1. Escopo suportado

Primeira versão:

- bancos Itaú (`341`) e Sicredi (`748`);
- extrato de conta corrente para conciliação bancária;
- CNAB240, operação `E`, serviço `04`;
- registro detalhe segmento `E`;
- upload manual de arquivo texto.

Fontes:

- [Layout FEBRABAN CNAB240](https://cmsarquivos.febraban.org.br/Arquivos/documentos/PDF/Layout%20padrao%20CNAB240%20V%2010%2011%20-%2031_07_2023.pdf)
- [Manual Itaú CNAB240](https://download.itau.com.br/bankline/conciliacao_bancaria_%20240.pdf)
- [Extrato Eletrônico Sicredi](https://developers.sicredi.com.br/public/docs/getting-started-cnabs-240-electronic-statement)

## 2. Estratégia do parser

```text
leitor de bytes e linhas de 240 posições
        |
        v
parser-base FEBRABAN
        |
        +-- perfil Itaú
        +-- perfil Sicredi
```

O parser-base reconhece a estrutura comum. Perfis tratam versões e particularidades de posições sem espalhar condições bancárias pelo domínio.

O arquivo é processado como bytes. Quebras `CRLF` ou `LF` não contam nas 240 posições. Encoding e caracteres inválidos geram aviso ou erro controlado.

## 3. Campos normalizados do segmento E

| Campo | FEBRABAN | Destino |
|---|---:|---|
| Banco | 1–3 | `bank_code` |
| Lote | 4–7 | `lot_number` |
| Sequência no lote | 9–13 | `record_sequence` |
| Segmento | 14 | deve ser `E` |
| Agência | 53–57 | `branch_number` |
| Conta | 59–70 | `account_number` |
| Data contábil | 135–142 | `accounting_date` |
| Data de ocorrência | 143–150 | `source_event_date` |
| Valor | 151–168 | `amount_cents` |
| Débito/Crédito | 169 | `direction` |
| Categoria | 170–172 | `category_code` |
| Código de histórico | 173–176 | `history_code` |
| Histórico | 177–201 | `description` |
| Documento/complemento | 202–240 | `document_number` |

O perfil Itaú pode restringir o documento às posições 235–240 conforme a versão indicada pelo arquivo.

O campo G084 (`DPV`, `SCR`, `SSR`, `CDS`) não é normalizado para uso funcional. Todos os movimentos são importados sem destaque de disponibilidade.

## 4. Resolução de conta e tenant

O tenant é obtido da sessão. Cada lote deve resolver uma conta cadastrada por:

```text
tenant_id + bank_code + agência + conta + dígitos
```

Um arquivo pode conter várias contas se todas pertencerem ao tenant autenticado. Conta desconhecida ou pertencente a outro tenant rejeita o arquivo completo.

## 5. Fluxo

1. Autorizar `ADMIN` ou `OPERATOR`.
2. Fixar `tenant_id` pela sessão.
3. Validar tamanho máximo e extensão permitida.
4. Calcular SHA-256 do arquivo.
5. Bloquear arquivo já importado no mesmo tenant.
6. Guardar o original no R2 com chave gerada pelo servidor.
7. Validar registros de 240 bytes, header e trailer.
8. Identificar banco e versão.
9. Aceitar somente operação `E`, serviço `04` e segmento `E`.
10. Resolver todos os lotes para contas do tenant.
11. Ler saldos e totais apenas para validação; não persistir saldos.
12. Normalizar movimentos em `bank_import_items`.
13. Comparar fingerprints e produzir a prévia.
14. Receber decisões sobre possíveis duplicidades.
15. Confirmar em lotes atômicos: transação, movimento, sequência e auditoria.
16. Atualizar estatísticas e concluir a importação.

Nenhuma movimentação financeira é gravada antes da confirmação.

## 6. Duplicidade

### Arquivo idêntico

Mesmo `tenant_id + SHA-256`: importação bloqueada.

### Registro inequívoco

Quando documento e demais identificadores permitem correspondência inequívoca, o item é marcado como duplicado confirmado.

### Possível duplicidade

Fingerprint candidato:

```text
tenant + conta + data contábil + direção + valor
+ código de histórico + histórico normalizado + documento
```

O fingerprint é indexado, mas não é uma restrição única: dois pagamentos legítimos podem possuir os mesmos campos. `ADMIN` ou `OPERATOR` decide na prévia.

Se um arquivo sobreposto contiver registros duplicados e novos, somente os novos são importados após confirmação. Os ignorados permanecem registrados na prévia da importação.

## 7. Fixtures e homologação

Enquanto não houver arquivos reais, os testes usam fixtures sintéticas para Itaú e Sicredi contendo:

- débito e crédito;
- PIX;
- tarifa;
- transferência;
- períodos sobrepostos;
- registro inválido;
- múltiplas contas do mesmo tenant;
- tentativa de conta de outro tenant.

O parser só será marcado como homologado para produção depois de executar com arquivos reais anonimizados de cada banco.
