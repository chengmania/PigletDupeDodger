import { BONUS_CATALOG, type BonusDef, entryClassLetter, isClassEligible } from './bonuses.ts';
import type { BonusClaim, ClubConfig, Mode, Operator, Qso } from './types.ts';

export interface ScoreBreakdown {
  qsoPoints: number;
  multiplier: 1 | 2 | 5;
  multipliedPoints: number;
  bonusPoints: number;
  gotaBonus: number;
  youthBonus: number;
  total: number;
  perBand: Record<string, { count: number; qsoPoints: number }>;
  perMode: Partial<Record<Mode, { count: number; qsoPoints: number }>>;
  perOperator: Record<string, { count: number; qsoPoints: number }>;
  ineligibleClaims: string[];
}

const MODE_POINTS: Record<Mode, number> = { PH: 1, CW: 2, DIG: 2 };

export function isInEventWindow(qso: Qso, config: Pick<ClubConfig, 'eventStartUtc' | 'eventEndUtc'>): boolean {
  const ts = new Date(qso.ts).getTime();
  const start = new Date(config.eventStartUtc).getTime();
  const end = new Date(config.eventEndUtc).getTime();
  return ts >= start && ts <= end;
}

function bump(record: Record<string, { count: number; qsoPoints: number }>, key: string, points: number): void {
  const existing = record[key] ?? { count: 0, qsoPoints: 0 };
  existing.count += 1;
  existing.qsoPoints += points;
  record[key] = existing;
}

interface ScoreLogOpts {
  includeOutOfWindow?: boolean;
}

export function scoreLog(
  qsos: readonly Qso[],
  config: ClubConfig,
  bonuses: ReadonlyMap<string, BonusClaim>,
  operators: readonly Operator[],
  opts: ScoreLogOpts = {},
): ScoreBreakdown {
  const eligible = qsos.filter((q) => !q.deleted && (opts.includeOutOfWindow || isInEventWindow(q, config)));

  const perBand: Record<string, { count: number; qsoPoints: number }> = {};
  const perMode: Partial<Record<Mode, { count: number; qsoPoints: number }>> = {};
  const perOperator: Record<string, { count: number; qsoPoints: number }> = {};

  let qsoPoints = 0;
  let gotaBonus = 0;

  for (const q of eligible) {
    const points = MODE_POINTS[q.mode];
    qsoPoints += points;
    bump(perBand, q.band, points);
    bump(perOperator, q.operatorCall, points);
    perMode[q.mode] = perMode[q.mode] ?? { count: 0, qsoPoints: 0 };
    perMode[q.mode]!.count += 1;
    perMode[q.mode]!.qsoPoints += points;

    if (q.station === 'GOTA') {
      // Rule 7.3.13.1: 5 bonus points per completed GOTA contact, unmultiplied,
      // no limit on the number of contacts.
      gotaBonus += 5;
    }
  }

  const multiplier = config.powerMult;
  const multipliedPoints = qsoPoints * multiplier;

  const ineligibleClaims: string[] = [];
  let bonusPoints = 0;

  for (const def of BONUS_CATALOG) {
    const claim = bonuses.get(def.id);
    if (!claim?.claimed) continue;

    if (!isClassEligible(def, config.entryClass)) {
      ineligibleClaims.push(def.id);
      continue;
    }

    if (def.requiresGotaCoachCount !== undefined) {
      const coachedCount = eligible.filter((q) => q.station === 'GOTA' && q.gotaCoached).length;
      if (coachedCount < def.requiresGotaCoachCount) {
        ineligibleClaims.push(def.id);
        continue;
      }
      bonusPoints += def.points;
      continue;
    }

    bonusPoints += computeBonusPoints(def, claim);
  }

  const youthBonus = computeYouthBonus(config.entryClass, eligible, operators);
  bonusPoints += youthBonus;

  const total = multipliedPoints + bonusPoints + gotaBonus;

  return {
    qsoPoints,
    multiplier,
    multipliedPoints,
    bonusPoints,
    gotaBonus,
    youthBonus,
    total,
    perBand,
    perMode,
    perOperator,
    ineligibleClaims,
  };
}

function computeBonusPoints(def: BonusDef, claim: BonusClaim): number {
  switch (def.scaling) {
    case 'flat':
      return def.points;
    case 'per-transmitter':
      return Math.min(claim.transmitterCount ?? 0, def.maxUnits ?? Infinity) * def.points;
    case 'per-message':
      return Math.min(claim.messageCount ?? 0, def.maxUnits ?? Infinity) * def.points;
  }
}

function computeYouthBonus(entryClass: string, eligible: readonly Qso[], operators: readonly Operator[]): number {
  const letter = entryClassLetter(entryClass);
  const operatorsWithQsos = new Set(eligible.map((q) => q.operatorCall));
  const qualifyingYouth = operators.filter((op) => op.age18OrUnder && operatorsWithQsos.has(op.call));

  if (letter === 'B') {
    // 1- or 2-person Class B: 20 points per qualifying youth operator, no
    // separate cap beyond the class's inherent 1-2 person limit.
    return 20 * qualifyingYouth.length;
  }

  // General classes (A, C, D, E, F): 20/participant, capped at 100 (5 youths).
  return 20 * Math.min(5, qualifyingYouth.length);
}
