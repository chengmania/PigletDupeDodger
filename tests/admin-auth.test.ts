import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetViaRecovery, setupAdmin, verifyLogin } from '../src/server/admin-auth.ts';

const dirsToClean: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'pdd-admin-auth-'));
  dirsToClean.push(dir);
  return dir;
}

afterEach(async () => {
  while (dirsToClean.length) {
    const dir = dirsToClean.pop()!;
    await rm(dir, { recursive: true, force: true });
  }
});

describe('setupAdmin', () => {
  test('produces a record whose password verifies and whose recovery code verifies', async () => {
    const dir = await makeTempDir();
    const { record, recoveryCode } = await setupAdmin(dir, { captainCall: 'w1cap', captainName: 'Cap Tain', password: 'hunter2' });

    expect(record.captainCall).toBe('W1CAP');
    expect(await verifyLogin(record, 'W1CAP', 'hunter2')).toBe(true);
    expect(await verifyLogin(record, 'W1CAP', 'wrong-password')).toBe(false);
    expect(recoveryCode).toHaveLength(8);
  });
});

describe('verifyLogin', () => {
  test('rejects a mismatched callsign', async () => {
    const dir = await makeTempDir();
    const { record } = await setupAdmin(dir, { captainCall: 'W1CAP', captainName: 'Cap', password: 'hunter2' });
    expect(await verifyLogin(record, 'W9OTHER', 'hunter2')).toBe(false);
  });
});

describe('resetViaRecovery', () => {
  test('rejects a wrong recovery code', async () => {
    const dir = await makeTempDir();
    const { record } = await setupAdmin(dir, { captainCall: 'W1CAP', captainName: 'Cap', password: 'hunter2' });
    const result = await resetViaRecovery(dir, record, 'WRONGCODE', 'newpass123');
    expect(result).toBeNull();
  });

  test('succeeds with the right code, issues a new password and a new recovery code', async () => {
    const dir = await makeTempDir();
    const { record, recoveryCode } = await setupAdmin(dir, { captainCall: 'W1CAP', captainName: 'Cap', password: 'hunter2' });

    const result = await resetViaRecovery(dir, record, recoveryCode, 'newpass123');
    expect(result).not.toBeNull();
    expect(await verifyLogin(result!.record, 'W1CAP', 'newpass123')).toBe(true);
    expect(await verifyLogin(result!.record, 'W1CAP', 'hunter2')).toBe(false); // old password no longer works
    expect(result!.recoveryCode).not.toBe(recoveryCode);

    // the OLD recovery code no longer verifies against the new record
    const secondAttempt = await resetViaRecovery(dir, result!.record, recoveryCode, 'anotherpass');
    expect(secondAttempt).toBeNull();
  });
});
