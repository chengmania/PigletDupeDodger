import type { Server, ServerWebSocket } from 'bun';
import type { ClientMessage } from '../shared/protocol.ts';
import { registerSocket, sendTo, unregisterSocket, type SocketData } from './broadcast.ts';
import { dispatch, type CommandDeps, type Connection } from './commands.ts';
import { checkAdminCookie } from './session.ts';

export function upgradeIfWebSocket(req: Request, server: Server<SocketData>, sessionSecret: string): Response | undefined {
  const url = new URL(req.url);
  if (url.pathname !== '/ws') return undefined;
  const isAdmin = checkAdminCookie(req, sessionSecret);
  const upgraded = server.upgrade(req, { data: { operatorCall: null, isAdmin } });
  return upgraded ? undefined : new Response('Upgrade failed', { status: 400 });
}

export function makeWebSocketHandlers(deps: CommandDeps) {
  return {
    open(ws: ServerWebSocket<SocketData>) {
      registerSocket(ws);
    },
    async message(ws: ServerWebSocket<SocketData>, raw: string | Buffer) {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString()) as ClientMessage;
      } catch {
        return; // ignore malformed frames
      }

      // Reservations are intentionally NOT auto-released on disconnect (a
      // dropped WiFi connection doesn't mean the transmitter went silent),
      // so `open`/`close` don't touch reservation state -- only an explicit
      // `release` message does.
      const conn: Connection = {
        get operatorCall() {
          return ws.data.operatorCall;
        },
        set operatorCall(value: string | null) {
          ws.data.operatorCall = value;
        },
        get isAdmin() {
          return ws.data.isAdmin;
        },
        send: (message) => sendTo(ws, message),
      };

      await dispatch(deps, conn, msg);
    },
    close(ws: ServerWebSocket<SocketData>) {
      unregisterSocket(ws);
    },
  };
}
