import { createInitialState, reservationKey, type JournalEvent, type State } from './journal.ts';
import type { BonusClaim, ClubConfig, Mode, Operator, Qso, Reservation, StationKind } from './types.ts';

// 'dupe' is explicitly excluded here (not just left out of a Pick allow-list
// like QsoEditPatch below) -- Omit only removes what's named, and without
// this, adding `dupe?: boolean` to Qso would have silently made it
// client-settable on every qso:add. Only the server may set it.
export type NewQsoInput = Omit<Qso, 'id' | 'ts' | 'operatorCall' | 'deleted' | 'dupe'>;
// 'dupe' is likewise never part of this allow-list -- only the server's
// recompute in handleQsoEdit may include it in the journal event's patch.
export type QsoEditPatch = Partial<
  Pick<Qso, 'exchClass' | 'exchSection' | 'band' | 'mode' | 'call' | 'satelliteName' | 'satelliteSingleChannelFm' | 'gotaCoached'>
>;

export type ClientMessage =
  | { type: 'hello'; operatorCall: string; name?: string; age18OrUnder?: boolean }
  | { type: 'reserve'; band: string; mode: Mode; station: StationKind }
  | { type: 'release'; station: StationKind; band?: string; mode?: Mode }
  | { type: 'qso:add'; clientId: string; qso: NewQsoInput; queued?: boolean; clientTs?: string; override?: boolean }
  | { type: 'qso:edit'; id: string; patch: QsoEditPatch }
  | { type: 'qso:delete'; id: string }
  | { type: 'bonus:set'; bonusId: string; claim: BonusClaim }
  | { type: 'config:set'; config: ClubConfig }
  | { type: 'ping'; t: number };

export interface FullState {
  config: ClubConfig | null;
  operators: Operator[];
  reservations: Reservation[];
  qsos: Qso[];
  bonuses: Record<string, BonusClaim>;
  seq: number;
}

export type RejectReason =
  | 'NOT_SIGNED_IN'
  | 'INVALID_BAND_MODE'
  | 'SAT_NAME_REQUIRED'
  | 'INVALID_CLASS'
  | 'INVALID_SECTION'
  | 'BLOCKED_SELF'
  | 'SAT_LIMIT'
  | 'DUPE_CONFIRM_REQUIRED'
  | 'NOT_YOUR_SLOT'
  | 'SLOT_TAKEN'
  | 'NOT_FOUND'
  | 'NOT_YOUR_QSO';

export type ServerMessage =
  | { type: 'welcome'; you: Operator; serverNowUtc: string; state: FullState }
  | { type: 'event'; event: JournalEvent; seq: number }
  | { type: 'reject'; reason: RejectReason; clientId?: string; refType?: ClientMessage['type'] }
  | { type: 'pong'; t: number; serverNowUtc: string };

// Rebuilds the Map-based fold State from a wire-transmitted FullState
// snapshot, so clients can reuse the same shared applyEvent()/checkDupe()/
// scoreLog() engines the server uses, instead of a parallel reimplementation.
export function fullStateToState(full: FullState): State {
  const state = createInitialState();
  state.config = full.config;
  for (const op of full.operators) state.operators.set(op.call, op);
  for (const res of full.reservations) state.reservations.set(reservationKey(res.station, res.band, res.mode), res);
  for (const qso of full.qsos) state.qsos.set(qso.id, qso);
  for (const [bonusId, claim] of Object.entries(full.bonuses)) state.bonuses.set(bonusId, claim);
  return state;
}
