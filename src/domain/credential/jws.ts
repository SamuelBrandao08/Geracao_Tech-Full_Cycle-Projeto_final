// src/domain/credential/jws.ts
import { signPayload, verifyPayload } from "../crypto/ed25519.ts";

export type MemberCategory = "aluno" | "professor" | "externo";

export interface CredentialHeader {
  alg: "EdDSA";
  typ: "JWT";
  kid: string;
}

export interface CredentialClaims {
  jti: string;
  sub: string; // memberId
  category: MemberCategory;
  iat: number;
  exp: number;
}

// Utilitários nativos para Base64URL (sem padding '=')
function encodeBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  const binString = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(binString)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decodeBase64Url(base64Url: string): string {
  let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  const binString = atob(base64);
  const bytes = Uint8Array.from(binString, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Emite uma carteirinha digital no formato JWS Compacto (header.payload.signature)
 */
export async function issueCredential(
  privateKey: CryptoKey,
  kid: string,
  claims: CredentialClaims,
): Promise<string> {
  const header: CredentialHeader = {
    alg: "EdDSA",
    typ: "JWT",
    kid,
  };

  const encodedHeader = encodeBase64Url(JSON.stringify(header));
  const encodedPayload = encodeBase64Url(JSON.stringify(claims));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = await signPayload(privateKey, signingInput);
  return `${signingInput}.${signature}`;
}

export type VerifyResult =
  | { valid: true; claims: CredentialClaims }
  | {
    valid: false;
    reason:
      | "MALFORMED_TOKEN"
      | "UNSUPPORTED_ALGORITHM"
      | "UNKNOWN_KID"
      | "INVALID_SIGNATURE"
      | "EXPIRED_TOKEN";
  };

/**
 * Verifica rigorosamente a estrutura, algoritmo, assinatura e expiração do JWS
 */
export async function verifyCredential(
  token: string,
  publicKeysByKid: Record<string, JsonWebKey>,
  nowInSeconds: number = Math.floor(Date.now() / 1000),
): Promise<VerifyResult> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { valid: false, reason: "MALFORMED_TOKEN" };
  }

  const [encodedHeader, encodedPayload, signature] = parts;

  let header: Partial<CredentialHeader>;
  let claims: CredentialClaims;

  try {
    header = JSON.parse(decodeBase64Url(encodedHeader));
    claims = JSON.parse(decodeBase64Url(encodedPayload));
  } catch {
    return { valid: false, reason: "MALFORMED_TOKEN" };
  }

  // 1. Defesa contra ataques de downgrade (ex: alg: "none" ou RS256)
  if (header.alg !== "EdDSA") {
    return { valid: false, reason: "UNSUPPORTED_ALGORITHM" };
  }

  // 2. Busca da chave pública pelo kid
  if (!header.kid || !publicKeysByKid[header.kid]) {
    return { valid: false, reason: "UNKNOWN_KID" };
  }

  const publicKeyJwk = publicKeysByKid[header.kid];
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  // 3. Verificação criptográfica da assinatura
  const isSignatureValid = await verifyPayload(
    publicKeyJwk,
    signingInput,
    signature,
  );
  if (!isSignatureValid) {
    return { valid: false, reason: "INVALID_SIGNATURE" };
  }

  // 4. Verificação temporal (exp)
  if (typeof claims.exp !== "number" || claims.exp <= nowInSeconds) {
    return { valid: false, reason: "EXPIRED_TOKEN" };
  }

  return { valid: true, claims };
}