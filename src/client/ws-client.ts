import { applyEvent } from '../shared/journal.ts';
import { fullStateToState, type ClientMessage, type ServerMessage } from '../shared/protocol.ts';
import { store } from './store.ts';

let socket: WebSocket | null = null;

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
      break;
    }
    case 'reject': {
      console.warn(`[server] rejected ${msg.refType ?? ''}: ${msg.reason}`);
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
