import postgres from "npm:postgres";

const sql = postgres(Deno.env.get("DATABASE_URL")!, { connect_timeout: 3 });
console.log("typeof sql:", typeof sql);

const [row] = await sql`select now() as now`;
console.log(row);

await sql.end();