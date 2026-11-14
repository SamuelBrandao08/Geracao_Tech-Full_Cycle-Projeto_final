import postgres from "postgres";

export type Sql = ReturnType<typeof postgres>;

export function createDbConnection(
  databaseUrl = Deno.env.get("DATABASE_URL"),
  maxConnections = 10,
): Sql {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL não definida nas variáveis de ambiente");
  }
  return postgres(databaseUrl, {
    max: maxConnections,
    onnotice: () => {},
  });
}

export async function checkDbHealth(sql: Sql): Promise<boolean> {
  try {
    const [row] = await sql<{ ok: number }[]>`SELECT 1 AS ok`;
    return row?.ok === 1;
  } catch {
    return false;
  }
}
