import type { ServerWebSocket } from 'bun';
import type { ServerMessage } from '../shared/protocol.ts';

export interface SocketData {
  operatorCall: string | null;
  // Set once at WS upgrade time from the admin session cookie (session.ts's
  // checkAdminCookie) -- independent of `hello`/operatorCall, so a captain
  // is gated on admin-only actions regardless of whether they've signed in
  // as an operator on this same connection.
  isAdmin: boolean;
}

const sockets = new Set<ServerWebSocket<SocketData>>();

export function registerSocket(ws: ServerWebSocket<SocketData>): void {
  sockets.add(ws);
}

export function unregisterSocket(ws: ServerWebSocket<SocketData>): void {
  sockets.delete(ws);
}

export function sendTo(ws: ServerWebSocket<SocketData>, message: ServerMessage): void {
  ws.send(JSON.stringify(message));
}

export function broadcast(message: ServerMessage): void {
  const payload = JSON.stringify(message);
  for (const ws of sockets) ws.send(payload);
}

export function connectedCount(): number {
  return sockets.size;
}
