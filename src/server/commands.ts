import { BAND_IDS } from '../shared/bands.ts';
import { checkDupe, normalizeCall } from '../shared/dupe.ts';
import { generateId } from '../shared/id.ts';
import { applyEvent, reservationKey, type JournalEvent, type State } from '../shared/journal.ts';
import type { ClientMessage, FullState, RejectReason, ServerMessage } from '../shared/protocol.ts';
import { isValidSectionCode } from '../shared/sections.ts';
import type { Mode, Qso, StationKind } from '../shared/types.ts';
import { isValidClass } from '../shared/validate.ts';
import { appendEvent } from './journal-io.ts';

const VALID_MODES: Mode[] = ['PH', 'CW', 'DIG'];
const VALID_STATIONS: StationKind[] = ['MAIN', 'GOTA'];

export interface ServerContext {
  dataDir: string;
  state: State;
  seq: number;
}

export interface Connection {
  operatorCall: string | null;
  send: (message: ServerMessage) => void;
}

export interface CommandDeps {
  ctx: ServerContext;
  broadcast: (message: ServerMessage) => void;
}

function reject(conn: Connection, reason: RejectReason, clientId?: string, refType?: ClientMessage['type']): void {
  conn.send({ type: 'reject', reason, clientId, refType });
}

export function buildFullState(ctx: ServerContext): FullState {
  return {
    config: ctx.state.config,
    operators: [...ctx.state.operators.values()],
    reservations: [...ctx.state.reservations.values()],
    qsos: [...ctx.state.qsos.values()],
    bonuses: Object.fromEntries(ctx.state.bonuses),
    seq: ctx.seq,
  };
}

async function append(deps: CommandDeps, event: Parameters<typeof applyEvent>[1]): Promise<void> {
  await appendEvent(deps.ctx.dataDir, event);
  deps.ctx.state = applyEvent(deps.ctx.state, event);
  deps.ctx.seq += 1;
  deps.broadcast({ type: 'event', event, seq: deps.ctx.seq });
}

export async function handleHello(
  deps: CommandDeps,
  conn: Connection,
  msg: Extract<ClientMessage, { type: 'hello' }>,
): Promise<void> {
  const call = normalizeCall(msg.operatorCall);
  conn.operatorCall = call;
  await append(deps, {
    type: 'op:join',
    ts: new Date().toISOString(),
    call,
    name: msg.name,
    age18OrUnder: msg.age18OrUnder,
  });
  conn.send({
    type: 'welcome',
    you: deps.ctx.state.operators.get(call)!,
    serverNowUtc: new Date().toISOString(),
    state: buildFullState(deps.ctx),
  });
}

export async function handleReserve(
  deps: CommandDeps,
  conn: Connection,
  msg: Extract<ClientMessage, { type: 'reserve' }>,
): Promise<void> {
  if (!conn.operatorCall) return reject(conn, 'NOT_SIGNED_IN');
  if (!BAND_IDS.includes(msg.band) || !VALID_MODES.includes(msg.mode) || !VALID_STATIONS.includes(msg.station)) {
    return reject(conn, 'INVALID_BAND_MODE');
  }

  const key = reservationKey(msg.station, msg.band, msg.mode);
  const existing = deps.ctx.state.reservations.get(key);

  if (existing && existing.operatorCall !== conn.operatorCall) {
    return reject(conn, 'SLOT_TAKEN');
  }
  if (existing && existing.operatorCall === conn.operatorCall) {
    // Idempotent re-claim (e.g. a page refresh) -- avoid journal bloat.
    return;
  }

  await append(deps, {
    type: 'slot:reserve',
    ts: new Date().toISOString(),
    band: msg.band,
    mode: msg.mode,
    station: msg.station,
    operatorCall: conn.operatorCall,
  });
}

export async function handleRelease(
  deps: CommandDeps,
  conn: Connection,
  msg: Extract<ClientMessage, { type: 'release' }>,
): Promise<void> {
  if (!conn.operatorCall) return reject(conn, 'NOT_SIGNED_IN');
  if (msg.station === 'MAIN' && (!msg.band || !msg.mode)) return reject(conn, 'INVALID_BAND_MODE');

  const band = msg.station === 'GOTA' ? '' : msg.band!;
  const mode = msg.station === 'GOTA' ? ('PH' as Mode) : msg.mode!;
  const key = reservationKey(msg.station, band, mode);
  const existing = deps.ctx.state.reservations.get(key);
  if (!existing) return reject(conn, 'NOT_FOUND');
  if (existing.operatorCall !== conn.operatorCall) return reject(conn, 'NOT_YOUR_SLOT');

  await append(deps, {
    type: 'slot:release',
    ts: new Date().toISOString(),
    band: existing.band,
    mode: existing.mode,
    station: msg.station,
  });
}

export async function handleQsoAdd(
  deps: CommandDeps,
  conn: Connection,
  msg: Extract<ClientMessage, { type: 'qso:add' }>,
): Promise<void> {
  const existingId = deps.ctx.state.qsoIdByClientId.get(msg.clientId);
  if (existingId) {
    // Idempotent retry (offline-outbox replay or a double-send): don't
    // re-append, just re-echo the original event to this socket only.
    const existingQso = deps.ctx.state.qsos.get(existingId);
    if (existingQso) {
      conn.send({
        type: 'event',
        event: { type: 'qso:add', ts: existingQso.ts, qso: existingQso, clientId: msg.clientId },
        seq: deps.ctx.seq,
      });
    }
    return;
  }

  if (!conn.operatorCall) return reject(conn, 'NOT_SIGNED_IN', msg.clientId, msg.type);

  const { band, mode, station } = msg.qso;
  if (!BAND_IDS.includes(band) || !VALID_MODES.includes(mode) || !VALID_STATIONS.includes(station)) {
    return reject(conn, 'INVALID_BAND_MODE', msg.clientId, msg.type);
  }
  if (band === 'SAT' && !msg.qso.satelliteName) {
    return reject(conn, 'SAT_NAME_REQUIRED', msg.clientId, msg.type);
  }
  if (!isValidClass(msg.qso.exchClass)) {
    return reject(conn, 'INVALID_CLASS', msg.clientId, msg.type);
  }
  if (!isValidSectionCode(msg.qso.exchSection)) {
    return reject(conn, 'INVALID_SECTION', msg.clientId, msg.type);
  }

  const config = deps.ctx.state.config ?? { clubCall: '', gotaCall: undefined };
  const dupe = checkDupe(
    {
      call: msg.qso.call,
      band,
      mode,
      station,
      satelliteName: msg.qso.satelliteName,
      satelliteSingleChannelFm: msg.qso.satelliteSingleChannelFm,
    },
    [...deps.ctx.state.qsos.values()],
    config,
  );
  if (dupe.status === 'BLOCKED_SELF') return reject(conn, 'BLOCKED_SELF', msg.clientId, msg.type);
  if (dupe.status === 'BLOCKED_SAT_LIMIT') return reject(conn, 'SAT_LIMIT', msg.clientId, msg.type);
  if (dupe.status === 'DUPE' && !msg.override) return reject(conn, 'DUPE_CONFIRM_REQUIRED', msg.clientId, msg.type);

  const slotKey = reservationKey(station, band, mode);
  const reservation = deps.ctx.state.reservations.get(slotKey);
  if (!reservation || reservation.operatorCall !== conn.operatorCall) {
    return reject(conn, 'NOT_YOUR_SLOT', msg.clientId, msg.type);
  }

  const ts = msg.queued && msg.clientTs ? msg.clientTs : new Date().toISOString();
  const qso: Qso = {
    ...msg.qso,
    id: generateId(),
    ts,
    operatorCall: conn.operatorCall,
    queued: !!msg.queued,
    // Only reachable here with dupe.status === 'DUPE' when override was
    // true (any other DUPE case already rejected above). Hybrid two-press
    // logging: this QSO still gets logged, just flagged 0-point/excluded.
    dupe: dupe.status === 'DUPE',
  };

  await append(deps, { type: 'qso:add', ts, qso, clientId: msg.clientId });

  if (band === 'SAT' && !deps.ctx.state.bonuses.get('satellite')?.claimed) {
    await append(deps, {
      type: 'bonus:set',
      ts: new Date().toISOString(),
      bonusId: 'satellite',
      claim: { claimed: true },
    });
  }
}

export async function handleQsoEdit(
  deps: CommandDeps,
  conn: Connection,
  msg: Extract<ClientMessage, { type: 'qso:edit' }>,
): Promise<void> {
  if (!conn.operatorCall) return reject(conn, 'NOT_SIGNED_IN');
  const existing = deps.ctx.state.qsos.get(msg.id);
  if (!existing) return reject(conn, 'NOT_FOUND');

  // If the edit touches any dupe-key field, re-run checkDupe against the
  // rest of the log (excluding this QSO) with the merged new values and
  // fold the recomputed flag into the same journal event. This handles both
  // directions -- un-duping (call corrected to something fresh) and newly
  // duping (edited into collision with another QSO) -- from one code path.
  // scoreLog() is always computed fresh from current state, so there's no
  // separate "rescore" step once the flag updates.
  let patch: Extract<JournalEvent, { type: 'qso:edit' }>['patch'] = msg.patch;
  const touchesDupeKey = !existing.deleted && (msg.patch.call !== undefined || msg.patch.band !== undefined || msg.patch.mode !== undefined);
  if (touchesDupeKey) {
    const merged = { ...existing, ...msg.patch };
    const config = deps.ctx.state.config ?? { clubCall: '', gotaCall: undefined };
    const others = [...deps.ctx.state.qsos.values()].filter((q) => q.id !== msg.id);
    const result = checkDupe(
      {
        call: merged.call,
        band: merged.band,
        mode: merged.mode,
        station: merged.station,
        satelliteName: merged.satelliteName,
        satelliteSingleChannelFm: merged.satelliteSingleChannelFm,
      },
      others,
      config,
    );
    patch = { ...msg.patch, dupe: result.status === 'DUPE' };
  }

  await append(deps, { type: 'qso:edit', ts: new Date().toISOString(), id: msg.id, patch });
}

export async function handleQsoDelete(
  deps: CommandDeps,
  conn: Connection,
  msg: Extract<ClientMessage, { type: 'qso:delete' }>,
): Promise<void> {
  if (!conn.operatorCall) return reject(conn, 'NOT_SIGNED_IN');
  if (!deps.ctx.state.qsos.has(msg.id)) return reject(conn, 'NOT_FOUND');
  await append(deps, { type: 'qso:delete', ts: new Date().toISOString(), id: msg.id });
}

export async function handleBonusSet(
  deps: CommandDeps,
  conn: Connection,
  msg: Extract<ClientMessage, { type: 'bonus:set' }>,
): Promise<void> {
  if (!conn.operatorCall) return reject(conn, 'NOT_SIGNED_IN');
  await append(deps, { type: 'bonus:set', ts: new Date().toISOString(), bonusId: msg.bonusId, claim: msg.claim });
}

export async function handleConfigSet(
  deps: CommandDeps,
  conn: Connection,
  msg: Extract<ClientMessage, { type: 'config:set' }>,
): Promise<void> {
  await append(deps, { type: 'config:set', ts: new Date().toISOString(), config: msg.config });
}

export function handlePing(conn: Connection, msg: Extract<ClientMessage, { type: 'ping' }>): void {
  conn.send({ type: 'pong', t: msg.t, serverNowUtc: new Date().toISOString() });
}

export async function dispatch(deps: CommandDeps, conn: Connection, msg: ClientMessage): Promise<void> {
  switch (msg.type) {
    case 'hello':
      return handleHello(deps, conn, msg);
    case 'reserve':
      return handleReserve(deps, conn, msg);
    case 'release':
      return handleRelease(deps, conn, msg);
    case 'qso:add':
      return handleQsoAdd(deps, conn, msg);
    case 'qso:edit':
      return handleQsoEdit(deps, conn, msg);
    case 'qso:delete':
      return handleQsoDelete(deps, conn, msg);
    case 'bonus:set':
      return handleBonusSet(deps, conn, msg);
    case 'config:set':
      return handleConfigSet(deps, conn, msg);
    case 'ping':
      return handlePing(conn, msg);
  }
}
