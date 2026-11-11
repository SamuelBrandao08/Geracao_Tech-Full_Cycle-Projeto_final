import Fastify, { type FastifyInstance } from "fastify";

const memberSchema = {
  body: {
    type: "object",
    required: ["name", "category"],
    additionalProperties: false,
    properties: {
      name: { type: "string", minLength: 1, maxLength: 100 },
      category: { type: "string", enum: ["aluno", "professor", "externo"] },
    },
  },
} as const;

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health", () => ({ status: "ok" }));

  app.get("/db-check", () => ({ status: "ok" }));

  app.post<{ Body: { name: string; category: string } }>(
    "/members",
    { schema: memberSchema },
    (request, reply) => {
      const { name, category } = request.body;
      return reply.code(201).send({ id: crypto.randomUUID(), name, category });
    },
  );

  return app;
}
