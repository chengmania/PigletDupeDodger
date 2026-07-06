import type { DupeResult } from '../shared/dupe.ts';

export interface DupeUiStatus {
  label: string;
  className: string;
  // BLOCKED_* statuses can never be logged, even with override.
  blockedHard: boolean;
  // A plain DUPE can be logged, but only with an explicit override confirmation.
  requiresOverride: boolean;
  workedElsewhereText?: string;
}

export function describeDupe(result: DupeResult): DupeUiStatus {
  const workedElsewhereText = result.workedElsewhere.length
    ? `Worked elsewhere: ${result.workedElsewhere.map((w) => `${w.band}/${w.mode}`).join(', ')}`
    : undefined;

  switch (result.status) {
    case 'NEW':
      return { label: 'NEW', className: 'dupe-new', blockedHard: false, requiresOverride: false, workedElsewhereText };
    case 'DUPE':
      return { label: 'DUPE', className: 'dupe-dupe', blockedHard: false, requiresOverride: true, workedElsewhereText };
    case 'BLOCKED_SELF':
      return { label: "BLOCKED -- that's your own club/GOTA call", className: 'dupe-blocked', blockedHard: true, requiresOverride: false };
    case 'BLOCKED_SAT_LIMIT':
      return {
        label: 'BLOCKED -- one completed QSO limit reached for this satellite',
        className: 'dupe-blocked',
        blockedHard: true,
        requiresOverride: false,
      };
  }
}
