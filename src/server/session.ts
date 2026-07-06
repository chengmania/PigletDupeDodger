import { createHmac, timingSafeEqual } from 'node:crypto';

export const ADMIN_COOKIE_NAME = 'pdd_admin_session';
const DEFAULT_MAX_AGE_MS = 12 * 3600_000; // 12 hours

export interface SessionPayload {
  captainCall: string;
  issuedAtMs: number;
}

function base64url(input: string): string {
  return Buffer.from(input, 'utf-8').toString('base64url');
}

function base64urlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf-8');
}

export function signSession(payload: SessionPayload, secret: string): string {
  const encoded = base64url(JSON.stringify(payload));
  const sig = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

// Verifies signature (timing-safe), then shape and expiry. Returns null for
// any tampered, malformed, or expired token -- never throws.
export function verifySession(token: string, secret: string, maxAgeMs = DEFAULT_MAX_AGE_MS): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts as [string, string];

  const expectedSig = createHmac('sha256', secret).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(base64urlDecode(encoded));
  } catch {
    return null;
  }
  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof (payload as SessionPayload).captainCall !== 'string' ||
    typeof (payload as SessionPayload).issuedAtMs !== 'number'
  ) {
    return null;
  }

  const typed = payload as SessionPayload;
  if (Date.now() - typed.issuedAtMs > maxAgeMs) return null;
  return typed;
}

function parseCookie(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

// Validated once at WS upgrade time (a plain HTTP Request, before the
// protocol switch) and stashed on the socket -- see ws.ts.
export function checkAdminCookie(req: Request, secret: string): boolean {
  const cookieHeader = req.headers.get('cookie');
  if (!cookieHeader) return false;
  const token = parseCookie(cookieHeader, ADMIN_COOKIE_NAME);
  if (!token) return false;
  return verifySession(token, secret) !== null;
}

// No `Secure` flag: the whole app already runs over plain HTTP on a trusted
// LAN (same accepted trust model as the rest of this offline-first app) --
// documented explicitly rather than left implicit.
export function buildSessionCookie(captainCall: string, secret: string): string {
  const token = signSession({ captainCall, issuedAtMs: Date.now() }, secret);
  return `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${DEFAULT_MAX_AGE_MS / 1000}`;
}

export function buildLogoutCookie(): string {
  return `${ADMIN_COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}
