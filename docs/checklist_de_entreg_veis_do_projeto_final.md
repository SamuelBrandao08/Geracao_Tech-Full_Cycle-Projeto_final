# Checklist de Entregáveis — Projeto Final (Nível B)

Baseado nos requisitos oficiais de **Full Cycle – Projeto final (Módulo 4 ·
Encontro 24)** para o **Projeto B (Nível Simples — API de Domínio Único)**.

---

## 1. Critérios de Avaliação & Rubrica

### M1 — Funciona, Código e Design (Peso 35)

- [x] **Escopo Projeto B:** Uma API de domínio único com **um fluxo principal
      funcionando de ponta a ponta**.
- [x] **Design & SOLID:** Separação clara entre domínio puro (`src/domain/`),
      infraestrutura (`src/infra/`), composição HTTP (`src/app.ts`) e
      _entrypoint_ (`src/main.ts`).
- [x] **Pattern Justificado:** _Repository Pattern_
      (`PostgresLibraryRepository`) isolando o SQL das rotas e casos de uso.
- [ ] **Docker Compose funcional:** `docker-compose.yml` + `Dockerfile` (usuário
      não-root `deno`) subindo toda a stack com **1 comando**
      (`docker compose up -d --build`).

### M2 — Testes e CI Verde (Peso 20)

- [x] **Testes Unitários do Domínio:** Criptografia (`ed25519_test.ts`),
      credencial (`jws_test.ts`), políticas (`policy_test.ts`), conexão
      (`connection_test.ts`) e observabilidade (`observability_test.ts`).
- [x] **Testes de Integração / E2E:** Persistência real com PostgreSQL
      (`repositories_test.ts`) e fluxo HTTP completo (`api_flow_test.ts`) — **20
      testes passando**.
- [x] **Coverage Mínimo Respeitado:** Threshold de **70%** declarado no
      `deno.json` e superado com **96.3% de linhas / 100% de funções / 85.5% de
      branches**.
- [ ] **Pipeline CI Verde:** Arquivo `.github/workflows/ci.yml` executando
      `lint`, `check` e `test` (com serviço PostgreSQL) e passando verde no
      GitHub Actions.

### M3 — Ambientes, Segredos e Observabilidade (Peso 15)

- [x] **Configuração & Segredos:** Variáveis lidas do ambiente; arquivo `.env`
      ignorado no `.gitignore` (zero segredos commitados).
- [ ] **`.env.example`:** Arquivo `.env.example` atualizado na raiz com todas as
      variáveis necessárias documentadas (`POSTGRES_USER`, `POSTGRES_PASSWORD`,
      `POSTGRES_DB`, `DATABASE_URL`, `PORT`, `LOG_LEVEL`).
- [x] **Logs Estruturados:** Logger JSON via `pino`.
- [x] **Métricas & SLO:** Endpoint `/metrics` via `prom-client` (contador +
      histograma de latência para acompanhar SLO).

### M4 — Arquitetura, Documentação e Desempenho (Peso 30)

- [x] **1 ADR (Architecture Decision Record):** `docs/adr/0001-*.md`
      documentando decisão técnica e alternativa descartada (ex.: índice único
      parcial no PostgreSQL para concorrência de empréstimos).
- [ ] **Contrato OpenAPI (`docs/openapi.yaml`):** Especificação OpenAPI 3.1 dos
      endpoints principais e códigos de erro (`200`, `201`, `400`, `401`, `403`,
      `404`, `409`, `422`).
- [ ] **Teste de Desempenho (`docs/desempenho.md`):** 1 _smoke test_ executado
      com **k6** e métricas reais registradas (incluindo **p95** medido e
      comparação com o SLO).
- [ ] **README do Primeiro Dia (`README.md`):**
  - [ ] Nível **Projeto B** declarado na **primeira linha** do `README.md`.
  - [ ] Instruções testadas do zero: como configurar `.env`, como subir
        (`docker compose up`), como rodar testes e como acessar `/health` e
        `/metrics`.
- [ ] **Declaração de Uso de IA (`docs/ia.md`):** Registro transparente dos
      prompts e decisões técnicas tomadas com apoio de IA.

---

## 2. Estrutura Esperada no Repositório (Projeto B)

- [ ] `docker-compose.yml`
- [ ] `Dockerfile` e `.dockerignore`
- [ ] `.env.example`
- [ ] `README.md` (com nível B na primeira linha)
- [ ] `docs/adr/0001-decisao.md`
- [ ] `docs/openapi.yaml`
- [ ] `docs/desempenho.md`
- [ ] `docs/ia.md`
- [ ] `src/` e `tests/`
- [ ] `.github/workflows/ci.yml`

---

## 3. Submissão no Moodle (Até 13/11)

- [ ] **Link do repositório Git** (público ou com convite enviado).
- [ ] **README** completo (nível, como subir, como testar).
- [ ] **Link da execução verde do CI** (GitHub Actions).
- [ ] **`docs/desempenho.md`** preenchido com os números reais do k6.
- [ ] **`CONTRIBUTORS.md`** (se em grupo; opcional/recomendado se individual).
- [ ] _(Opcional — Bônus até 10 pts)_ Vídeo de até 10 min enviado até 13/11 ou
      apresentação ao vivo em 16/11.
