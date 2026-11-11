// Spike item 1: Fastify no Deno com rota e validação por schema.
// Rodar:  deno run --allow-net --allow-env --allow-read --allow-sys=networkInterfaces main.ts
// (--allow-sys=networkInterfaces: o Fastify lista as interfaces de rede ao subir)

import Fastify, { type FastifyInstance } from "npm:fastify@^5";
import postgres from "npm:postgres";

const CATEGORIAS = ["aluno", "professor", "externo"] as const;

// Função 1: GET /health
export function registrarHealth(app: FastifyInstance): void {
  app.get("/health", () => ({ status: "ok" }));
}

// Função 2: POST /members com validação por schema (body e resposta)
export function registrarCriarSocio(app: FastifyInstance): void {
  app.post(
    "/members",
    {
      schema: {
        body: {
          type: "object",
          required: ["nome", "categoria"],
          additionalProperties: false,
          properties: {
            nome: { type: "string", minLength: 1, maxLength: 120 },
            categoria: { type: "string", enum: [...CATEGORIAS] },
          },
        },
        response: {
          201: {
            type: "object",
            properties: {
              id: { type: "string" },
              nome: { type: "string" },
              categoria: { type: "string" },
            },
          },
        },
      },
    },
    (request, reply) => {
      const { nome, categoria } = request.body as {
        nome: string;
        categoria: string;
      };
      return reply.code(201).send({ id: crypto.randomUUID(), nome, categoria });
    },
  );
}

// Função 3: GET /db-check testa o acesso ao DB
export function checarDB(app: FastifyInstance): void {
  const sql: postgres.Sql = postgres({
    host: Deno.env.get("POSTGRES_HOST") ?? "localhost",
    port: Number(Deno.env.get("POSTGRES_PORT") ?? 5432),
    database: Deno.env.get("POSTGRES_DB"),
    username: Deno.env.get("POSTGRES_USER"),
    password: Deno.env.get("POSTGRES_PASSWORD"),
    connect_timeout: 3,
  });
  app.get("/db-check", async (_req, reply) => {
    try {
      const [row] = await sql`select now() as now`;
      return { status: "ok", now: row.now };
    } catch (err) {
      console.error("db-check falhou:", err); // remover log
      app.log.error({ err }, "db-check falhou");
      return reply.code(503).send({ status: "error" });
    } 
    // finally {
    //   await sql.end();
    // }
  });
}


// Função 4: tratamento de erros — entrada inválida vira 400 controlado,
// qualquer outra falha vira 500 genérico (sem vazar detalhes internos).
export function registrarTratamentoDeErros(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error.validation) {
      return reply.code(400).send({
        erro: "validacao",
        detalhes: error.validation.map((v) => ({
          campo: v.instancePath || v.params?.missingProperty || "(raiz)",
          mensagem: v.message,
        })),
      });
    }
    // Erros do próprio Fastify com status 4xx (ex.: JSON malformado) são do cliente.
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.code(status).send({ erro: "requisicao_invalida" });
    }
    request.log.error(error);
    return reply.code(500).send({ erro: "interno" });
  });
}

// Monta a aplicação sem abrir porta (útil para app.inject() nos testes, item 4).
export function buildApp(): FastifyInstance {
  // O Ajv do Fastify, por padrão, converte tipos (123 -> "123") e descarta campos extras
  // em silêncio. Para validação estrita (importante em credenciais), desligamos os dois.
  const app = Fastify({
    logger: false,
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false } },
  });
  registrarTratamentoDeErros(app);
  registrarHealth(app);
  registrarCriarSocio(app);
  checarDB(app);
  return app;
}

if (import.meta.main) {
  const app = buildApp();
  await app.listen({ port: 3000, host: "0.0.0.0" });
  console.log("Ouvindo em http://localhost:3000");
}
