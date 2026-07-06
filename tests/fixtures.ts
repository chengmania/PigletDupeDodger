import type { ClubConfig, Qso } from '../src/shared/types.ts';

export function makeConfig(overrides: Partial<ClubConfig> = {}): ClubConfig {
  return {
    clubName: 'Test Club',
    clubCall: 'W1CLUB',
    gotaCall: 'W1GOTA',
    entryClass: '3A',
    section: 'EPA',
    powerMult: 1,
    eventStartUtc: '2026-06-27T18:00:00.000Z',
    eventEndUtc: '2026-06-28T20:59:00.000Z',
    ...overrides,
  };
}

let qsoCounter = 0;
export function makeQso(overrides: Partial<Qso> = {}): Qso {
  qsoCounter += 1;
  return {
    id: `q${qsoCounter}`,
    ts: '2026-06-27T19:00:00.000Z',
    station: 'MAIN',
    band: '20m',
    mode: 'PH',
    call: 'W1ABC',
    exchClass: '3A',
    exchSection: 'EPA',
    operatorCall: 'W1OP',
    ...overrides,
  };
}
