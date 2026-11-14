import type {
  FastifyBaseLogger,
  FastifyInstance,
  FastifyRequest,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from "fastify";
import { type Logger, pino } from "pino";
import client from "prom-client";

export interface Metrics {
  registry: client.Registry;
  httpRequestsTotal: client.Counter<"method" | "route" | "status">;
  httpRequestDurationSeconds: client.Histogram<"method" | "route" | "status">;
  loansDeniedTotal: client.Counter<"reason">;
}

type App<L extends FastifyBaseLogger = FastifyBaseLogger> = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  L
>;

export function createLogger(
  level: string = Deno.env.get("LOG_LEVEL") ?? "info",
): Logger {
  return pino({
    level,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
  });
}

export function createMetrics(): Metrics {
  const registry = new client.Registry();

  const httpRequestsTotal = new client.Counter({
    name: "http_requests_total",
    help: "Total de requisições HTTP por método, rota e status",
    labelNames: ["method", "route", "status"] as const,
    registers: [registry],
  });

  const httpRequestDurationSeconds = new client.Histogram({
    name: "http_request_duration_seconds",
    help: "Duração das requisições HTTP em segundos",
    labelNames: ["method", "route", "status"] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
    registers: [registry],
  });

  const loansDeniedTotal = new client.Counter({
    name: "library_loans_denied_total",
    help: "Total de tentativas de empréstimo negadas por regra ou credencial",
    labelNames: ["reason"] as const,
    registers: [registry],
  });

  return {
    registry,
    httpRequestsTotal,
    httpRequestDurationSeconds,
    loansDeniedTotal,
  };
}

export function instrumentApp<L extends FastifyBaseLogger>(
  app: App<L>,
  metrics: Metrics,
): void {
  app.addHook("onRequest", (request, _reply, done) => {
    (request as FastifyRequest & { startTime?: number }).startTime = performance
      .now();
    done();
  });

  app.addHook("onResponse", (request, reply, done) => {
    const start =
      (request as FastifyRequest & { startTime?: number }).startTime;
    const route = request.routeOptions?.url ?? "unmatched";
    if (route !== "/metrics") {
      const labels = {
        method: request.method,
        route,
        status: String(reply.statusCode),
      };
      metrics.httpRequestsTotal.inc(labels);
      if (start !== undefined) {
        metrics.httpRequestDurationSeconds.observe(
          labels,
          (performance.now() - start) / 1000,
        );
      }
    }
    done();
  });

  app.get("/metrics", async (_request, reply) => {
    reply.header("Content-Type", metrics.registry.contentType);
    return await metrics.registry.metrics();
  });
}
