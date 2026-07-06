// Permissive ham-format check: reject empty/too-short only, don't over-constrain
// since real-world callsign grammar (prefixes, portable suffixes, DX formats)
// varies far more than a single regex can safely encode.
export const CALLSIGN_REGEX = /^[A-Z0-9]{3,3}[A-Z0-9/]{0,7}$/;

// Entry class, e.g. "3A", "1B", or the battery variants "1AB"/"1BB".
export const CLASS_REGEX = /^\d{1,2}(?:AB|BB|[A-F])$/i;

export function isValidCallsign(call: string): boolean {
  return CALLSIGN_REGEX.test(call.trim().toUpperCase());
}

export function isValidClass(entryClass: string): boolean {
  return CLASS_REGEX.test(entryClass.trim());
}
