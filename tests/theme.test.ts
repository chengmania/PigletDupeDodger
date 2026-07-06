import { describe, expect, test } from 'bun:test';
import { resolveTheme } from '../src/client/theme.ts';

describe('resolveTheme', () => {
  test('defaults to dark when nothing is stored', () => {
    expect(resolveTheme(null)).toBe('dark');
  });

  test('respects an explicit stored light preference', () => {
    expect(resolveTheme('light')).toBe('light');
  });

  test('respects an explicit stored dark preference', () => {
    expect(resolveTheme('dark')).toBe('dark');
  });

  test('falls back to dark for garbage/unrecognized values', () => {
    expect(resolveTheme('sepia')).toBe('dark');
    expect(resolveTheme('')).toBe('dark');
  });
});
