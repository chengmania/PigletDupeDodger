import { describe, expect, test } from 'bun:test';
import { generateId } from '../src/shared/id.ts';

describe('generateId', () => {
  test('generates unique ids', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(generateId());
    expect(ids.size).toBe(1000);
  });

  test('is monotonically sortable by generation order', () => {
    const generated: string[] = [];
    for (let i = 0; i < 1000; i++) generated.push(generateId());
    const sorted = [...generated].sort();
    expect(sorted).toEqual(generated);
  });
});
