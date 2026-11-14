import { buildApp } from "./app.ts";
import { exportPublicKey, generateKeyPair } from "./domain/crypto/ed25519.ts";
import { createDbConnection } from "./infra/db/connection.ts";
import { PostgresLibraryRepository } from "./infra/db/repositories.ts";
import { runMigrations } from "./infra/db/schema.ts";

async function loadSigningKeys() {
  const kid = Deno.env.get("SIGNING_KEY_ID") ?? "key-2026-01";
  const privateJwkRaw = Deno.env.get("SIGNING_PRIVATE_KEY_JWK");

  if (privateJwkRaw) {
    const privateJwk = JSON.parse(privateJwkRaw) as JsonWebKey;
    const privateKey = await crypto.subtle.importKey(
      "jwk",
      privateJwk,
      { name: "Ed25519" },
      true,
      ["sign"],
    );
    const { d: _omitted, ...publicJwk } = privateJwk;
    return {
      kid,
      privateKey,
      publicKeysByKid: { [kid]: publicJwk },
    };
  }

  // Fallback seguro para ambiente local/dev sem chave fixa configurada
  const { publicKey, privateKey } = await generateKeyPair();
  const publicJwk = await exportPublicKey(publicKey);
  return {
    kid,
    privateKey,
    publicKeysByKid: { [kid]: publicJwk },
  };
}

if (import.meta.main) {
  const sql = createDbConnection();
  await runMigrations(sql);

  const repository = new PostgresLibraryRepository(sql);
  const signingKey = await loadSigningKeys();

  const app = buildApp({
    sql,
    repository,
    signingKey,
    enableLogger: true,
  });

  const port = Number(Deno.env.get("PORT") ?? 3000);
  await app.listen({ port, host: "0.0.0.0" });
}