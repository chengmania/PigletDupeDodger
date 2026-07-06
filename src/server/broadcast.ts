import type { ServerWebSocket } from 'bun';
import type { ServerMessage } from '../shared/protocol.ts';

export interface SocketData {
  operatorCall: string | null;
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
