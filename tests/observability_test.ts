import { assertEquals, assertStringIncludes } from "@std/assert";
import Fastify from "fastify";
import {
  createLogger,
  createMetrics,
  instrumentApp,
} from "../src/infra/observability/observability.ts";

function build() {
  const app = Fastify({ loggerInstance: createLogger("silent") });
  const metrics = createMetrics();
  instrumentApp(app, metrics);
  app.get("/health", () => ({ status: "ok" }));
  return { app, metrics };
}

Deno.test("observability: contador e histograma aparecem em /metrics", async () => {
  const { app } = build();
  await app.ready();
  await app.inject({ method: "GET", url: "/health" });
  await app.inject({ method: "GET", url: "/health" });
  await app.inject({ method: "GET", url: "/nao-existe" });

  const res = await app.inject({ method: "GET", url: "/metrics" });
  assertEquals(res.statusCode, 200);
  assertStringIncludes(
    res.body,
    'http_requests_total{method="GET",route="/health",status="200"} 2',
  );
  assertStringIncludes(res.body, 'route="unmatched",status="404"} 1');
  assertStringIncludes(res.body, "http_request_duration_seconds_bucket");
  await app.close();
});

Deno.test("observability: createLogger respeita o nível informado", () => {
  assertEquals(createLogger("warn").level, "warn");
});