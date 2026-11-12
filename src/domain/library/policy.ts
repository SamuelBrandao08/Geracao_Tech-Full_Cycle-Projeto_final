import { MemberCategory } from "../credencial/jws.ts";

const LOAN_LIMITS: Record<MemberCategory, number> = {
  aluno: 2,
  professor: 5,
  externo: 1,
};

export function getLoanLimitForCategory(category: MemberCategory): number {
  return LOAN_LIMITS[category];
}

export function canMemberBorrow(
  category: MemberCategory,
  activeLoansCount: number,
): boolean {
  if (activeLoansCount < 0) return false;
  return activeLoansCount < getLoanLimitForCategory(category);
}

export function calculateExpiration(
  issuedAtSeconds: number,
  ttlDays = 30,
): number {
  return issuedAtSeconds + ttlDays * 24 * 60 * 60;
}