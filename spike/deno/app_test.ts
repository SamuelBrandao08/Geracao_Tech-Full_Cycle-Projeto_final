import { assert, assertEquals, assertExists } from "@std/assert";
import { buildApp } from "./app.ts";

// Critérios 1, 2 e 4 do item 4: cada teste cria a sua própria instância
// e a fecha no `finally`. Os sanitizers do Deno (ativos por padrão)
// falham o teste se sobrar recurso ou operação assíncrona pendente.

Deno.test("1. POST /members com payload válido retorna 201 e o membro criado", async () => {
  const app = buildApp();
  try {
    const res = await app.inject({
      method: "POST",
      url: "/members",
      payload: { name: "Ana Souza", category: "aluno" },
    });

    assertEquals(res.statusCode, 201);
    const body = res.json();
    assertEquals(body.name, "Ana Souza");
    assertEquals(body.category, "aluno");
    assertExists(body.id);
  } finally {
    await app.close();
  }
});

Deno.test("2. POST /members sem campo obrigatório retorna 400", async () => {
  const app = buildApp();
  try {
    const res = await app.inject({
      method: "POST",
      url: "/members",
      payload: { category: "aluno" }, // falta `name`
    });

    assertEquals(res.statusCode, 400);
    assertExists(res.json().message);
  } finally {
    await app.close();
  }
});

Deno.test("3. POST /members com categoria fora do enum retorna 400", async () => {
  const app = buildApp();
  try {
    const res = await app.inject({
      method: "POST",
      url: "/members",
      payload: { name: "Beto", category: "visitante" },
    });

    assertEquals(res.statusCode, 400);
  } finally {
    await app.close();
  }
});

Deno.test("4. GET /health responde 200 e o servidor fecha sem recursos pendentes", async () => {
  const app = buildApp();
  await app.ready();
  try {
    const res = await app.inject({ method: "GET", url: "/health" });

    assertEquals(res.statusCode, 200);
    assertEquals(res.json(), { status: "ok" });
  } finally {
    await app.close();
  }
  // Após o close, a instância não deve mais aceitar requisições.
  assert(!app.server.listening);
});
