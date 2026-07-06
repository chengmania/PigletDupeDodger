import { describe, expect, test } from 'bun:test';
import { BADGE_SECTIONS, SECTION_PATH_ID, SECTION_PINS } from '../src/shared/section-map-pins.ts';
import { SECTION_CODES } from '../src/shared/sections.ts';

// Matches section-map.svg's viewBox="500 0 1789 1744" -- cropped on the left
// to remove the empty ocean gap Hawaii's true geographic position left, now
// that Hawaii is drawn as a repositioned, boxed inset instead.
const VIEWBOX_X_MIN = 500;
const VIEWBOX_X_MAX = 2289;
const VIEWBOX_HEIGHT = 1744;

describe('SECTION_PINS + BADGE_SECTIONS', () => {
  test('every known section code appears in exactly one of SECTION_PINS or BADGE_SECTIONS', () => {
    const pinSections = new Set(SECTION_PINS.map((p) => p.section));
    const badgeSections = new Set<string>(BADGE_SECTIONS);

    for (const code of SECTION_CODES) {
      const inPins = pinSections.has(code);
      const inBadges = badgeSections.has(code);
      expect(inPins || inBadges).toBe(true);
      expect(inPins && inBadges).toBe(false);
    }
  });

  test('no duplicate entries in SECTION_PINS', () => {
    const seen = new Set<string>();
    for (const p of SECTION_PINS) {
      expect(seen.has(p.section)).toBe(false);
      seen.add(p.section);
    }
  });

  test('no extra sections beyond the known code list', () => {
    const known = new Set(SECTION_CODES);
    for (const p of SECTION_PINS) expect(known.has(p.section)).toBe(true);
    for (const b of BADGE_SECTIONS) expect(known.has(b)).toBe(true);
  });

  test('every pin coordinate falls within the map viewBox', () => {
    for (const p of SECTION_PINS) {
      expect(p.x).toBeGreaterThanOrEqual(VIEWBOX_X_MIN);
      expect(p.x).toBeLessThanOrEqual(VIEWBOX_X_MAX);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(VIEWBOX_HEIGHT);
    }
  });

  test('every pinned section has a corresponding path id for the fill-tint effect', () => {
    for (const p of SECTION_PINS) {
      expect(SECTION_PATH_ID[p.section]).toBeDefined();
      expect(SECTION_PATH_ID[p.section]).toMatch(/^(US|CA)-[A-Z]+$/);
    }
  });
});
