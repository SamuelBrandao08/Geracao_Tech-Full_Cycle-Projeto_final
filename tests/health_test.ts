// tests/health_test.ts
// Pré-requisitos (ver orientações na conversa):
//   1. deno add jsr:@std/assert
//   2. src/app.ts exporta buildApp() e NÃO chama listen() ao ser importado
import { assertEquals, assertStringIncludes } from "@std/assert";
import { buildApp } from "../src/app.ts";

Deno.test("GET /health responde 200 com {status: ok}", async () => {
  const app = await buildApp();
  try {
    // inject() simula a requisição sem abrir porta de rede
    const res = await app.inject({ method: "GET", url: "/health" });

    assertEquals(res.statusCode, 200);
    assertStringIncludes(res.headers["content-type"] as string, "application/json");
    assertEquals(res.json(), { status: "ok" });
  } finally {
    // Sem fechar a instância, o Deno aponta recursos pendentes no teste
    await app.close();
  }
});
