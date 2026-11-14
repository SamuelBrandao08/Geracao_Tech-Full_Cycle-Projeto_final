// src/domain/credential/jws_test.ts
import { assert, assertEquals, assertFalse } from "@std/assert";
import { exportPublicKey, generateKeyPair } from "../crypto/ed25519.ts";
import { CredentialClaims, issueCredential, verifyCredential } from "./jws.ts";

Deno.test("JWS: emite e verifica credencial válida", async () => {
  const { publicKey, privateKey } = await generateKeyPair();
  const jwk = await exportPublicKey(publicKey);
  const now = 1_700_000_000;

  const claims: CredentialClaims = {
    jti: "cred-123",
    sub: "member-1",
    category: "aluno",
    iat: now,
    exp: now + 3600,
  };

  const token = await issueCredential(privateKey, "key-2026", claims);
  const result = await verifyCredential(token, { "key-2026": jwk }, now + 10);

  assert(result.valid);
  assertEquals(result.claims, claims);
});

Deno.test("JWS negativo: rejeita token expirado", async () => {
  const { publicKey, privateKey } = await generateKeyPair();
  const jwk = await exportPublicKey(publicKey);
  const now = 1_700_000_000;

  const claims: CredentialClaims = {
    jti: "cred-exp",
    sub: "member-1",
    category: "professor",
    iat: now - 7200,
    exp: now - 10, // Expirou há 10 segundos
  };

  const token = await issueCredential(privateKey, "key-2026", claims);
  const result = await verifyCredential(token, { "key-2026": jwk }, now);

  assertFalse(result.valid);
  assertEquals(result.reason, "EXPIRED_TOKEN");
});

Deno.test("JWS negativo: rejeita ataque alg: none", async () => {
  const { publicKey } = await generateKeyPair();
  const jwk = await exportPublicKey(publicKey);

  // Forjando um header com alg: "none"
  const fakeHeader = btoa(
    JSON.stringify({ alg: "none", typ: "JWT", kid: "key-2026" }),
  )
    .replace(/=+$/, "");
  const fakePayload = btoa(
    JSON.stringify({ sub: "attacker", exp: 9_999_999_999 }),
  )
    .replace(/=+$/, "");
  const forgedToken = `${fakeHeader}.${fakePayload}.`;

  const result = await verifyCredential(forgedToken, { "key-2026": jwk });

  assertFalse(result.valid);
  assertEquals(result.reason, "UNSUPPORTED_ALGORITHM");
});

Deno.test("JWS negativo: rejeita kid desconhecido", async () => {
  const { publicKey, privateKey } = await generateKeyPair();
  const jwk = await exportPublicKey(publicKey);
  const now = 1_700_000_000;

  const token = await issueCredential(privateKey, "kid-antigo", {
    jti: "cred-1",
    sub: "member-1",
    category: "externo",
    iat: now,
    exp: now + 3600,
  });

  const result = await verifyCredential(token, { "key-2026": jwk }, now);

  assertFalse(result.valid);
  assertEquals(result.reason, "UNKNOWN_KID");
});
