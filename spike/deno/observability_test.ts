import Fastify from "fastify";
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  collectDefaultMetricsSafe,
  createLogger,
  createMetrics,
  instrumentApp,
} from "./observability.ts";

function build() {
  const app = Fastify({ loggerInstance: createLogger("info") });
  const metrics = createMetrics();
  instrumentApp(app, metrics);
  app.get("/health", async () => ({ status: "ok" }));
  return { app, metrics };
}

Deno.test("contador incrementa e aparece em /metrics", async () => {
  const { app } = build();
  await app.ready();
  await app.inject({ method: "GET", url: "/health" });
  await app.inject({ method: "GET", url: "/health" });
  await app.inject({ method: "GET", url: "/nao-existe" });

  const res = await app.inject({ method: "GET", url: "/metrics" });
  assertEquals(res.statusCode, 200);
  assertStringIncludes(res.body, 'http_requests_total{method="GET",route="/health",status="200"} 2');
  assertStringIncludes(res.body, 'route="unmatched",status="404"} 1');
  await app.close();
});

Deno.test("collectDefaultMetricsSafe devolve resultado sem lançar exceção", async () => {
  const { app, metrics } = build();
  const result = collectDefaultMetricsSafe(metrics.registry);
  console.log("collectDefaultMetrics:", JSON.stringify(result));
  assert(typeof result.ok === "boolean");
  await app.close();
});

Deno.test("createLogger usa o nível informado", () => {
  assertEquals(createLogger("warn").level, "warn");
});