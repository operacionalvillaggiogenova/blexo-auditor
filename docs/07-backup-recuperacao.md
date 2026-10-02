# Backup e recuperação

## Escopo

O backup precisa preservar duas partes inseparáveis:

1. o banco D1, que contém entidades, vínculos, hashes e trilha de auditoria;
2. os objetos R2, que contêm CNABs originais e evidências.

Um backup de somente uma dessas partes não é considerado recuperável.

## Política recomendada

- exportação lógica diária do D1 para armazenamento separado do ambiente de produção;
- retenção diária por 35 dias e mensal por 24 meses;
- versionamento ou replicação do bucket R2 para uma conta/local independente;
- manifesto por execução com data UTC, ambiente, arquivo D1, quantidade de objetos, bytes e checksums;
- criptografia em repouso e durante a transferência;
- acesso ao backup por credencial distinta da credencial de execução da aplicação;
- nunca restaurar produção em ambiente de desenvolvimento sem anonimização.

## Procedimento de recuperação

1. declarar o incidente e impedir novas gravações;
2. selecionar um ponto consistente do D1 e o manifesto R2 correspondente;
3. criar recursos D1/R2 novos, sem sobrescrever imediatamente os recursos afetados;
4. importar o D1 e validar migrations, chaves estrangeiras, contagens e audit log;
5. restaurar objetos R2 preservando as chaves originais;
6. conferir amostras de `sha256` de CNABs e evidências;
7. executar o roteiro funcional `login → movimento → evidência → balancete`;
8. trocar bindings somente depois da validação e registrar a operação;
9. manter os recursos anteriores em quarentena até o encerramento do incidente.

## Teste de restauração

Executar trimestralmente em ambiente isolado. O teste deve registrar:

- tempo para recuperar D1 e R2;
- total de linhas por tabela;
- total e tamanho dos objetos;
- quantidade de hashes divergentes;
- resultado do `npm run check` e do roteiro ponta a ponta;
- responsáveis, incidentes encontrados e ações corretivas.

## Responsabilidades operacionais

As rotinas de exportação e retenção devem ser configuradas na conta Cloudflare do proprietário do sistema. Secrets ficam no gerenciador da plataforma e nunca no repositório. O deploy da aplicação não substitui o backup, e o histórico Git não contém os dados financeiros nem os documentos.
