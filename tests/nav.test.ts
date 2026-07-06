import { describe, expect, test } from 'bun:test';
import { navLinks } from '../src/client/nav.ts';

describe('navLinks', () => {
  test('disables the Log link when the operator holds no reservation', () => {
    const links = navLinks(false);
    const log = links.find((l) => l.href === '#/log');
    expect(log?.disabled).toBe(true);
  });

  test('enables the Log link once a reservation is held', () => {
    const links = navLinks(true);
    const log = links.find((l) => l.href === '#/log');
    expect(log?.disabled).toBe(false);
  });

  test('Grid and Dashboard are never disabled', () => {
    for (const hasReservation of [true, false]) {
      const links = navLinks(hasReservation);
      expect(links.find((l) => l.href === '#/grid')?.disabled).toBe(false);
      expect(links.find((l) => l.href === '#/dashboard')?.disabled).toBe(false);
    }
  });

  test('is exactly Grid, Log, Dashboard -- no Exports/Leaderboard/Host Setup', () => {
    for (const hasReservation of [true, false]) {
      const hrefs = navLinks(hasReservation).map((l) => l.href);
      expect(hrefs).toEqual(['#/grid', '#/log', '#/dashboard']);
    }
  });
});
