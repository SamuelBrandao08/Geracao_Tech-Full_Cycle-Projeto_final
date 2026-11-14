import { Sql } from "./connection.ts";

export async function runMigrations(sql: Sql): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS members (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL CHECK (category IN ('aluno', 'professor', 'externo')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS credentials (
      jti UUID PRIMARY KEY,
      member_id UUID NOT NULL REFERENCES members(id),
      idempotency_key TEXT UNIQUE,
      token TEXT NOT NULL,
      issued_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS books (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      isbn TEXT NOT NULL UNIQUE
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS copies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      book_id UUID NOT NULL REFERENCES books(id),
      code TEXT NOT NULL UNIQUE
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS loans (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      copy_id UUID NOT NULL REFERENCES copies(id),
      member_id UUID NOT NULL REFERENCES members(id),
      borrowed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      due_date TIMESTAMPTZ NOT NULL,
      returned_at TIMESTAMPTZ
    )
  `;

  // ADR-0001: Impede dois empréstimos ativos simultâneos para o mesmo exemplar
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_active_loan_per_copy
    ON loans (copy_id)
    WHERE returned_at IS NULL
  `;
}
