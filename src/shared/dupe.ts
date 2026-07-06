import type { ClubConfig, Mode, Qso, StationKind } from './types.ts';

// Suffix tokens stripped for dupe MATCHING only -- the full call as entered is
// always what gets logged/exported. Covers portable (/P), mobile (/M),
// maritime mobile (/MM), QRP (/QRP), and assisted-operator (/AG) markers.
const SUFFIX_TOKENS = new Set(['P', 'M', 'MM', 'AM', 'QRP', 'AG', 'A']);

export function normalizeCall(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toUpperCase();
}

// Strips known suffix tokens, then -- for compound/prefix-style calls where
// multiple segments remain (e.g. "KH6/W1ABCDEF") -- takes the longest
// remaining segment as the base call. This is a documented, deterministic
// assumption; full DXCC-prefix-table parsing is out of scope for v1.
export function baseCall(raw: string): string {
  const normalized = normalizeCall(raw);
  const segments = normalized.split('/').filter((s) => s.length > 0);
  if (segments.length <= 1) return normalized;

  const remaining = segments.filter((s) => !SUFFIX_TOKENS.has(s));
  const candidates = remaining.length > 0 ? remaining : segments;
  return candidates.reduce((longest, s) => (s.length > longest.length ? s : longest));
}

export function dupeKey(call: string, band: string, mode: Mode, station: StationKind): string {
  return `${baseCall(call)}|${band}|${mode}|${station}`;
}

export interface WorkedElsewhere {
  band: string;
  mode: Mode;
  ts: string;
  by: string;
  station: StationKind;
}

export type DupeStatus = 'NEW' | 'DUPE' | 'BLOCKED_SELF' | 'BLOCKED_SAT_LIMIT';

export interface DupeResult {
  status: DupeStatus;
  workedElsewhere: WorkedElsewhere[];
  exactDupe?: Qso;
}

export interface DupeCheckInput {
  call: string;
  band: string;
  mode: Mode;
  station: StationKind;
  satelliteName?: string;
  satelliteSingleChannelFm?: boolean;
}

export function checkDupe(
  input: DupeCheckInput,
  log: readonly Qso[],
  config: Pick<ClubConfig, 'clubCall' | 'gotaCall'>,
): DupeResult {
  const base = baseCall(input.call);
  const active = log.filter((q) => !q.deleted);

  // Rule 6.1: an operator can't work their own club's stations. Checked
  // first and never overridable.
  if (base === baseCall(config.clubCall) || (config.gotaCall && base === baseCall(config.gotaCall))) {
    return { status: 'BLOCKED_SELF', workedElsewhere: [] };
  }

  // Rule 7.3.7.1: at most one completed QSO on any single-channel FM
  // satellite. This is a per-satellite slot limit, not a callsign dupe, so
  // it ignores the caller entirely.
  if (input.band === 'SAT' && input.satelliteSingleChannelFm && input.satelliteName) {
    const satLimitHit = active.some(
      (q) => q.band === 'SAT' && q.satelliteSingleChannelFm === true && q.satelliteName === input.satelliteName,
    );
    if (satLimitHit) {
      return { status: 'BLOCKED_SAT_LIMIT', workedElsewhere: [] };
    }
  }

  const key = dupeKey(input.call, input.band, input.mode, input.station);
  const exactDupe = active.find((q) => dupeKey(q.call, q.band, q.mode, q.station) === key);

  const workedElsewhere: WorkedElsewhere[] = active
    .filter((q) => baseCall(q.call) === base && q.station === input.station && (q.band !== input.band || q.mode !== input.mode))
    .map((q) => ({ band: q.band, mode: q.mode, ts: q.ts, by: q.operatorCall, station: q.station }));

  if (exactDupe) {
    return { status: 'DUPE', workedElsewhere, exactDupe };
  }

  return { status: 'NEW', workedElsewhere };
}
