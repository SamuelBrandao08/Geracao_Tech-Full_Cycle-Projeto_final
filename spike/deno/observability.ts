// spike/observability.ts
// Item 5 da spike: log estruturado (pino) e métrica (prom-client) com Fastify no Deno.
// Código descartável: serve para validar a stack, não é o código final do projeto.

import type {
  FastifyBaseLogger,
  FastifyInstance,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from "fastify";
import { pino, type Logger } from "pino";
import client from "prom-client";

export interface Metrics {
  registry: client.Registry;
  httpRequestsTotal: client.Counter<"method" | "route" | "status">;
}

// Aceita qualquer logger compatível com o Fastify (inclusive uma instância pino).
type App<L extends FastifyBaseLogger = FastifyBaseLogger> = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  L
>;

export interface DefaultMetricsResult {
  ok: boolean;
  error?: string;
}

/**
 * 1) Logger estruturado: cada linha sai em JSON com nível, horário (ISO) e mensagem.
 * O identificador da requisição (reqId) é adicionado pelo Fastify ao logar cada requisição.
 */
export function createLogger(level: string = Deno.env.get("LOG_LEVEL") ?? "info"): Logger {
  return pino({
    level,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      // Troca o nível numérico (30) pelo nome ("info"), mais legível em qualquer ferramenta.
      level: (label) => ({ level: label }),
    },
  });
}

/**
 * 2) Métricas: um Registry próprio (evita estado global) e o contador
 * http_requests_total com labels method, route e status.
 */
export function createMetrics(): Metrics {
  const registry = new client.Registry();
  const httpRequestsTotal = new client.Counter({
    name: "http_requests_total",
    help: "Total de requisições HTTP por método, rota e status",
    labelNames: ["method", "route", "status"] as const,
    registers: [registry],
  });
  return { registry, httpRequestsTotal };
}

/**
 * 3) Instrumentação da aplicação:
 *    - hook onResponse incrementa o contador a cada resposta;
 *    - rota GET /metrics expõe o registry no formato Prometheus.
 * Usa o padrão da rota (/loans/:id), não a URL real, para não explodir a cardinalidade.
 */
export function instrumentApp<L extends FastifyBaseLogger>(app: App<L>, metrics: Metrics): void {
  app.addHook("onResponse", (request, reply, done) => {
    const route = request.routeOptions?.url ?? "unmatched";
    if (route !== "/metrics") {
      metrics.httpRequestsTotal.inc({
        method: request.method,
        route,
        status: String(reply.statusCode),
      });
    }
    done();
  });

  app.get("/metrics", async (_request, reply) => {
    reply.header("Content-Type", metrics.registry.contentType);
    return await metrics.registry.metrics();
  });
}

/**
 * 4) Métricas padrão (CPU, memória, event loop) em modo seguro.
 * Se o Deno não suportar alguma API usada pelo prom-client, não derruba a aplicação:
 * devolve { ok: false, error } para registrarmos na tabela da spike.
 */
export function collectDefaultMetricsSafe(registry: client.Registry): DefaultMetricsResult {
  try {
    client.collectDefaultMetrics({ register: registry });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
