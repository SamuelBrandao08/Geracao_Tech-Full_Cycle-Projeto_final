import { MemberCategory } from "../../domain/credential/jws.ts";
import { Sql } from "./connection.ts";

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class PostgresLibraryRepository {
  constructor(private readonly sql: Sql) {}

  // --- MEMBERS ---
  async createMember(name: string, email: string, category: MemberCategory) {
    try {
      const [member] = await this.sql`
        INSERT INTO members (name, email, category)
        VALUES (${name}, ${email}, ${category})
        RETURNING id, name, email, category, created_at
      `;
      return member;
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        throw new ConflictError("E-mail já cadastrado para outro sócio");
      }
      throw err;
    }
  }

  async findMemberById(id: string) {
    const [member] = await this.sql`
      SELECT id, name, email, category, created_at
      FROM members WHERE id = ${id}
    `;
    return member ?? null;
  }

  // --- CREDENTIALS ---
  async findCredentialByIdempotencyKey(key: string) {
    const [cred] = await this.sql`
      SELECT jti, member_id, token, issued_at, expires_at, revoked_at
      FROM credentials WHERE idempotency_key = ${key}
    `;
    return cred ?? null;
  }

  async saveCredential(data: {
    jti: string;
    memberId: string;
    idempotencyKey?: string;
    token: string;
    issuedAt: Date;
    expiresAt: Date;
  }) {
    const [cred] = await this.sql`
      INSERT INTO credentials (jti, member_id, idempotency_key, token, issued_at, expires_at)
      VALUES (${data.jti}, ${data.memberId}, ${
      data.idempotencyKey ?? null
    }, ${data.token}, ${data.issuedAt}, ${data.expiresAt})
      RETURNING jti, member_id, token, issued_at, expires_at, revoked_at
    `;
    return cred;
  }

  async findCredentialByJti(jti: string) {
    const [cred] = await this.sql`
      SELECT jti, member_id, issued_at, expires_at, revoked_at
      FROM credentials WHERE jti = ${jti}
    `;
    return cred ?? null;
  }

  async revokeCredential(jti: string): Promise<boolean> {
    const result = await this.sql`
      UPDATE credentials
      SET revoked_at = COALESCE(revoked_at, now())
      WHERE jti = ${jti}
      RETURNING jti
    `;
    return result.length > 0;
  }

  // --- BOOKS & COPIES ---
  async createBookWithCopies(
    title: string,
    author: string,
    isbn: string,
    copyCodes: string[],
  ) {
    return await this.sql.begin(async (tx) => {
      const [book] = await tx`
        INSERT INTO books (title, author, isbn)
        VALUES (${title}, ${author}, ${isbn})
        RETURNING id, title, author, isbn
      `;

      const copies = [];
      for (const code of copyCodes) {
        const [copy] = await tx`
          INSERT INTO copies (book_id, code)
          VALUES (${book.id}, ${code})
          RETURNING id, book_id, code
        `;
        copies.push(copy);
      }

      return { ...book, copies };
    });
  }

  async listBooksWithAvailability() {
    return await this.sql`
      SELECT
        b.id,
        b.title,
        b.author,
        b.isbn,
        COUNT(c.id)::int AS total_copies,
        COUNT(c.id) FILTER (WHERE l.id IS NULL)::int AS available_copies
      FROM books b
      LEFT JOIN copies c ON c.book_id = b.id
      LEFT JOIN loans l ON l.copy_id = c.id AND l.returned_at IS NULL
      GROUP BY b.id
      ORDER BY b.title ASC
    `;
  }

  async copyExists(copyId: string): Promise<boolean> {
    const [copy] = await this.sql`SELECT id FROM copies WHERE id = ${copyId}`;
    return Boolean(copy);
  }

  // --- LOANS ---
  async countActiveLoansByMember(memberId: string): Promise<number> {
    const [row] = await this.sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM loans
      WHERE member_id = ${memberId} AND returned_at IS NULL
    `;
    return row?.count ?? 0;
  }

  async createLoan(copyId: string, memberId: string, dueDate: Date) {
    try {
      const [loan] = await this.sql`
        INSERT INTO loans (copy_id, member_id, due_date)
        VALUES (${copyId}, ${memberId}, ${dueDate})
        RETURNING id, copy_id, member_id, borrowed_at, due_date, returned_at
      `;
      return loan;
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        throw new ConflictError("Exemplar já possui um empréstimo ativo");
      }
      throw err;
    }
  }

  async returnLoan(loanId: string) {
    const [loan] = await this.sql`
      UPDATE loans
      SET returned_at = now()
      WHERE id = ${loanId} AND returned_at IS NULL
      RETURNING id, copy_id, member_id, borrowed_at, due_date, returned_at
    `;
    if (!loan) {
      throw new NotFoundError("Empréstimo não encontrado ou já devolvido");
    }
    return loan;
  }
}
