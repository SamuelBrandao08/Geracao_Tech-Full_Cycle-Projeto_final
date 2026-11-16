import { type MemberCategory } from "../credential/jws.ts";

export const DEFAULT_LOAN_LIMITS: Record<MemberCategory, number> = {
  aluno: 2,
  professor: 5,
  externo: 1,
};

export function getLoanLimitForCategory(category: MemberCategory): number {
  return DEFAULT_LOAN_LIMITS[category];
}

export function canMemberBorrow(
  category: MemberCategory,
  activeLoansCount: number,
  maxLoansOverride?: number,
): boolean {
  if (activeLoansCount < 0) {
    return false;
  }
  const limit = maxLoansOverride ?? DEFAULT_LOAN_LIMITS[category];
  return activeLoansCount < limit;
}

export function calculateExpiration(
  issuedAtSec: number,
  validityDays = 30,
): number {
  return issuedAtSec + validityDays * 24 * 60 * 60;
}
