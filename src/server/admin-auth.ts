import type { AdminRecord } from './admin-store.ts';
import { writeAdmin } from './admin-store.ts';

// Uppercase alphanumeric, excluding ambiguous 0/O/1/I -- easier to transcribe
// by hand onto a sticky note or written record.
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRecoveryCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]).join('');
}

function randomSessionSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface SetupResult {
  record: AdminRecord;
  recoveryCode: string;
}

export async function setupAdmin(
  dataDir: string,
  input: { captainCall: string; captainName: string; password: string },
): Promise<SetupResult> {
  const recoveryCode = generateRecoveryCode();
  const now = new Date().toISOString();
  const record: AdminRecord = {
    formatVersion: 1,
    captainCall: input.captainCall.trim().toUpperCase(),
    captainName: input.captainName.trim(),
    passHash: await Bun.password.hash(input.password),
    recoveryHash: await Bun.password.hash(recoveryCode),
    sessionSecret: randomSessionSecret(),
    createdAtUtc: now,
    updatedAtUtc: now,
  };
  await writeAdmin(dataDir, record);
  return { record, recoveryCode };
}

export async function verifyLogin(record: AdminRecord, captainCall: string, password: string): Promise<boolean> {
  if (record.captainCall !== captainCall.trim().toUpperCase()) return false;
  return Bun.password.verify(password, record.passHash);
}

// Verifies the recovery code and, if valid, issues a new password AND a
// fresh recovery code (the old one stops working immediately).
export async function resetViaRecovery(
  dataDir: string,
  record: AdminRecord,
  recoveryCode: string,
  newPassword: string,
): Promise<SetupResult | null> {
  const valid = await Bun.password.verify(recoveryCode, record.recoveryHash);
  if (!valid) return null;

  const newRecoveryCode = generateRecoveryCode();
  const updated: AdminRecord = {
    ...record,
    passHash: await Bun.password.hash(newPassword),
    recoveryHash: await Bun.password.hash(newRecoveryCode),
    updatedAtUtc: new Date().toISOString(),
  };
  await writeAdmin(dataDir, updated);
  return { record: updated, recoveryCode: newRecoveryCode };
}
