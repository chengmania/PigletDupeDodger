import { applyEvent } from '../shared/journal.ts';
import { fullStateToState, type ClientMessage, type ServerMessage } from '../shared/protocol.ts';
import { store } from './store.ts';

let socket: WebSocket | null = null;

// Lets screens (e.g. the logging screen's optimistic row) react to the
// server's authoritative response to a specific qso:add without having to
// guess-match it back by call/band/mode.
type QsoAddOutcome = { clientId: string; ok: true } | { clientId: string; ok: false; reason: string };
const qsoAddListeners = new Set<(outcome: QsoAddOutcome) => void>();

export function onQsoAddOutcome(fn: (outcome: QsoAddOutcome) => void): () => void {
  qsoAddListeners.add(fn);
  return () => qsoAddListeners.delete(fn);
}

export function connect(url: string): void {
  socket = new WebSocket(url);
  store.set({ connection: 'connecting' });

  socket.addEventListener('open', () => {
    store.set({ connection: 'connected' });
  });

  socket.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data as string) as ServerMessage;
    handleServerMessage(msg);
  });

  socket.addEventListener('close', () => {
    store.set({ connection: 'offline' });
  });

  socket.addEventListener('error', () => {
    store.set({ connection: 'offline' });
  });
}

export function send(msg: ClientMessage): void {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}

function handleServerMessage(msg: ServerMessage): void {
  const current = store.get();

  switch (msg.type) {
    case 'welcome': {
      store.set({
        you: msg.you,
        data: fullStateToState(msg.state),
        seq: msg.state.seq,
        serverTimeOffsetMs: new Date(msg.serverNowUtc).getTime() - Date.now(),
      });
      break;
    }
    case 'event': {
      store.set({ data: applyEvent(current.data, msg.event), seq: msg.seq });
      if (msg.event.type === 'qso:add') {
        for (const fn of qsoAddListeners) fn({ clientId: msg.event.clientId, ok: true });
      }
      break;
    }
    case 'reject': {
      console.warn(`[server] rejected ${msg.refType ?? ''}: ${msg.reason}`);
      if (msg.refType === 'qso:add' && msg.clientId) {
        for (const fn of qsoAddListeners) fn({ clientId: msg.clientId, ok: false, reason: msg.reason });
      }
      break;
    }
    case 'pong': {
      store.set({ serverTimeOffsetMs: new Date(msg.serverNowUtc).getTime() - Date.now() });
      break;
    }
  }
}

export function serverNow(): Date {
  return new Date(Date.now() + store.get().serverTimeOffsetMs);
}
