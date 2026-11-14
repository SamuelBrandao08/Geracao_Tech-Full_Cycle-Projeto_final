import { assertFalse, assertThrows } from "@std/assert";
import { checkDbHealth, createDbConnection, Sql } from "./connection.ts";

Deno.test("connection: falha cedo se DATABASE_URL estiver ausente", () => {
  assertThrows(
    () => createDbConnection(""),
    Error,
    "DATABASE_URL não definida",
  );
});

Deno.test("connection: checkDbHealth retorna false quando o banco falha", async () => {
  const brokenSql = (() => {
    throw new Error("Connection refused");
  }) as unknown as Sql;

  const healthy = await checkDbHealth(brokenSql);
  assertFalse(healthy);
});
