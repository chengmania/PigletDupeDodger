import * as connectScreen from './screens/connect.ts';
import * as gridScreen from './screens/grid.ts';
import { store } from './store.ts';
import { connect } from './ws-client.ts';

type Screen = { render: (container: HTMLElement) => void };

function currentScreen(): Screen {
  const state = store.get();
  if (!state.you) return connectScreen;

  const route = location.hash.replace(/^#/, '') || '/grid';
  switch (route) {
    case '/grid':
    default:
      return gridScreen;
  }
}

function rerender(): void {
  const app = document.getElementById('app');
  if (!app) return;
  currentScreen().render(app);
}

store.subscribe(rerender);
window.addEventListener('hashchange', rerender);

connect(`ws://${location.host}/ws`);
rerender();
