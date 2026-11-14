import {
  assert,
  assertEquals,
  assertFalse,
  assertRejects,
} from "@std/assert";
import { checkDbHealth, createDbConnection } from "../src/infra/db/connection.ts";
import {
  ConflictError,
  NotFoundError,
  PostgresLibraryRepository,
} from "../src/infra/db/repositories.ts";
import { runMigrations } from "../src/infra/db/schema.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL");

Deno.test({
  name: "db integration: fluxo completo de persistência, concorrência e revogação",
  ignore: !DATABASE_URL, // Ignora automaticamente se rodar apenas unitários sem banco
  async fn() {
    const sql = createDbConnection(DATABASE_URL, 2);

    try {
      // 1. Saúde e Migrations
      assert(await checkDbHealth(sql));
      await runMigrations(sql);

      // Limpa dados anteriores para garantir reprodutibilidade
      await sql`TRUNCATE TABLE loans, credentials, copies, books, members RESTART IDENTITY CASCADE`;

      const repo = new PostgresLibraryRepository(sql);

      // 2. Cadastro de sócio e unicidade de e-mail
      const member1 = await repo.createMember("Ana Silva", "ana@uni.edu", "aluno");
      const member2 = await repo.createMember("Carlos Souza", "carlos@uni.edu", "professor");
      assertEquals(member1.category, "aluno");

      await assertRejects(
        () => repo.createMember("Ana Clone", "ana@uni.edu", "externo"),
        ConflictError,
      );

      // 3. Cadastro de livro e exemplares
      const book = await repo.createBookWithCopies(
        "Engenharia de Software Moderna",
        "Marco Tulio Valente",
        "978-65-00-00001-0",
        ["EX-01", "EX-02"],
      );
      assertEquals(book.copies.length, 2);

      const catalogBefore = await repo.listBooksWithAvailability();
      assertEquals(catalogBefore[0].total_copies, 2);
      assertEquals(catalogBefore[0].available_copies, 2);

      // 4. Emissão idempotente e revogação de credencial
      const jti = crypto.randomUUID();
      const now = new Date();
      const exp = new Date(now.getTime() + 86_400_000);

      await repo.saveCredential({
        jti,
        memberId: member1.id,
        idempotencyKey: "req-abc-123",
        token: "header.payload.sig",
        issuedAt: now,
        expiresAt: exp,
      });

      const foundByIdem = await repo.findCredentialByIdempotencyKey("req-abc-123");
      assertEquals(foundByIdem?.jti, jti);

      const foundBeforeRevoke = await repo.findCredentialByJti(jti);
      assertEquals(foundBeforeRevoke?.revoked_at, null);

      assert(await repo.revokeCredential(jti));
      const foundAfterRevoke = await repo.findCredentialByJti(jti);
      assert(foundAfterRevoke?.revoked_at !== null);

      // 5. ADR-0001: Empréstimo, bloqueio de concorrência (409) e devolução
      const copy1 = book.copies[0];
      const dueDate = new Date(now.getTime() + 7 * 86_400_000);

      const loan1 = await repo.createLoan(copy1.id, member1.id, dueDate);
      assertEquals(await repo.countActiveLoansByMember(member1.id), 1);

      // Tentativa simultânea de emprestar o mesmo exemplar deve lançar ConflictError
      await assertRejects(
        () => repo.createLoan(copy1.id, member2.id, dueDate),
        ConflictError,
      );

      // Disponibilidade deve cair para 1
      const catalogDuringLoan = await repo.listBooksWithAvailability();
      assertEquals(catalogDuringLoan[0].available_copies, 1);

      // Devolução libera o exemplar
      const returned = await repo.returnLoan(loan1.id);
      assert(returned.returned_at !== null);
      assertEquals(await repo.countActiveLoansByMember(member1.id), 0);

      // Devolver novamente deve falhar com NotFoundError
      await assertRejects(
        () => repo.returnLoan(loan1.id),
        NotFoundError,
      );

      // Novo empréstimo do mesmo exemplar agora é aceito
      const loan2 = await repo.createLoan(copy1.id, member2.id, dueDate);
      assertEquals(loan2.member_id, member2.id);
      assertFalse(loan2.id === loan1.id);
    } finally {
      await sql.end();
    }
  },
});