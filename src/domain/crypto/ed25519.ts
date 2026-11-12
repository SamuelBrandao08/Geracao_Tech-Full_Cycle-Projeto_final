/**
 * Spike item 3 — Ed25519 com Web Crypto (crypto.subtle), sem dependências.
 *
 * Quatro funções, uma por critério de aceitação:
 *   1. generateKeyPair   -> gera o par de chaves
 *   2. exportPublicKey   -> exporta a chave pública (JWK), o que o verificador recebe
 *   3. signPayload       -> assina um texto e devolve a assinatura em base64url
 *   4. verifyPayload     -> verifica usando SOMENTE a chave pública exportada (JWK)
 */

const ALGORITHM = { name: "Ed25519" } as const;

/** Chave pública no formato JWK (RFC 8037: kty "OKP", crv "Ed25519"). */
export type PublicKeyJwk = JsonWebKey;

// --- helpers internos (não fazem parte das 4 funções) -----------------------

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(
    /=+$/,
    "",
  );
}

function fromBase64Url(text: string) {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(text.length / 4) * 4,
    "=",
  );
  const binary = atob(padded); // lança DOMException se o texto não for base64 válido
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Decodifica a assinatura; devolve null se o texto não for base64url válido. */
function decodeSignature(text: string) {
  try {
    return fromBase64Url(text);
  } catch {
    return null;
  }
}

// --- 1. gerar o par de chaves -----------------------------------------------

/**
 * Gera um par Ed25519. `extractable = true` é necessário para exportar a
 * chave pública; a chave privada continua dentro do objeto CryptoKey.
 */
export function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(ALGORITHM, true, [
    "sign",
    "verify",
  ]) as Promise<
    CryptoKeyPair
  >;
}

// --- 2. exportar a chave pública --------------------------------------------

/** Exporta a chave pública como JWK (o que seria publicado/entregue ao verificador). */
export function exportPublicKey(publicKey: CryptoKey): Promise<PublicKeyJwk> {
  return crypto.subtle.exportKey("jwk", publicKey);
}

// --- 3. assinar --------------------------------------------------------------

/** Assina o payload (texto UTF-8) e devolve a assinatura em base64url. */
export async function signPayload(
  privateKey: CryptoKey,
  payload: string,
): Promise<string> {
  const data = new TextEncoder().encode(payload);
  const signature = await crypto.subtle.sign(ALGORITHM, privateKey, data);
  return toBase64Url(new Uint8Array(signature));
}

// --- 4. verificar (só com a chave pública exportada) -------------------------

/**
 * Verifica a assinatura reimportando a chave pública a partir do JWK.
 * Retorna `false` para assinatura inválida, payload alterado ou assinatura
 * malformada (entrada do usuário). Um JWK inválido é erro de configuração e
 * propaga a exceção de propósito, para não mascarar bugs.
 */
export async function verifyPayload(
  publicKeyJwk: PublicKeyJwk,
  payload: string,
  signature: string,
): Promise<boolean> {
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    publicKeyJwk,
    ALGORITHM,
    true,
    ["verify"],
  );
  const signatureBytes = decodeSignature(signature);
  if (signatureBytes === null) return false;
  const data = new TextEncoder().encode(payload);
  return await crypto.subtle.verify(ALGORITHM, publicKey, signatureBytes, data);
}
