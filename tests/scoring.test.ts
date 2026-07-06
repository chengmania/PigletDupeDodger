import { describe, expect, test } from 'bun:test';
import { scoreLog } from '../src/shared/scoring.ts';
import type { BonusClaim } from '../src/shared/types.ts';
import { makeConfig, makeQso } from './fixtures.ts';

function bonusMap(entries: Record<string, BonusClaim>): Map<string, BonusClaim> {
  return new Map(Object.entries(entries));
}

describe('scoreLog -- QSO points and multiplier', () => {
  test('PH is worth 1 point', () => {
    const r = scoreLog([makeQso({ mode: 'PH' })], makeConfig({ powerMult: 1 }), new Map(), []);
    expect(r.qsoPoints).toBe(1);
  });

  test('CW is worth 2 points', () => {
    const r = scoreLog([makeQso({ mode: 'CW' })], makeConfig({ powerMult: 1 }), new Map(), []);
    expect(r.qsoPoints).toBe(2);
  });

  test('DIG is worth 2 points', () => {
    const r = scoreLog([makeQso({ mode: 'DIG' })], makeConfig({ powerMult: 1 }), new Map(), []);
    expect(r.qsoPoints).toBe(2);
  });

  test('mixed modes with multiplier 2', () => {
    const qsos = [makeQso({ mode: 'PH' }), makeQso({ mode: 'PH' }), makeQso({ mode: 'CW' }), makeQso({ mode: 'DIG' })];
    const r = scoreLog(qsos, makeConfig({ powerMult: 2 }), new Map(), []);
    expect(r.qsoPoints).toBe(6);
    expect(r.multipliedPoints).toBe(12);
  });

  test('multiplier 5 (QRP battery)', () => {
    const qsos = [makeQso({ mode: 'PH' }), makeQso({ mode: 'PH' }), makeQso({ mode: 'PH' })];
    const r = scoreLog(qsos, makeConfig({ powerMult: 5 }), new Map(), []);
    expect(r.multipliedPoints).toBe(15);
  });
});

describe('scoreLog -- GOTA bonus (7.3.13.1)', () => {
  test('GOTA bonus is 5pts/contact and unmultiplied', () => {
    const qsos = [makeQso({ station: 'GOTA', mode: 'PH' }), makeQso({ station: 'GOTA', mode: 'PH' }), makeQso({ station: 'GOTA', mode: 'PH' })];
    const r = scoreLog(qsos, makeConfig({ powerMult: 5 }), new Map(), []);
    expect(r.gotaBonus).toBe(15);
    expect(r.multipliedPoints).toBe(15); // 3 PH * 1pt * mult 5, not affected by gotaBonus
  });

  test('GOTA QSOs still earn ordinary multiplied credit alongside the bonus', () => {
    const r = scoreLog([makeQso({ station: 'GOTA', mode: 'PH' })], makeConfig({ powerMult: 2 }), new Map(), []);
    expect(r.qsoPoints).toBe(1);
    expect(r.multipliedPoints).toBe(2);
    expect(r.gotaBonus).toBe(5);
    expect(r.total).toBe(7);
  });

  test('GOTA coach bonus awarded when >=10 coached contacts and claimed', () => {
    const qsos = Array.from({ length: 12 }, () => makeQso({ station: 'GOTA', gotaCoached: true }));
    const r = scoreLog(qsos, makeConfig({ entryClass: '3A' }), bonusMap({ 'gota-coach': { claimed: true } }), []);
    expect(r.bonusPoints).toBeGreaterThanOrEqual(100);
    expect(r.ineligibleClaims).not.toContain('gota-coach');
  });

  test('GOTA coach bonus withheld when coached count is under 10, even if claimed', () => {
    const qsos = Array.from({ length: 5 }, () => makeQso({ station: 'GOTA', gotaCoached: true }));
    const r = scoreLog(qsos, makeConfig({ entryClass: '3A' }), bonusMap({ 'gota-coach': { claimed: true } }), []);
    expect(r.ineligibleClaims).toContain('gota-coach');
  });

  test('GOTA coach bonus not awarded when not claimed', () => {
    const qsos = Array.from({ length: 12 }, () => makeQso({ station: 'GOTA', gotaCoached: true }));
    const r = scoreLog(qsos, makeConfig({ entryClass: '3A' }), new Map(), []);
    expect(r.bonusPoints).toBe(0);
  });
});

describe('scoreLog -- bonus catalog', () => {
  test('emergency power: PDF worked example, 3 transmitters = 300 bonus points', () => {
    const r = scoreLog(
      [],
      makeConfig({ entryClass: '3A' }),
      bonusMap({ 'emergency-power': { claimed: true, transmitterCount: 3 } }),
      [],
    );
    expect(r.bonusPoints).toBe(300);
  });

  test('emergency power caps at 20 transmitters', () => {
    const r = scoreLog(
      [],
      makeConfig({ entryClass: '3A' }),
      bonusMap({ 'emergency-power': { claimed: true, transmitterCount: 25 } }),
      [],
    );
    expect(r.bonusPoints).toBe(2000);
  });

  test('satellite bonus is flat regardless of SAT QSO count', () => {
    const qsos = [
      makeQso({ band: 'SAT', satelliteName: 'A' }),
      makeQso({ band: 'SAT', satelliteName: 'B' }),
      makeQso({ band: 'SAT', satelliteName: 'C' }),
    ];
    const r = scoreLog(qsos, makeConfig({ entryClass: '2A' }), bonusMap({ satellite: { claimed: true } }), []);
    expect(r.bonusPoints).toBe(100);
  });

  test('message handling scales per message', () => {
    const r = scoreLog([], makeConfig({ entryClass: '3A' }), bonusMap({ 'message-handling': { claimed: true, messageCount: 4 } }), []);
    expect(r.bonusPoints).toBe(40);
  });

  test('message handling caps at 10 messages', () => {
    const r = scoreLog([], makeConfig({ entryClass: '3A' }), bonusMap({ 'message-handling': { claimed: true, messageCount: 15 } }), []);
    expect(r.bonusPoints).toBe(100);
  });

  test('class-ineligible bonus is excluded and flagged', () => {
    const r = scoreLog([], makeConfig({ entryClass: '2B' }), bonusMap({ 'safety-officer': { claimed: true } }), []);
    expect(r.bonusPoints).toBe(0);
    expect(r.ineligibleClaims).toContain('safety-officer');
  });

  test('class-eligible bonus is included', () => {
    const r = scoreLog([], makeConfig({ entryClass: '3A' }), bonusMap({ 'safety-officer': { claimed: true } }), []);
    expect(r.bonusPoints).toBe(100);
  });
});

describe('scoreLog -- youth bonus (7.3.15)', () => {
  test('general class, under cap', () => {
    const qsos = [makeQso({ operatorCall: 'Y1' }), makeQso({ operatorCall: 'Y2' }), makeQso({ operatorCall: 'Y3' })];
    const operators = [
      { call: 'Y1', age18OrUnder: true, connectedAt: 't' },
      { call: 'Y2', age18OrUnder: true, connectedAt: 't' },
      { call: 'Y3', age18OrUnder: true, connectedAt: 't' },
    ];
    const r = scoreLog(qsos, makeConfig({ entryClass: '3A' }), new Map(), operators);
    expect(r.youthBonus).toBe(60);
  });

  test('general class, capped at 5 youths (100 points)', () => {
    const qsos = Array.from({ length: 6 }, (_, i) => makeQso({ operatorCall: `Y${i}` }));
    const operators = Array.from({ length: 6 }, (_, i) => ({ call: `Y${i}`, age18OrUnder: true, connectedAt: 't' }));
    const r = scoreLog(qsos, makeConfig({ entryClass: '3A' }), new Map(), operators);
    expect(r.youthBonus).toBe(100);
  });

  test('youth operator with zero QSOs does not count', () => {
    const operators = [{ call: 'Y1', age18OrUnder: true, connectedAt: 't' }];
    const r = scoreLog([], makeConfig({ entryClass: '3A' }), new Map(), operators);
    expect(r.youthBonus).toBe(0);
  });

  test('1-person Class B youth', () => {
    const qsos = [makeQso({ operatorCall: 'Y1' })];
    const operators = [{ call: 'Y1', age18OrUnder: true, connectedAt: 't' }];
    const r = scoreLog(qsos, makeConfig({ entryClass: '1B' }), new Map(), operators);
    expect(r.youthBonus).toBe(20);
  });

  test('2-person Class B, both youth -> 40 points (not the general /5 cap logic)', () => {
    const qsos = [makeQso({ operatorCall: 'Y1' }), makeQso({ operatorCall: 'Y2' })];
    const operators = [
      { call: 'Y1', age18OrUnder: true, connectedAt: 't' },
      { call: 'Y2', age18OrUnder: true, connectedAt: 't' },
    ];
    const r = scoreLog(qsos, makeConfig({ entryClass: '2B' }), new Map(), operators);
    expect(r.youthBonus).toBe(40);
  });
});

describe('scoreLog -- filtering', () => {
  test('deleted QSOs are excluded everywhere', () => {
    const r = scoreLog([makeQso({ deleted: true })], makeConfig(), new Map(), []);
    expect(r.qsoPoints).toBe(0);
    expect(Object.keys(r.perBand)).toHaveLength(0);
    expect(Object.keys(r.perOperator)).toHaveLength(0);
  });

  test('out-of-window QSOs excluded by default', () => {
    const config = makeConfig();
    const early = makeQso({ ts: '2020-01-01T00:00:00.000Z' });
    const r = scoreLog([early], config, new Map(), []);
    expect(r.qsoPoints).toBe(0);
  });

  test('out-of-window QSOs included with includeOutOfWindow', () => {
    const config = makeConfig();
    const early = makeQso({ ts: '2020-01-01T00:00:00.000Z' });
    const r = scoreLog([early], config, new Map(), [], { includeOutOfWindow: true });
    expect(r.qsoPoints).toBe(1);
  });

  test('perBand/perMode/perOperator aggregation', () => {
    const qsos = [
      makeQso({ band: '20m', mode: 'PH', operatorCall: 'A' }),
      makeQso({ band: '20m', mode: 'CW', operatorCall: 'A' }),
      makeQso({ band: '40m', mode: 'PH', operatorCall: 'B' }),
    ];
    const r = scoreLog(qsos, makeConfig(), new Map(), []);
    expect(r.perBand['20m']?.count).toBe(2);
    expect(r.perBand['40m']?.count).toBe(1);
    expect(r.perMode.PH?.count).toBe(2);
    expect(r.perMode.CW?.count).toBe(1);
    expect(r.perOperator.A?.count).toBe(2);
    expect(r.perOperator.B?.count).toBe(1);
  });
});
