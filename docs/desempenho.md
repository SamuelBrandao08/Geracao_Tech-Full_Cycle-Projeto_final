# Relatório de Desempenho e Teste de Carga (`k6`)

Este documento registra a definição do **SLO (Service Level Objective)**, a
metodologia do _smoke test_ executado com o **Grafana k6** e as métricas reais
coletadas sobre o fluxo principal da aplicação (**Projeto B** — Biblioteca com
Carteirinha Digital Ed25519).

---

## 1. Objetivo e SLO Declarado

Validar o comportamento da API (Deno + Fastify + PostgreSQL) sob concorrência
real em ambiente containerizado, garantindo que a verificação criptográfica das
carteirinhas (`Ed25519` via Web Crypto API) e o controle transacional de
empréstimos no banco não degradem a latência nem gerem falhas.

| Indicador (SLI)                        | Meta (SLO) | Justificativa                                                                         |
| :------------------------------------- | :--------- | :------------------------------------------------------------------------------------ |
| **Latência p95 (`http_req_duration`)** | `< 200 ms` | Garantir resposta imediata no balcão de atendimento da biblioteca                     |
| **Taxa de Erro (`http_req_failed`)**   | `< 1,00%`  | Zero falhas inesperadas (`5xx`) ou bloqueios indevidos sob carga concorrente          |
| **Asserções Funcionais (`checks`)**    | `100%`     | Todos os fluxos de consulta, empréstimo e devolução devem respeitar os contratos HTTP |

---

## 2. Ambiente e Configuração do Teste

- **Infraestrutura:** Containers Docker via `docker compose up -d --build`
  (`app` Deno + `postgres:16-alpine`) rodando localmente em rede _host_.
- **Roteiro:** `k6/smoke.js`
- **Cenário de Carga:**
  - **Usuários Virtuais (VUs):** `5` VUs simultâneos
  - **Duração:** `15s` (com `sleep(0.2)` entre iterações)
  - **Fluxo executado por iteração:**
    1. `GET /books` — Consulta de disponibilidade no catálogo (`200 OK`)
    2. `POST /loans` — Validação de assinatura JWS Ed25519, revogação, limite
       por categoria e registro de empréstimo (`201 Created`)
    3. `POST /loans/:id/return` — Devolução do exemplar e liberação para o
       próximo ciclo (`200 OK`)

### Comando Executado

```bash
docker run --rm -i --network=host grafana/k6 run - < k6/smoke.js

Métrica,Valor Medido,Meta (SLO),Status
Latência Média (avg),"2,02 ms",—,—
Latência Mediana (med / p50),"1,23 ms",—,—
Latência p90,"3,88 ms",—,—
Latência p95,"4,37 ms",< 200 ms,Aprovado
Latência Máxima (max),"13,11 ms",—,—
Vazão (Throughput),"72,67 req/s (24,16 iter/s)",—,—
Taxa de Falhas HTTP,"0,00% (0 / 1098)","< 1,00%",Aprovado
Checks Funcionais,"100,00% (1095 / 1095)",100%,Aprovado
Duração Média da Iteração,"206,72 ms (inclui 200 ms de sleep)",—,—
```
