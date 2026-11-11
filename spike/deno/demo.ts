import Fastify from "fastify";
import { collectDefaultMetricsSafe, createLogger, createMetrics, instrumentApp } from "./observability.ts";

const app = Fastify({ loggerInstance: createLogger("info") });
const metrics = createMetrics();
instrumentApp(app, metrics);
console.log("defaultMetrics:", JSON.stringify(collectDefaultMetricsSafe(metrics.registry)));
app.get("/health", async () => ({ status: "ok" }));
await app.ready();
await app.inject({ method: "GET", url: "/health" });
await app.inject({ method: "GET", url: "/nao-existe" });
const res = await app.inject({ method: "GET", url: "/metrics" });
console.log(res.body.split("\n").filter((l) => l.includes("http_requests_total")).join("\n"));
await app.close();