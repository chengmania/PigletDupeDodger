export type Mode = 'PH' | 'CW' | 'DIG';
export type StationKind = 'MAIN' | 'GOTA';

export interface ClubConfig {
  clubName: string;
  clubCall: string;
  gotaCall?: string;
  entryClass: string; // e.g. "3A"
  section: string; // e.g. "EPA"
  powerMult: 1 | 2 | 5;
  eventStartUtc: string;
  eventEndUtc: string;
  location?: string;
  // Host-attested participant count, used for the Class D/E educational-activity
  // bonus eligibility gate (Rule 7.3.10) which requires >=3 participants.
  participantCount?: number;
}

export interface Operator {
  call: string;
  name?: string;
  age18OrUnder?: boolean;
  connectedAt: string;
}

export interface Reservation {
  band: string;
  mode: Mode;
  station: StationKind;
  operatorCall: string;
  since: string;
}

export interface Qso {
  id: string;
  ts: string;
  station: StationKind;
  band: string;
  mode: Mode;
  call: string;
  exchClass: string;
  exchSection: string;
  operatorCall: string;
  satelliteName?: string;
  // Distinguishes a single-channel-FM satellite pass (subject to the
  // one-completed-QSO-per-satellite limit, Rule 7.3.7.1) from a linear
  // transponder satellite (not subject to that limit).
  satelliteSingleChannelFm?: boolean;
  gotaCoached?: boolean;
  deleted?: boolean;
  // Set when this QSO's ts came from a client's offline outbox rather than
  // being stamped by the server on receipt (spec section 10).
  queued?: boolean;
  // Server-computed only (never client-settable, see protocol.ts): true when
  // this QSO was logged (or edited into) an already-worked exact key
  // (call+band+mode+station) and explicitly confirmed "log anyway". Scores 0
  // points and is excluded from scoring/Cabrillo/dupe-sheet, but stays
  // visible (with a badge) and is kept in the JSON backup.
  dupe?: boolean;
}

export interface BonusClaim {
  claimed: boolean;
  note?: string;
  // Only used by the 'emergency-power' bonus (per-transmitter scaling).
  transmitterCount?: number;
  // Only used by the 'message-handling' bonus (per-message scaling).
  messageCount?: number;
}
