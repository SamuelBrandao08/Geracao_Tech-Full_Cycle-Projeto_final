# ADR 0001: Garantia de Unicidade em Empréstimos Ativos

- Status: Aceito
- Data: 2026-11-08

## Contexto e Problema

Um mesmo exemplar (`copy_id`) não pode estar associado a dois empréstimos ativos
ao mesmo tempo. Em cenários de requisições concorrentes simultâneas, o sistema
deve impedir race conditions.

## Alternativas Consideradas

### 1. Locks no Nível de Aplicação (Mutexes / Distributed Locks)

- **Prós:** Não exige recursos específicos do banco de dados.
- **Contras:** Falha em ambientes distribuídos ou com múltiplas instâncias da
  API sem uma camada de coordenação (como Redis).
- **Motivo do Descarte:** Adiciona complexidade operacional e dependência
  desnecessária para o escopo do Projeto B.

### 2. Lock Otimista via Controle de Versão/Status na Tabela Copy

- **Prós:** Funciona bem em bancos relacionais padrão.
- **Contras:** Exige múltiplos `UPDATEs` e checagens explícitas de versão na
  camada de aplicação.
- **Motivo do Descarte:** Maior verbosidade de código e risco de bugs na
  aplicação.

### 3. Índice Único Parcial no PostgreSQL — RECOMENDADA

- **Prós:** Força a regra no próprio motor do PostgreSQL via DDl simples
  (`CREATE UNIQUE INDEX idx_active_loan_per_copy ON loans (copy_id) WHERE returned_at IS NULL;`).
  Elimina race conditions nativamente.
- **Contras:** Acopla a regra de integridade estrita ao banco relacional
  PostgreSQL.

## Decisão

Adotar o **Índice Único Parcial no PostgreSQL**.

## Consequências

- A tentativa de criar dois empréstimos para o mesmo exemplar enquanto o
  anterior não for devolvido (`returned_at IS NULL`) gera uma violação de chave
  única no PostgreSQL, capturada pela API como erro `409 Conflict`.
