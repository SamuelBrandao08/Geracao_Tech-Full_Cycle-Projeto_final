// spike/db.ts — Item 2 da spike: conexão com PostgreSQL e consulta.
// Código descartável: serve para validar a stack Deno + PostgreSQL.
//
// Executar (com o banco no ar e DATABASE_URL definida):
//   cd spike && deno task db
//
// Exemplo de DATABASE_URL (use o valor do seu .env, nunca versionado):
//   postgres://usuario:senha@localhost:5432/banco

import postgres from "postgres";

export type Sql = ReturnType<typeof postgres>;

/** 1) Cria o cliente a partir de DATABASE_URL. Falha cedo se a variável faltar. */
export function criarConexao(): Sql {
  const url = Deno.env.get("DATABASE_URL");
  if (!url) {
    throw new Error("DATABASE_URL não definida (veja o seu .env)");
  }
  // max: 1 basta para a spike; onnotice silencia avisos de "IF EXISTS".
  return postgres(url, { max: 1, onnotice: () => {} });
}

/** 2) Prova que a aplicação conversa com o banco: SELECT simples. */
export async function verificarConexao(
  sql: Sql,
): Promise<{ ok: number; agora: Date }> {
  const [linha] = await sql<{ ok: number; agora: Date }[]>`
    SELECT 1 AS ok, now() AS agora
  `;
  return linha;
}

/**
 * 3) Cria a tabela de teste com ÍNDICE ÚNICO PARCIAL:
 * um exemplar só pode ter UM empréstimo ativo (devolvido_em IS NULL).
 * Recria a tabela a cada execução para o teste ser repetível.
 */
export async function prepararSchema(sql: Sql): Promise<void> {
  await sql`DROP TABLE IF EXISTS spike_emprestimo`;
  await sql`
    CREATE TABLE spike_emprestimo (
      id          SERIAL PRIMARY KEY,
      exemplar_id INTEGER NOT NULL,
      socio_id    INTEGER NOT NULL,
      devolvido_em TIMESTAMPTZ
    )
  `;
  await sql`
    CREATE UNIQUE INDEX spike_emprestimo_ativo_uq
    ON spike_emprestimo (exemplar_id)
    WHERE devolvido_em IS NULL
  `;
}

/**
 * 4) Valida a regra de negócio direto no banco:
 *    a) 1º empréstimo ativo do exemplar é aceito;
 *    b) 2º empréstimo ativo do MESMO exemplar é rejeitado (SQLSTATE 23505);
 *    c) depois de devolver o 1º, um novo empréstimo é aceito.
 * Lança Error se qualquer expectativa falhar.
 */
export async function provarIndiceUnicoParcial(
  sql: Sql,
): Promise<
  { primeiro: boolean; segundoRejeitado: boolean; aposDevolucao: boolean }
> {
  const EXEMPLAR = 1;

  // a) primeiro empréstimo
  const [primeiro] = await sql<{ id: number }[]>`
    INSERT INTO spike_emprestimo (exemplar_id, socio_id)
    VALUES (${EXEMPLAR}, 10) RETURNING id
  `;

  // b) segundo empréstimo ativo do mesmo exemplar deve violar o índice
  let segundoRejeitado = false;
  try {
    await sql`
      INSERT INTO spike_emprestimo (exemplar_id, socio_id)
      VALUES (${EXEMPLAR}, 20)
    `;
  } catch (erro) {
    const codigo = (erro as { code?: string }).code;
    if (codigo !== "23505") throw erro; // outro erro: não mascarar
    segundoRejeitado = true;
  }
  if (!segundoRejeitado) {
    throw new Error(
      "O índice único parcial NÃO rejeitou o 2º empréstimo ativo",
    );
  }

  // c) devolve o primeiro e tenta de novo
  await sql`
    UPDATE spike_emprestimo SET devolvido_em = now() WHERE id = ${primeiro.id}
  `;
  const [terceiro] = await sql<{ id: number }[]>`
    INSERT INTO spike_emprestimo (exemplar_id, socio_id)
    VALUES (${EXEMPLAR}, 20) RETURNING id
  `;

  return {
    primeiro: primeiro.id > 0,
    segundoRejeitado,
    aposDevolucao: terceiro.id > 0,
  };
}

// Execução direta: roda as 4 etapas em sequência e imprime o resultado.
if (import.meta.main) {
  const sql = criarConexao();
  try {
    console.log("conexão:", await verificarConexao(sql));
    await prepararSchema(sql);
    console.log("índice único parcial:", await provarIndiceUnicoParcial(sql));
  } finally {
    await sql.end(); // fecha o pool; sem isso o processo pode ficar pendurado
  }
}
