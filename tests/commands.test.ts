import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildFullState,
  dispatch,
  type CommandDeps,
  type Connection,
  type ServerContext,
} from '../src/server/commands.ts';
import { createInitialState } from '../src/shared/journal.ts';
import type { ClientMessage, ServerMessage } from '../src/shared/protocol.ts';
import type { NewQsoInput } from '../src/shared/protocol.ts';

const dirsToClean: string[] = [];

async function makeDeps(): Promise<CommandDeps> {
  const dataDir = await mkdtemp(join(tmpdir(), 'pdd-commands-'));
  dirsToClean.push(dataDir);
  const ctx: ServerContext = { dataDir, state: createInitialState(), seq: 0 };
  ctx.state.config = {
    clubName: 'Test Club',
    clubCall: 'W1CLUB',
    gotaCall: 'W1GOTA',
    entryClass: '3A',
    section: 'EPA',
    powerMult: 1,
    eventStartUtc: '2020-01-01T00:00:00.000Z',
    eventEndUtc: '2099-01-01T00:00:00.000Z',
  };
  return { ctx, broadcast: () => {} };
}

function makeConn(): Connection & { sent: ServerMessage[] } {
  const sent: ServerMessage[] = [];
  return {
    operatorCall: null,
    send: (m: ServerMessage) => sent.push(m),
    sent,
  };
}

function newQso(overrides: Partial<NewQsoInput> = {}): NewQsoInput {
  return {
    station: 'MAIN',
    band: '20m',
    mode: 'PH',
    call: 'W2ABC',
    exchClass: '3A',
    exchSection: 'EPA',
    ...overrides,
  };
}

async function signIn(deps: CommandDeps, call: string): Promise<Connection & { sent: ServerMessage[] }> {
  const conn = makeConn();
  await dispatch(deps, conn, { type: 'hello', operatorCall: call });
  return conn;
}

function lastRejects(conn: { sent: ServerMessage[] }): ServerMessage[] {
  return conn.sent.filter((m) => m.type === 'reject');
}

afterEach(async () => {
  while (dirsToClean.length) {
    const dir = dirsToClean.pop()!;
    await rm(dir, { recursive: true, force: true });
  }
});

describe('qso:add', () => {
  test('rejects when not signed in', async () => {
    const deps = await makeDeps();
    const conn = makeConn();
    const msg: ClientMessage = { type: 'qso:add', clientId: 'c1', qso: newQso() };
    await dispatch(deps, conn, msg);
    expect(lastRejects(conn)).toHaveLength(1);
    expect((lastRejects(conn)[0] as any).reason).toBe('NOT_SIGNED_IN');
  });

  test('rejects when the operator has not reserved the slot', async () => {
    const deps = await makeDeps();
    const conn = await signIn(deps, 'W1OP');
    await dispatch(deps, conn, { type: 'qso:add', clientId: 'c1', qso: newQso() });
    expect((lastRejects(conn)[0] as any).reason).toBe('NOT_YOUR_SLOT');
  });

  test('idempotent double-send with the same clientId does not duplicate the QSO', async () => {
    const deps = await makeDeps();
    const conn = await signIn(deps, 'W1OP');
    await dispatch(deps, conn, { type: 'reserve', band: '20m', mode: 'PH', station: 'MAIN' });

    const msg: ClientMessage = { type: 'qso:add', clientId: 'dup1', qso: newQso() };
    await dispatch(deps, conn, msg);
    await dispatch(deps, conn, msg);

    expect(deps.ctx.state.qsos.size).toBe(1);
  });

  test('BLOCKED_SELF is never overridable', async () => {
    const deps = await makeDeps();
    const conn = await signIn(deps, 'W1OP');
    await dispatch(deps, conn, { type: 'reserve', band: '20m', mode: 'PH', station: 'MAIN' });
    await dispatch(deps, conn, {
      type: 'qso:add',
      clientId: 'c1',
      qso: newQso({ call: 'W1CLUB' }),
      override: true,
    });
    expect((lastRejects(conn)[0] as any).reason).toBe('BLOCKED_SELF');
    expect(deps.ctx.state.qsos.size).toBe(0);
  });

  test('a plain dupe requires override to succeed', async () => {
    const deps = await makeDeps();
    const conn = await signIn(deps, 'W1OP');
    await dispatch(deps, conn, { type: 'reserve', band: '20m', mode: 'PH', station: 'MAIN' });
    await dispatch(deps, conn, { type: 'qso:add', clientId: 'c1', qso: newQso() });
    expect(deps.ctx.state.qsos.size).toBe(1);

    await dispatch(deps, conn, { type: 'qso:add', clientId: 'c2', qso: newQso() });
    expect((lastRejects(conn)[0] as any).reason).toBe('DUPE_CONFIRM_REQUIRED');
    expect(deps.ctx.state.qsos.size).toBe(1);

    await dispatch(deps, conn, { type: 'qso:add', clientId: 'c3', qso: newQso(), override: true });
    expect(deps.ctx.state.qsos.size).toBe(2);
  });

  test('satellite QSO auto-claims the satellite bonus', async () => {
    const deps = await makeDeps();
    const conn = await signIn(deps, 'W1OP');
    await dispatch(deps, conn, { type: 'reserve', band: 'SAT', mode: 'PH', station: 'MAIN' });
    await dispatch(deps, conn, {
      type: 'qso:add',
      clientId: 'c1',
      qso: newQso({ band: 'SAT', satelliteName: 'SO-50', satelliteSingleChannelFm: true }),
    });
    expect(deps.ctx.state.bonuses.get('satellite')?.claimed).toBe(true);
  });

  test('single-channel-FM satellite limit blocks a second QSO on the same satellite', async () => {
    const deps = await makeDeps();
    const connA = await signIn(deps, 'W1OP');
    await dispatch(deps, connA, { type: 'reserve', band: 'SAT', mode: 'PH', station: 'MAIN' });
    await dispatch(deps, connA, {
      type: 'qso:add',
      clientId: 'c1',
      qso: newQso({ call: 'W2XYZ', band: 'SAT', satelliteName: 'SO-50', satelliteSingleChannelFm: true }),
    });
    await dispatch(deps, connA, { type: 'release', station: 'MAIN', band: 'SAT', mode: 'PH' });

    const connB = await signIn(deps, 'W1OP2');
    await dispatch(deps, connB, { type: 'reserve', band: 'SAT', mode: 'PH', station: 'MAIN' });
    await dispatch(deps, connB, {
      type: 'qso:add',
      clientId: 'c2',
      qso: newQso({ call: 'W3DEF', band: 'SAT', satelliteName: 'SO-50', satelliteSingleChannelFm: true }),
    });
    expect((lastRejects(connB)[0] as any).reason).toBe('SAT_LIMIT');
  });
});

describe('reserve', () => {
  test('a second operator cannot claim an already-held band/mode slot', async () => {
    const deps = await makeDeps();
    const connA = await signIn(deps, 'W1OP');
    await dispatch(deps, connA, { type: 'reserve', band: '20m', mode: 'PH', station: 'MAIN' });

    const connB = await signIn(deps, 'W1OP2');
    await dispatch(deps, connB, { type: 'reserve', band: '20m', mode: 'PH', station: 'MAIN' });
    expect((lastRejects(connB)[0] as any).reason).toBe('SLOT_TAKEN');
  });

  test('GOTA is a singleton slot -- a conflicting claim on a different band still rejects', async () => {
    const deps = await makeDeps();
    const connA = await signIn(deps, 'W1OP');
    await dispatch(deps, connA, { type: 'reserve', band: '20m', mode: 'PH', station: 'GOTA' });

    const connB = await signIn(deps, 'W1OP2');
    await dispatch(deps, connB, { type: 'reserve', band: '40m', mode: 'CW', station: 'GOTA' });
    expect((lastRejects(connB)[0] as any).reason).toBe('SLOT_TAKEN');
  });
});

describe('buildFullState', () => {
  test('reflects the current config, operators, and seq', async () => {
    const deps = await makeDeps();
    await signIn(deps, 'W1OP');
    const full = buildFullState(deps.ctx);
    expect(full.config?.clubCall).toBe('W1CLUB');
    expect(full.operators).toHaveLength(1);
    expect(full.seq).toBe(deps.ctx.seq);
  });
});
