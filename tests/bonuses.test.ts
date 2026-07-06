import { describe, expect, test } from 'bun:test';
import { bonusChecklistRows, entryClassLetter, isClassEligible } from '../src/shared/bonuses.ts';
import type { BonusClaim, Qso } from '../src/shared/types.ts';

function makeQso(overrides: Partial<Qso> = {}): Qso {
  return {
    id: 'q1',
    ts: '2026-06-27T18:00:00Z',
    station: 'MAIN',
    band: '20m',
    mode: 'PH',
    call: 'W1AW',
    exchClass: '3A',
    exchSection: 'EPA',
    operatorCall: 'K1ABC',
    ...overrides,
  };
}

describe('entryClassLetter / isClassEligible', () => {
  test('extracts trailing letter(s) from an entry class', () => {
    expect(entryClassLetter('3A')).toBe('A');
    expect(entryClassLetter('1AB')).toBe('AB');
  });

  test('isClassEligible matches on the extracted letter', () => {
    expect(isClassEligible({ classes: ['A', 'B'] }, '3A')).toBe(true);
    expect(isClassEligible({ classes: ['A', 'B'] }, '3D')).toBe(false);
  });
});

describe('bonusChecklistRows', () => {
  test('filters to only class-eligible bonuses', () => {
    const rows = bonusChecklistRows({ entryClass: '1D' }, new Map(), []);
    for (const row of rows) {
      expect(row.def.classes).toContain('D');
    }
    // safety-officer is class-A only, so a class-D entry shouldn't see it
    expect(rows.some((r) => r.def.id === 'safety-officer')).toBe(false);
    // message-to-sm is open to all classes including D
    expect(rows.some((r) => r.def.id === 'message-to-sm')).toBe(true);
  });

  test('attaches the existing claim for a bonus id when present', () => {
    const claim: BonusClaim = { claimed: true, note: 'done' };
    const bonuses = new Map<string, BonusClaim>([['media-publicity', claim]]);
    const rows = bonusChecklistRows({ entryClass: '3A' }, bonuses, []);
    const row = rows.find((r) => r.def.id === 'media-publicity')!;
    expect(row.claim).toBe(claim);
    const unclaimed = rows.find((r) => r.def.id === 'w1aw-bulletin')!;
    expect(unclaimed.claim).toBeUndefined();
  });

  test('coachedCount counts non-deleted GOTA QSOs with gotaCoached set, same for every row', () => {
    const qsos = [
      makeQso({ id: 'a', station: 'GOTA', gotaCoached: true }),
      makeQso({ id: 'b', station: 'GOTA', gotaCoached: true }),
      makeQso({ id: 'c', station: 'GOTA', gotaCoached: false }),
      makeQso({ id: 'd', station: 'GOTA', gotaCoached: true, deleted: true }),
      makeQso({ id: 'e', station: 'MAIN', gotaCoached: true }),
    ];
    const rows = bonusChecklistRows({ entryClass: '3A' }, new Map(), qsos);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.coachedCount).toBe(2);
    }
  });
});
