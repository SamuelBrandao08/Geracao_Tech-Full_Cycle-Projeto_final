import {
  assert,
  assertEquals,
  assertFalse,
  assertRejects,
} from "jsr:@std/assert@1";
import {
  exportPublicKey,
  generateKeyPair,
  signPayload,
  verifyPayload,
} from "./ed25519.ts";

const PAYLOAD = JSON.stringify({
  memberId: "m-1",
  category: "aluno",
  limit: 3,
});

Deno.test("1. gera um par de chaves Ed25519", async () => {
  const { publicKey, privateKey } = await generateKeyPair();
  assertEquals(publicKey.algorithm.name, "Ed25519");
  assertEquals(privateKey.type, "private");
  assertEquals(publicKey.type, "public");
});

Deno.test("2. assina e verifica como válido", async () => {
  const { publicKey, privateKey } = await generateKeyPair();
  const jwk = await exportPublicKey(publicKey);
  const signature = await signPayload(privateKey, PAYLOAD);
  assert(await verifyPayload(jwk, PAYLOAD, signature));
});

Deno.test("3. payload alterado em UM caractere falha", async () => {
  const { publicKey, privateKey } = await generateKeyPair();
  const jwk = await exportPublicKey(publicKey);
  const signature = await signPayload(privateKey, PAYLOAD);
  const tampered = PAYLOAD.replace("m-1", "m-2");
  assertFalse(await verifyPayload(jwk, tampered, signature));
});

Deno.test("4. verifica só com a chave pública exportada/reimportada (JWK via JSON)", async () => {
  const { publicKey, privateKey } = await generateKeyPair();
  const jwk = JSON.parse(JSON.stringify(await exportPublicKey(publicKey)));
  assertEquals(jwk.kty, "OKP");
  assertEquals(jwk.crv, "Ed25519");
  assertFalse("d" in jwk); // a chave privada NÃO pode vazar no JWK público
  const signature = await signPayload(privateKey, PAYLOAD);
  assert(await verifyPayload(jwk, PAYLOAD, signature));
});

Deno.test("negativo: assinatura de outra chave é rejeitada", async () => {
  const a = await generateKeyPair();
  const b = await generateKeyPair();
  const signatureB = await signPayload(b.privateKey, PAYLOAD);
  assertFalse(
    await verifyPayload(
      await exportPublicKey(a.publicKey),
      PAYLOAD,
      signatureB,
    ),
  );
});

Deno.test("negativo: assinatura malformada retorna false e JWK inválido lança", async () => {
  const { publicKey } = await generateKeyPair();
  const jwk = await exportPublicKey(publicKey);
  assertFalse(await verifyPayload(jwk, PAYLOAD, "!!!não-é-base64!!!"));
  assertFalse(await verifyPayload(jwk, PAYLOAD, "AAAA"));
  await assertRejects(() => verifyPayload({ kty: "OKP" }, PAYLOAD, "AAAA"));
});
