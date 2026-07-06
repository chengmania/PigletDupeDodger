import * as connectScreen from './screens/connect.ts';
import * as dashboardScreen from './screens/dashboard.ts';
import * as exportsScreen from './screens/exports.ts';
import * as gridScreen from './screens/grid.ts';
import * as hostSetupScreen from './screens/host-setup.ts';
import * as leaderboardScreen from './screens/leaderboard.ts';
import * as logScreen from './screens/log.ts';
import { mountBanner, updateBanner } from './banner.ts';
import { mountCaptainApp } from './captain/captain-main.ts';
import { mountHeader } from './header.ts';
import { isHostMode } from './host-mode.ts';
import { navLinks } from './nav.ts';
import { store } from './store.ts';
import { initTheme } from './theme.ts';
import { connect, onReserveConfirmed } from './ws-client.ts';

type Screen = { render: (container: HTMLElement, isNewMount: boolean) => void };

function currentRoute(): string {
  return location.hash.replace(/^#/, '') || '/grid';
}

function currentScreen(route: string): Screen {
  // Public, no sign-in required -- this is the big-screen kiosk view.
  if (route === '/leaderboard') return leaderboardScreen;

  const state = store.get();
  if (!state.you) return connectScreen;

  switch (route) {
    case '/log':
      return logScreen;
    case '/dashboard':
      return dashboardScreen;
    case '/exports':
      return exportsScreen;
    case '/setup':
      return hostSetupScreen;
    case '/grid':
    default:
      return gridScreen;
  }
}

function hasReservation(): boolean {
  const state = store.get();
  if (!state.you) return false;
  for (const r of state.data.reservations.values()) {
    if (r.operatorCall === state.you.call) return true;
  }
  return false;
}

function initOperatorApp(): void {
  initTheme();

  const appRoot = document.getElementById('app')!;
  appRoot.innerHTML = '';
  mountBanner(appRoot);
  mountHeader(appRoot);
  const nav = document.createElement('nav');
  nav.className = 'app-nav';
  const content = document.createElement('div');
  content.className = 'app-content';
  appRoot.append(nav, content);

  // Diff-and-patch instead of a full teardown/rebuild on every store update
  // -- rebuilding fresh <a> elements on every broadcast created a window
  // where a click on one could land on an anchor that gets replaced
  // mid-click.
  const navAnchors = new Map<string, HTMLAnchorElement>();
  nav.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target instanceof HTMLAnchorElement && target.classList.contains('disabled')) {
      e.preventDefault();
    }
  });

  function renderNav(): void {
    const state = store.get();
    if (!state.you) {
      nav.innerHTML = '';
      navAnchors.clear();
      return;
    }

    const activeRoute = currentRoute();
    const links = navLinks(hasReservation(), isHostMode());

    const seen = new Set<string>();
    for (const { href, label, disabled } of links) {
      seen.add(href);
      let a = navAnchors.get(href);
      if (!a) {
        a = document.createElement('a');
        a.href = href;
        navAnchors.set(href, a);
        nav.appendChild(a);
      }
      if (a.textContent !== label) a.textContent = label;
      a.classList.toggle('active', href === `#${activeRoute}`);
      a.classList.toggle('disabled', disabled);
      a.setAttribute('aria-disabled', String(disabled));
    }
    for (const [href, a] of navAnchors) {
      if (!seen.has(href)) {
        a.remove();
        navAnchors.delete(href);
      }
    }
  }

  let mountedKey: string | null = null;

  function rerender(): void {
    updateBanner(store.get().connection);
    const state = store.get();
    const route = currentRoute();
    // The effective screen identity must mirror currentScreen()'s own
    // routing exactly: leaderboard bypasses the sign-in gate entirely, and
    // everything else falls back to the connect screen when signed out.
    // Tracking this as part of the mount key means a status change like
    // connecting->connected doesn't look like a screen change (so
    // connect.ts's in-progress form isn't wiped), while an actual screen
    // change always is one.
    const key = route === '/leaderboard' ? route : state.you ? route : '__connect__';
    const isNewMount = key !== mountedKey;
    mountedKey = key;

    renderNav();
    currentScreen(route).render(content, isNewMount);
  }

  store.subscribe(rerender);
  window.addEventListener('hashchange', rerender);
  onReserveConfirmed(() => {
    if (currentRoute() !== '/log') location.hash = '#/log';
  });

  connect(`ws://${location.host}/ws`);
  rerender();
}

if (location.pathname === '/captain') {
  mountCaptainApp();
} else {
  initOperatorApp();
}
