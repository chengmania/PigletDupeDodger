import * as connectScreen from './screens/connect.ts';
import * as gridScreen from './screens/grid.ts';
import * as logScreen from './screens/log.ts';
import { store } from './store.ts';
import { connect } from './ws-client.ts';

type Screen = { render: (container: HTMLElement) => void };

const NAV_LINKS: Array<[string, string]> = [
  ['#/grid', 'Grid'],
  ['#/log', 'Log'],
];

function currentScreen(): Screen {
  const state = store.get();
  if (!state.you) return connectScreen;

  const route = location.hash.replace(/^#/, '') || '/grid';
  switch (route) {
    case '/log':
      return logScreen;
    case '/grid':
    default:
      return gridScreen;
  }
}

const appRoot = document.getElementById('app')!;
appRoot.innerHTML = '';
const nav = document.createElement('nav');
nav.className = 'app-nav';
const content = document.createElement('div');
content.className = 'app-content';
appRoot.append(nav, content);

function renderNav(): void {
  const state = store.get();
  nav.innerHTML = '';
  if (!state.you) return;
  const activeRoute = location.hash.replace(/^#/, '') || '/grid';
  for (const [href, label] of NAV_LINKS) {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = label;
    if (href === `#${activeRoute}`) a.classList.add('active');
    nav.appendChild(a);
  }
}

function rerender(): void {
  renderNav();
  currentScreen().render(content);
}

store.subscribe(rerender);
window.addEventListener('hashchange', rerender);

connect(`ws://${location.host}/ws`);
rerender();
