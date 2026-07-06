import { describe, expect, test } from 'bun:test';
import { checkAdminCookie, signSession, verifySession } from '../src/server/session.ts';

describe('signSession / verifySession', () => {
  test('round-trips a valid payload', () => {
    const token = signSession({ captainCall: 'W1CAP', issuedAtMs: Date.now() }, 'secret1');
    const payload = verifySession(token, 'secret1');
    expect(payload?.captainCall).toBe('W1CAP');
  });

  test('rejects a token signed with a different secret', () => {
    const token = signSession({ captainCall: 'W1CAP', issuedAtMs: Date.now() }, 'secret1');
    expect(verifySession(token, 'wrong-secret')).toBeNull();
  });

  test('rejects a tampered payload (signature no longer matches)', () => {
    const token = signSession({ captainCall: 'W1CAP', issuedAtMs: Date.now() }, 'secret1');
    const sig = token.split('.')[1];
    const tamperedEncoded = Buffer.from(JSON.stringify({ captainCall: 'W9EVIL', issuedAtMs: Date.now() })).toString('base64url');
    expect(verifySession(`${tamperedEncoded}.${sig}`, 'secret1')).toBeNull();
  });

  test('rejects an expired token', () => {
    const token = signSession({ captainCall: 'W1CAP', issuedAtMs: Date.now() - 1_000_000 }, 'secret1');
    expect(verifySession(token, 'secret1', 500)).toBeNull();
  });

  test('does not throw on malformed/truncated tokens', () => {
    expect(verifySession('', 'secret1')).toBeNull();
    expect(verifySession('garbage', 'secret1')).toBeNull();
    expect(verifySession('a.b.c', 'secret1')).toBeNull();
    expect(verifySession('not-base64!!.sig', 'secret1')).toBeNull();
  });
});

describe('checkAdminCookie', () => {
  function requestWithCookie(cookieHeader: string | null): Request {
    const headers = new Headers();
    if (cookieHeader) headers.set('cookie', cookieHeader);
    return new Request('http://localhost/ws', { headers });
  }

  test('true for a request carrying a valid session cookie', () => {
    const token = signSession({ captainCall: 'W1CAP', issuedAtMs: Date.now() }, 'secret1');
    const req = requestWithCookie(`other=1; pdd_admin_session=${encodeURIComponent(token)}`);
    expect(checkAdminCookie(req, 'secret1')).toBe(true);
  });

  test('false when no cookie header is present', () => {
    expect(checkAdminCookie(requestWithCookie(null), 'secret1')).toBe(false);
  });

  test('false when the cookie is present but invalid', () => {
    const req = requestWithCookie('pdd_admin_session=garbage');
    expect(checkAdminCookie(req, 'secret1')).toBe(false);
  });
});
