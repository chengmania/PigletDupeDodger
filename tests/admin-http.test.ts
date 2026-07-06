import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveAdminApi } from '../src/server/admin-http.ts';
import type { ServerContext } from '../src/server/commands.ts';
import { createInitialState } from '../src/shared/journal.ts';

const dirsToClean: string[] = [];

async function makeCtx(): Promise<ServerContext> {
  const dataDir = await mkdtemp(join(tmpdir(), 'pdd-admin-http-'));
  dirsToClean.push(dataDir);
  return { dataDir, state: createInitialState(), seq: 0, admin: null };
}

afterEach(async () => {
  while (dirsToClean.length) {
    const dir = dirsToClean.pop()!;
    await rm(dir, { recursive: true, force: true });
  }
});

function postJson(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, { method: 'POST', body: JSON.stringify(body) });
}

function getReq(path: string): Request {
  return new Request(`http://localhost${path}`, { method: 'GET' });
}

describe('serveAdminApi', () => {
  test('GET /api/admin/status reflects configured state', async () => {
    const ctx = await makeCtx();
    const res = await serveAdminApi(getReq('/api/admin/status'), ctx);
    expect(await res!.json()).toEqual({ configured: false, loggedIn: false });
  });

  test('setup succeeds once, then 409s on a second attempt', async () => {
    const ctx = await makeCtx();
    const res1 = await serveAdminApi(
      postJson('/api/admin/setup', { captainCall: 'W1CAP', captainName: 'Cap', password: 'hunter2' }),
      ctx,
    );
    expect(res1!.status).toBe(200);
    const body = (await res1!.json()) as { recoveryCode: string };
    expect(body.recoveryCode).toHaveLength(8);
    expect(res1!.headers.get('set-cookie')).toContain('pdd_admin_session=');
    expect(ctx.admin?.captainCall).toBe('W1CAP');

    const res2 = await serveAdminApi(
      postJson('/api/admin/setup', { captainCall: 'W2OTHER', captainName: 'Other', password: 'x' }),
      ctx,
    );
    expect(res2!.status).toBe(409);
  });

  test('setup rejects missing required fields', async () => {
    const ctx = await makeCtx();
    const res = await serveAdminApi(postJson('/api/admin/setup', { captainCall: '' }), ctx);
    expect(res!.status).toBe(400);
  });

  test('login succeeds with correct credentials, 401s with wrong password', async () => {
    const ctx = await makeCtx();
    await serveAdminApi(postJson('/api/admin/setup', { captainCall: 'W1CAP', captainName: 'Cap', password: 'hunter2' }), ctx);

    const good = await serveAdminApi(postJson('/api/admin/login', { captainCall: 'W1CAP', password: 'hunter2' }), ctx);
    expect(good!.status).toBe(200);
    const cookie = good!.headers.get('set-cookie')!;
    expect(cookie).toContain('pdd_admin_session=');

    const bad = await serveAdminApi(postJson('/api/admin/login', { captainCall: 'W1CAP', password: 'wrong' }), ctx);
    expect(bad!.status).toBe(401);

    // status reflects loggedIn:true when the request carries the issued cookie,
    // and includes captainCall so the client can hello over WS as the captain.
    const statusReq = new Request('http://localhost/api/admin/status', { headers: { cookie: cookie.split(';')[0]! } });
    const statusRes = await serveAdminApi(statusReq, ctx);
    expect(await statusRes!.json()).toEqual({ configured: true, loggedIn: true, captainCall: 'W1CAP' });
  });

  test('login 409s before setup has ever run', async () => {
    const ctx = await makeCtx();
    const res = await serveAdminApi(postJson('/api/admin/login', { captainCall: 'W1CAP', password: 'x' }), ctx);
    expect(res!.status).toBe(409);
  });

  test('full recovery-reset flow: verify then reset issues a new working password', async () => {
    const ctx = await makeCtx();
    const setupRes = await serveAdminApi(
      postJson('/api/admin/setup', { captainCall: 'W1CAP', captainName: 'Cap', password: 'hunter2' }),
      ctx,
    );
    const { recoveryCode } = (await setupRes!.json()) as { recoveryCode: string };

    const verifyRes = await serveAdminApi(postJson('/api/admin/recovery/verify', { recoveryCode }), ctx);
    expect((await verifyRes!.json()) as { valid: boolean }).toEqual({ valid: true });

    const resetRes = await serveAdminApi(postJson('/api/admin/recovery/reset', { recoveryCode, newPassword: 'newpass123' }), ctx);
    expect(resetRes!.status).toBe(200);

    const loginOld = await serveAdminApi(postJson('/api/admin/login', { captainCall: 'W1CAP', password: 'hunter2' }), ctx);
    expect(loginOld!.status).toBe(401);
    const loginNew = await serveAdminApi(postJson('/api/admin/login', { captainCall: 'W1CAP', password: 'newpass123' }), ctx);
    expect(loginNew!.status).toBe(200);
  });

  test('logout clears the cookie', async () => {
    const ctx = await makeCtx();
    const res = await serveAdminApi(postJson('/api/admin/logout', {}), ctx);
    expect(res!.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  test('non-admin paths return undefined (not handled here)', async () => {
    const ctx = await makeCtx();
    expect(await serveAdminApi(getReq('/'), ctx)).toBeUndefined();
  });
});
