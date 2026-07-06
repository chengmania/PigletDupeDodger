import { describe, expect, test } from 'bun:test';
import { createInitialState, fold, reservationKey } from '../src/shared/journal.ts';
import type { JournalEvent } from '../src/shared/journal.ts';
import type { ClubConfig, Qso } from '../src/shared/types.ts';

function makeConfig(overrides: Partial<ClubConfig> = {}): ClubConfig {
  return {
    clubName: 'Test Club',
    clubCall: 'W1TEST',
    entryClass: '3A',
    section: 'EPA',
    powerMult: 1,
    eventStartUtc: '2026-06-27T18:00:00.000Z',
    eventEndUtc: '2026-06-28T20:59:00.000Z',
    ...overrides,
  };
}

function makeQso(overrides: Partial<Qso> = {}): Qso {
  return {
    id: 'q1',
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

describe('fold', () => {
  test('empty event list yields initial state', () => {
    const state = fold([]);
    expect(state.config).toBeNull();
    expect(state.qsos.size).toBe(0);
  });

  test('config:set fully replaces config on redo', () => {
    const events: JournalEvent[] = [
      { type: 'config:set', ts: 't1', config: makeConfig({ clubName: 'First' }) },
      { type: 'config:set', ts: 't2', config: makeConfig({ clubName: 'Second' }) },
    ];
    const state = fold(events);
    expect(state.config?.clubName).toBe('Second');
  });

  test('GOTA reservation is a singleton slot regardless of band', () => {
    const events: JournalEvent[] = [
      { type: 'slot:reserve', ts: 't1', band: '20m', mode: 'PH', station: 'GOTA', operatorCall: 'W1OP' },
      { type: 'slot:reserve', ts: 't2', band: '40m', mode: 'CW', station: 'GOTA', operatorCall: 'W1OP' },
    ];
    const state = fold(events);
    expect(state.reservations.size).toBe(1);
    expect(state.reservations.get('GOTA')?.band).toBe('40m');
  });

  test('MAIN reservations are keyed per band+mode', () => {
    const events: JournalEvent[] = [
      { type: 'slot:reserve', ts: 't1', band: '20m', mode: 'PH', station: 'MAIN', operatorCall: 'W1OP' },
      { type: 'slot:reserve', ts: 't2', band: '40m', mode: 'CW', station: 'MAIN', operatorCall: 'W1OP2' },
    ];
    const state = fold(events);
    expect(state.reservations.size).toBe(2);
    expect(state.reservations.get(reservationKey('MAIN', '20m', 'PH'))?.operatorCall).toBe('W1OP');
  });

  test('slot:release removes the reservation', () => {
    const events: JournalEvent[] = [
      { type: 'slot:reserve', ts: 't1', band: '20m', mode: 'PH', station: 'MAIN', operatorCall: 'W1OP' },
      { type: 'slot:release', ts: 't2', band: '20m', mode: 'PH', station: 'MAIN' },
    ];
    const state = fold(events);
    expect(state.reservations.size).toBe(0);
  });

  test('qso:delete is a soft delete -- record stays retrievable', () => {
    const qso = makeQso();
    const events: JournalEvent[] = [
      { type: 'qso:add', ts: 't1', qso, clientId: 'c1' },
      { type: 'qso:delete', ts: 't2', id: qso.id },
    ];
    const state = fold(events);
    expect(state.qsos.get(qso.id)?.deleted).toBe(true);
    expect(state.qsos.size).toBe(1);
  });

  test('qso:edit patches only the whitelisted fields', () => {
    const qso = makeQso();
    const events: JournalEvent[] = [
      { type: 'qso:add', ts: 't1', qso, clientId: 'c1' },
      { type: 'qso:edit', ts: 't2', id: qso.id, patch: { exchSection: 'WPA' } },
    ];
    const state = fold(events);
    expect(state.qsos.get(qso.id)?.exchSection).toBe('WPA');
    expect(state.qsos.get(qso.id)?.call).toBe('W1ABC');
  });

  test('qso:add records the clientId -> id mapping for idempotency', () => {
    const qso = makeQso();
    const state = fold([{ type: 'qso:add', ts: 't1', qso, clientId: 'c1' }]);
    expect(state.qsoIdByClientId.get('c1')).toBe(qso.id);
  });

  test('bonus:set stores the claim by bonusId', () => {
    const state = fold([{ type: 'bonus:set', ts: 't1', bonusId: 'satellite', claim: { claimed: true } }]);
    expect(state.bonuses.get('satellite')?.claimed).toBe(true);
  });

  test('applyEvent does not mutate the input state', () => {
    const before = createInitialState();
    const after = fold([{ type: 'op:join', ts: 't1', call: 'W1OP' }], before);
    expect(before.operators.size).toBe(0);
    expect(after.operators.size).toBe(1);
  });
});
