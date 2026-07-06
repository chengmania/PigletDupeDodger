import { describe, expect, test } from 'bun:test';
import { isMyReserveConfirm } from '../src/client/ws-client.ts';
import type { JournalEvent } from '../src/shared/journal.ts';

function reserveEvent(overrides: Partial<Extract<JournalEvent, { type: 'slot:reserve' }>> = {}): JournalEvent {
  return {
    type: 'slot:reserve',
    ts: '2026-06-27T19:00:00.000Z',
    band: '20m',
    mode: 'PH',
    station: 'MAIN',
    operatorCall: 'W1OP',
    ...overrides,
  };
}

describe('isMyReserveConfirm', () => {
  test('matches a slot:reserve event for your own call', () => {
    const result = isMyReserveConfirm(reserveEvent({ operatorCall: 'W1OP' }), 'W1OP');
    expect(result).toEqual({ band: '20m', mode: 'PH', station: 'MAIN' });
  });

  test('returns null for another operator\'s reservation', () => {
    expect(isMyReserveConfirm(reserveEvent({ operatorCall: 'W2OTHER' }), 'W1OP')).toBeNull();
  });

  test('returns null when youCall is null', () => {
    expect(isMyReserveConfirm(reserveEvent({ operatorCall: 'W1OP' }), null)).toBeNull();
  });

  test('returns null for non-reserve event types', () => {
    const event: JournalEvent = { type: 'slot:release', ts: 't', band: '20m', mode: 'PH', station: 'MAIN' };
    expect(isMyReserveConfirm(event, 'W1OP')).toBeNull();
  });
});
