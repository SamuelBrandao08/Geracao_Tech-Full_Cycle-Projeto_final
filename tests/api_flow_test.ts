import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { buildApp } from "../src/app.ts";
import {
  exportPublicKey,
  generateKeyPair,
} from "../src/domain/crypto/ed25519.ts";
import { createDbConnection } from "../src/infra/db/connection.ts";
import { PostgresLibraryRepository } from "../src/infra/db/repositories.ts";
import { runMigrations } from "../src/infra/db/schema.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL");

Deno.test({
  name:
    "API E2E: fluxo completo de sócio, carteirinha, empréstimo, erros e métricas",
  ignore: !DATABASE_URL,
  async fn() {
    const sql = createDbConnection(DATABASE_URL, 2);
    await runMigrations(sql);
    await sql`TRUNCATE TABLE loans, credentials, copies, books, members RESTART IDENTITY CASCADE`;

    const { publicKey, privateKey } = await generateKeyPair();
    const publicJwk = await exportPublicKey(publicKey);

    const app = buildApp({
      sql,
      repository: new PostgresLibraryRepository(sql),
      signingKey: {
        kid: "key-2026-test",
        privateKey,
        publicKeysByKid: { "key-2026-test": publicJwk },
      },
      enableLogger: false,
    });

    await app.ready();

    try {
      // 1. Health & DB Check
      const healthRes = await app.inject({ method: "GET", url: "/health" });
      assertEquals(healthRes.statusCode, 200);

      const dbRes = await app.inject({ method: "GET", url: "/db-check" });
      assertEquals(dbRes.statusCode, 200);

      // 2. Validação estrita Ajv (400 Bad Request para campo extra)
      const badMember = await app.inject({
        method: "POST",
        url: "/members",
        payload: {
          name: "Intruso",
          email: "intruso@uni.edu",
          category: "aluno",
          campoExtra: true,
        },
      });
      assertEquals(badMember.statusCode, 400);

      // 3. Cadastro de Sócios (externo: limite 1 | aluno: limite 2)
      const extRes = await app.inject({
        method: "POST",
        url: "/members",
        payload: {
          name: "João Externo",
          email: "joao@externo.com",
          category: "externo",
        },
      });
      assertEquals(extRes.statusCode, 201);
      const externo = extRes.json();

      const alunoRes = await app.inject({
        method: "POST",
        url: "/members",
        payload: {
          name: "Maria Aluna",
          email: "maria@uni.edu",
          category: "aluno",
        },
      });
      assertEquals(alunoRes.statusCode, 201);
      const aluno = alunoRes.json();

      // 4. Emissão Idempotente de Carteirinha
      const cred1Res = await app.inject({
        method: "POST",
        url: `/members/${externo.id}/credential`,
        headers: { "idempotency-key": "idem-key-001" },
      });
      assertEquals(cred1Res.statusCode, 201);
      const credExterno = cred1Res.json();

      const cred1Retry = await app.inject({
        method: "POST",
        url: `/members/${externo.id}/credential`,
        headers: { "idempotency-key": "idem-key-001" },
      });
      assertEquals(cred1Retry.statusCode, 200);
      assertEquals(cred1Retry.json().jti, credExterno.jti);

      const credAlunoRes = await app.inject({
        method: "POST",
        url: `/members/${aluno.id}/credential`,
      });
      assertEquals(credAlunoRes.statusCode, 201);
      const credAluno = credAlunoRes.json();

      // 5. Cadastro de Livro com 2 Exemplares e Consulta
      const bookRes = await app.inject({
        method: "POST",
        url: "/books",
        payload: {
          title: "Clean Architecture",
          author: "Robert C. Martin",
          isbn: "978-0134494166",
          copyCodes: ["CA-01", "CA-02"],
        },
      });
      assertEquals(bookRes.statusCode, 201);
      const book = bookRes.json();
      const [copy1, copy2] = book.copies;

      const listBooksRes = await app.inject({ method: "GET", url: "/books" });
      assertEquals(listBooksRes.statusCode, 200);
      assertEquals(listBooksRes.json()[0].available_copies, 2);

      // 6. Empréstimo com token forjado -> 401 Unauthorized
      const unauthLoan = await app.inject({
        method: "POST",
        url: "/loans",
        payload: {
          credentialToken: "eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMjMifQ.",
          copyId: copy1.id,
        },
      });
      assertEquals(unauthLoan.statusCode, 401);

      // 7. Empréstimo de exemplar inexistente -> 404 Not Found
      const notFoundLoan = await app.inject({
        method: "POST",
        url: "/loans",
        payload: {
          credentialToken: credExterno.token,
          copyId: crypto.randomUUID(),
        },
      });
      assertEquals(notFoundLoan.statusCode, 404);

      // 8. Empréstimo válido para Externo (1/1) -> 201 Created
      const loan1Res = await app.inject({
        method: "POST",
        url: "/loans",
        payload: {
          credentialToken: credExterno.token,
          copyId: copy1.id,
        },
      });
      assertEquals(loan1Res.statusCode, 201);
      const loan1 = loan1Res.json();

      // 9. Concorrência: Aluno tenta pegar o mesmo exemplar já emprestado -> 409 Conflict
      const conflictLoan = await app.inject({
        method: "POST",
        url: "/loans",
        payload: {
          credentialToken: credAluno.token,
          copyId: copy1.id,
        },
      });
      assertEquals(conflictLoan.statusCode, 409);

      // 10. Limite por categoria: Externo tenta pegar 2º livro -> 422 Unprocessable Entity
      const limitLoan = await app.inject({
        method: "POST",
        url: "/loans",
        payload: {
          credentialToken: credExterno.token,
          copyId: copy2.id,
        },
      });
      assertEquals(limitLoan.statusCode, 422);

      // 11. Devolução libera o exemplar -> 200 OK
      const returnRes = await app.inject({
        method: "POST",
        url: `/loans/${loan1.id}/return`,
      });
      assertEquals(returnRes.statusCode, 200);
      assert(returnRes.json().returned_at !== null);

      // 12. Revogação da carteirinha e bloqueio posterior -> 403 Forbidden
      const revokeRes = await app.inject({
        method: "POST",
        url: `/credentials/${credExterno.jti}/revoke`,
      });
      assertEquals(revokeRes.statusCode, 200);

      const revokedLoan = await app.inject({
        method: "POST",
        url: "/loans",
        payload: {
          credentialToken: credExterno.token,
          copyId: copy1.id,
        },
      });
      assertEquals(revokedLoan.statusCode, 403);

      // 13. Verificação das Métricas Prometheus (/metrics)
      const metricsRes = await app.inject({ method: "GET", url: "/metrics" });
      assertEquals(metricsRes.statusCode, 200);
      assertStringIncludes(metricsRes.body, "http_requests_total");
      assertStringIncludes(metricsRes.body, "library_loans_denied_total");
    } finally {
      await app.close();
      await sql.end();
    }
  },
});
