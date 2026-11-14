import Fastify, {
  type FastifyError,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { FastifySchemaValidationError } from "fastify/types/schema";
import { type Logger } from "pino";
import {
  issueCredential,
  type MemberCategory,
  verifyCredential,
} from "./domain/credential/jws.ts";
import {
  calculateExpiration,
  canMemberBorrow,
} from "./domain/library/policy.ts";
import { checkDbHealth, type Sql } from "./infra/db/connection.ts";
import {
  ConflictError,
  NotFoundError,
  PostgresLibraryRepository,
} from "./infra/db/repositories.ts";
import {
  createLogger,
  createMetrics,
  instrumentApp,
  type Metrics,
} from "./infra/observability/observability.ts";

export interface AppDependencies {
  sql: Sql;
  repository: PostgresLibraryRepository;
  signingKey: {
    kid: string;
    privateKey: CryptoKey;
    publicKeysByKid: Record<string, JsonWebKey>;
  };
  enableLogger?: boolean;
  logger?: Logger;
  metrics?: Metrics;
}

export function buildApp(deps: AppDependencies) {
  const logger = deps.logger ??
    createLogger(deps.enableLogger ? "info" : "silent");
  const metrics = deps.metrics ?? createMetrics();

  const app = Fastify({
    loggerInstance: logger,
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false } },
  });

  instrumentApp(app, metrics);

  // --- Tratamento Global de Erros ---
  app.setErrorHandler(
    (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
      const validationErrors = error.validation as
        | FastifySchemaValidationError[]
        | undefined;
      if (validationErrors) {
        return reply.code(400).send({
          error: "validation_error",
          details: validationErrors.map((v) => ({
            field: v.instancePath || v.params?.missingProperty || "(root)",
            message: v.message,
          })),
        });
      }

      if (error instanceof ConflictError) {
        return reply.code(409).send({
          error: "conflict",
          message: error.message,
        });
      }

      if (error instanceof NotFoundError) {
        return reply.code(404).send({
          error: "not_found",
          message: error.message,
        });
      }

      const status = (error as { statusCode?: number }).statusCode;
      if (status && status >= 400 && status < 500) {
        return reply.code(status).send({
          error: "bad_request",
          message: error.message,
        });
      }

      request.log.error(error);
      return reply.code(500).send({ error: "internal_server_error" });
    },
  );

  // --- Saúde e Banco ---
  app.get("/health", () => ({ status: "ok" }));

  app.get("/db-check", async (_request, reply) => {
    const healthy = await checkDbHealth(deps.sql);
    if (!healthy) {
      return reply.code(503).send({ status: "error" });
    }
    return { status: "ok" };
  });

  // --- 1. Sócios ---
  app.post<{
    Body: { name: string; email: string; category: MemberCategory };
  }>(
    "/members",
    {
      schema: {
        body: {
          type: "object",
          required: ["name", "email", "category"],
          additionalProperties: false,
          properties: {
            name: { type: "string", minLength: 1, maxLength: 120 },
            email: { type: "string", minLength: 3, maxLength: 160 },
            category: {
              type: "string",
              enum: ["aluno", "professor", "externo"],
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { name, email, category } = request.body;
      const member = await deps.repository.createMember(name, email, category);
      return reply.code(201).send(member);
    },
  );

  // --- 2. Emissão de Carteirinha (Idempotente) ---
  app.post<{
    Params: { id: string };
    Headers: { "idempotency-key"?: string };
  }>(
    "/members/:id/credential",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", format: "uuid" } },
        },
      },
    },
    async (request, reply) => {
      const memberId = request.params.id;
      const idempotencyKey = request.headers["idempotency-key"];

      if (idempotencyKey) {
        const existing = await deps.repository.findCredentialByIdempotencyKey(
          idempotencyKey,
        );
        if (existing) {
          return reply.code(200).send({
            jti: existing.jti,
            member_id: existing.member_id,
            token: existing.token,
            issued_at: existing.issued_at,
            expires_at: existing.expires_at,
          });
        }
      }

      const member = await deps.repository.findMemberById(memberId);
      if (!member) {
        throw new NotFoundError("Sócio não encontrado");
      }

      const jti = crypto.randomUUID();
      const nowSec = Math.floor(Date.now() / 1000);
      const expSec = calculateExpiration(nowSec, 30);

      const token = await issueCredential(
        deps.signingKey.privateKey,
        deps.signingKey.kid,
        {
          jti,
          sub: member.id,
          category: member.category as MemberCategory,
          iat: nowSec,
          exp: expSec,
        },
      );

      const saved = await deps.repository.saveCredential({
        jti,
        memberId: member.id,
        idempotencyKey,
        token,
        issuedAt: new Date(nowSec * 1000),
        expiresAt: new Date(expSec * 1000),
      });

      return reply.code(201).send({
        jti: saved.jti,
        member_id: saved.member_id,
        token: saved.token,
        issued_at: saved.issued_at,
        expires_at: saved.expires_at,
      });
    },
  );

  // --- 3. Revogação de Carteirinha ---
  app.post<{ Params: { id: string } }>(
    "/credentials/:id/revoke",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", format: "uuid" } },
        },
      },
    },
    async (request, reply) => {
      const revoked = await deps.repository.revokeCredential(request.params.id);
      if (!revoked) {
        throw new NotFoundError("Credencial não encontrada");
      }
      return reply.code(200).send({
        jti: request.params.id,
        status: "revoked",
      });
    },
  );

  // --- 4. Catálogo de Livros e Exemplares ---
  app.post<{
    Body: { title: string; author: string; isbn: string; copyCodes: string[] };
  }>(
    "/books",
    {
      schema: {
        body: {
          type: "object",
          required: ["title", "author", "isbn", "copyCodes"],
          additionalProperties: false,
          properties: {
            title: { type: "string", minLength: 1 },
            author: { type: "string", minLength: 1 },
            isbn: { type: "string", minLength: 5 },
            copyCodes: {
              type: "array",
              minItems: 1,
              items: { type: "string", minLength: 1 },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { title, author, isbn, copyCodes } = request.body;
      const book = await deps.repository.createBookWithCopies(
        title,
        author,
        isbn,
        copyCodes,
      );
      return reply.code(201).send(book);
    },
  );

  app.get("/books", async () => {
    return await deps.repository.listBooksWithAvailability();
  });

  // --- 5. Empréstimo com Verificação da Carteirinha ---
  app.post<{
    Body: { credentialToken: string; copyId: string };
  }>(
    "/loans",
    {
      schema: {
        body: {
          type: "object",
          required: ["credentialToken", "copyId"],
          additionalProperties: false,
          properties: {
            credentialToken: { type: "string", minLength: 10 },
            copyId: { type: "string", format: "uuid" },
          },
        },
      },
    },
    async (request, reply) => {
      const { credentialToken, copyId } = request.body;

      // 1. Verificação criptográfica e temporal -> 401
      const verification = await verifyCredential(
        credentialToken,
        deps.signingKey.publicKeysByKid,
      );
      if (!verification.valid) {
        metrics.loansDeniedTotal.inc({ reason: verification.reason });
        return reply.code(401).send({
          error: "invalid_credential",
          reason: verification.reason,
        });
      }

      const { claims } = verification;

      // 2. Verificação de revogação no banco -> 403
      const credRecord = await deps.repository.findCredentialByJti(claims.jti);
      if (!credRecord) {
        metrics.loansDeniedTotal.inc({ reason: "UNKNOWN_CREDENTIAL" });
        return reply.code(401).send({ error: "invalid_credential" });
      }
      if (credRecord.revoked_at !== null) {
        metrics.loansDeniedTotal.inc({ reason: "REVOKED_CREDENTIAL" });
        return reply.code(403).send({ error: "credential_revoked" });
      }

      // 3. Existência do exemplar -> 404
      const exists = await deps.repository.copyExists(copyId);
      if (!exists) {
        throw new NotFoundError("Exemplar não encontrado");
      }

      // 4. Regra de limite por categoria -> 422
      const activeCount = await deps.repository.countActiveLoansByMember(
        claims.sub,
      );
      if (!canMemberBorrow(claims.category, activeCount)) {
        metrics.loansDeniedTotal.inc({ reason: "LOAN_LIMIT_EXCEEDED" });
        return reply.code(422).send({
          error: "loan_limit_exceeded",
          message:
            `Limite de empréstimos simultâneos atingido para categoria ${claims.category}`,
        });
      }

      // 5. Persistência (índice único parcial protege contra concorrência -> 409)
      const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const loan = await deps.repository.createLoan(
        copyId,
        claims.sub,
        dueDate,
      );

      return reply.code(201).send(loan);
    },
  );

  // --- 6. Devolução de Exemplar ---
  app.post<{ Params: { id: string } }>(
    "/loans/:id/return",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", format: "uuid" } },
        },
      },
    },
    async (request, reply) => {
      const loan = await deps.repository.returnLoan(request.params.id);
      return reply.code(200).send(loan);
    },
  );

  return app;
}
