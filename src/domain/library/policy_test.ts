import { assert, assertEquals, assertFalse } from "@std/assert";
import {
  calculateExpiration,
  canMemberBorrow,
  getLoanLimitForCategory,
} from "./policy.ts";

Deno.test("policy: retorna limites corretos por categoria", () => {
  assertEquals(getLoanLimitForCategory("aluno"), 2);
  assertEquals(getLoanLimitForCategory("professor"), 5);
  assertEquals(getLoanLimitForCategory("externo"), 1);
});

Deno.test("policy: permite empréstimo quando abaixo do limite", () => {
  assert(canMemberBorrow("externo", 0));
  assert(canMemberBorrow("aluno", 1));
  assert(canMemberBorrow("professor", 4));
});

Deno.test("policy: bloqueia empréstimo quando atinge ou excede o limite (caso de borda)", () => {
  assertFalse(canMemberBorrow("externo", 1));
  assertFalse(canMemberBorrow("aluno", 2));
  assertFalse(canMemberBorrow("aluno", 3));
  assertFalse(canMemberBorrow("professor", 5));
  assertFalse(canMemberBorrow("aluno", -1));
});

Deno.test("policy: calcula timestamp de expiração corretamente", () => {
  const issuedAt = 1_700_000_000;
  const expected = issuedAt + 30 * 86_400; // 30 dias em segundos
  assertEquals(calculateExpiration(issuedAt, 30), expected);
});
