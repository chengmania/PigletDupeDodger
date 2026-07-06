export type BonusScaling = 'flat' | 'per-transmitter' | 'per-message';

export interface BonusDef {
  id: string;
  ruleRef: string;
  name: string;
  points: number;
  // Eligible entry-class letters (extracted from e.g. "3A" -> "A").
  classes: string[];
  scaling: BonusScaling;
  maxUnits?: number; // caps per-transmitter/per-message scaling
  requiresGotaCoachCount?: number; // gates the gota-coach bonus at >=10 coached contacts
}

// Full catalog transcribed from Rule 7.3 of the 2026 ARRL Field Day rules.
// 7.3.13.1 (GOTA 5pt/contact) and 7.3.15.x (youth bonus) are NOT catalog
// items -- they are derived automatically from the QSO log / operator list
// inside scoring.ts, not host-toggled checklist entries.
export const BONUS_CATALOG: BonusDef[] = [
  { id: 'emergency-power', ruleRef: '7.3.1', name: '100% Emergency Power', points: 100, classes: ['A', 'B', 'C', 'E', 'F'], scaling: 'per-transmitter', maxUnits: 20 },
  { id: 'media-publicity', ruleRef: '7.3.2', name: 'Media Publicity', points: 100, classes: ['A', 'B', 'C', 'D', 'E', 'F'], scaling: 'flat' },
  { id: 'public-location', ruleRef: '7.3.3', name: 'Public Location', points: 100, classes: ['A', 'B', 'F'], scaling: 'flat' },
  { id: 'public-info-table', ruleRef: '7.3.4', name: 'Public Information Table', points: 100, classes: ['A', 'B', 'F'], scaling: 'flat' },
  { id: 'message-to-sm', ruleRef: '7.3.5', name: 'Message to Section Manager', points: 100, classes: ['A', 'B', 'C', 'D', 'E', 'F'], scaling: 'flat' },
  { id: 'message-handling', ruleRef: '7.3.6', name: 'Message Handling', points: 10, classes: ['A', 'B', 'C', 'D', 'E', 'F'], scaling: 'per-message', maxUnits: 10 },
  { id: 'satellite', ruleRef: '7.3.7', name: 'Satellite QSO', points: 100, classes: ['A', 'B', 'F'], scaling: 'flat' },
  { id: 'alternate-power', ruleRef: '7.3.8', name: 'Alternate Power (5+ QSOs)', points: 100, classes: ['A', 'B', 'E', 'F'], scaling: 'flat' },
  { id: 'w1aw-bulletin', ruleRef: '7.3.9', name: 'W1AW Bulletin', points: 100, classes: ['A', 'B', 'C', 'D', 'E', 'F'], scaling: 'flat' },
  { id: 'educational', ruleRef: '7.3.10', name: 'Educational Activity', points: 100, classes: ['A', 'F', 'D', 'E'], scaling: 'flat' },
  { id: 'official-visit', ruleRef: '7.3.11', name: 'Elected Official Site Visit', points: 100, classes: ['A', 'B', 'C', 'D', 'E', 'F'], scaling: 'flat' },
  { id: 'agency-visit', ruleRef: '7.3.12', name: 'Served-Agency Rep Site Visit', points: 100, classes: ['A', 'B', 'C', 'D', 'E', 'F'], scaling: 'flat' },
  { id: 'gota-coach', ruleRef: '7.3.13.2', name: 'GOTA Coach', points: 100, classes: ['A', 'F'], scaling: 'flat', requiresGotaCoachCount: 10 },
  { id: 'web-submission', ruleRef: '7.3.14', name: 'Web Submission', points: 50, classes: ['A', 'B', 'C', 'D', 'E', 'F'], scaling: 'flat' },
  { id: 'social-media', ruleRef: '7.3.16', name: 'Social Media', points: 100, classes: ['A', 'B', 'C', 'D', 'E', 'F'], scaling: 'flat' },
  { id: 'safety-officer', ruleRef: '7.3.17', name: 'Safety Officer', points: 100, classes: ['A'], scaling: 'flat' },
  { id: 'site-responsibilities', ruleRef: '7.3.18', name: 'Field Day Site Responsibilities', points: 50, classes: ['B', 'C', 'D', 'E', 'F'], scaling: 'flat' },
];

export function entryClassLetter(entryClass: string): string {
  return entryClass.replace(/^\d+/, '').toUpperCase();
}

export function isClassEligible(def: Pick<BonusDef, 'classes'>, entryClass: string): boolean {
  return def.classes.includes(entryClassLetter(entryClass));
}

export function getBonusDef(id: string): BonusDef | undefined {
  return BONUS_CATALOG.find((b) => b.id === id);
}
