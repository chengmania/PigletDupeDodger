import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deleteAdmin, readAdmin, writeAdmin, type AdminRecord } from '../src/server/admin-store.ts';

const dirsToClean: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'pdd-admin-store-'));
  dirsToClean.push(dir);
  return dir;
}

afterEach(async () => {
  while (dirsToClean.length) {
    const dir = dirsToClean.pop()!;
    await rm(dir, { recursive: true, force: true });
  }
});

function makeRecord(overrides: Partial<AdminRecord> = {}): AdminRecord {
  return {
    formatVersion: 1,
    captainCall: 'W1CAP',
    captainName: 'Cap Tain',
    passHash: 'hash',
    recoveryHash: 'rhash',
    sessionSecret: 'secret',
    createdAtUtc: '2026-06-27T18:00:00.000Z',
    updatedAtUtc: '2026-06-27T18:00:00.000Z',
    ...overrides,
  };
}

describe('readAdmin / writeAdmin / deleteAdmin', () => {
  test('returns null when admin.json does not exist', async () => {
    const dir = await makeTempDir();
    expect(await readAdmin(dir)).toBeNull();
  });

  test('round-trips a written record', async () => {
    const dir = await makeTempDir();
    const record = makeRecord();
    await writeAdmin(dir, record);
    expect(await readAdmin(dir)).toEqual(record);
  });

  test('deleteAdmin removes the file and is idempotent', async () => {
    const dir = await makeTempDir();
    await writeAdmin(dir, makeRecord());
    await deleteAdmin(dir);
    expect(await readAdmin(dir)).toBeNull();
    await deleteAdmin(dir); // should not throw when already absent
    expect(await readAdmin(dir)).toBeNull();
  });
});
