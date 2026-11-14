# Declaração de Uso de Inteligência Artificial

Este documento registra de forma transparente como ferramentas de Inteligência Artificial generativa foram utilizadas como apoio técnico no desenvolvimento do **Projeto B** (API de Biblioteca com Carteirinha Digital), conforme as diretrizes da disciplina.

---

## 1. Papel da IA vs. Decisões de Engenharia

A IA atuou como par de revisão técnica, aceleração de *boilerplate* e diagnóstico de falhas de infraestrutura. Todas as decisões arquiteturais, escolhas de bibliotecas, modelagem de domínio, regras de negócio, critérios de segurança e validações finais em ambiente real foram conduzidas, testadas e aprovadas pelo autor.

---

## 2. Etapas e Prompts Relevantes

* **Modelagem de Domínio e Criptografia (`Ed25519` / JWS):**
  * *Uso:* Exploração da Web Crypto API nativa do Deno 2 para geração de chaves assimétricas `Ed25519`, exportação em formato JWK e assinatura/verificação de tokens compactos (JWS) sem depender de bibliotecas externas pesadas.
  * *Validação:* Criação de testes unitários cobrindo expiração (`exp`), rejeição de algoritmo inseguro (`alg: none`), `kid` inválido e adulteração de payload (`src/domain/credential/jws_test.ts` e `src/domain/crypto/ed25519_test.ts`).

* **Persistência e Concorrência no PostgreSQL (`ADR-0001`):**
  * *Uso:* Revisão do DDL e desenho de índice único parcial (`CREATE UNIQUE INDEX ... WHERE returned_at IS NULL`) para impedir empréstimo simultâneo do mesmo exemplar físico diretamente no banco de dados.
  * *Validação:* Testes de integração contra PostgreSQL real validando restrições de integridade e concorrência (`tests/repositories_test.ts`).

* **Observabilidade e Tratamento Global de Erros HTTP:**
  * *Uso:* Estruturação de logs JSON com `pino` e métricas Prometheus (`prom-client`) com normalização de rotas (`route="unmatched"`) para evitar explosão de cardinalidade.
  * *Validação:* Testes automatizados de exposição de métricas e mapeamento de códigos de status (`400`, `401`, `403`, `404`, `409`, `422`) em `tests/observability_test.ts` e `tests/api_flow_test.ts`.

* **Empacotamento Docker e Pipeline CI (GitHub Actions):**
  * *Uso:* Diagnóstico de permissões granulares do runtime Deno (`--allow-net`, `--allow-env`, `--allow-sys=networkInterfaces,hostname`) para execução sob usuário não-root (`USER deno`) e configuração do workflow `.github/workflows/ci.yml` com serviço PostgreSQL e *healthcheck*.
  * *Validação:* Build e execução local com `docker compose up -d --build`, teste de carga com `k6` (`p95 = 4,37 ms`) e execução verde no GitHub Actions.

---

## 3. Verificação e Autoria

Todo o código-fonte em `src/`, a suíte de 20 testes em `tests/` (96,3% de cobertura de linhas), os scripts de carga em `k6/smoke.js` e a documentação técnica foram revisados linha a linha, executados localmente e validados no pipeline de integração contínua pelo autor do repositório.