import type { Mode, StationKind } from '../../shared/types.ts';
import type { ScoreBreakdown } from '../../shared/scoring.ts';

interface LeaderboardResponse {
  clubName: string | null;
  clubCall: string | null;
  score: ScoreBreakdown | null;
  recentQsos: Array<{ ts: string; call: string; band: string; mode: Mode; station: StationKind; operatorCall: string }>;
  serverNowUtc: string;
}

const POLL_INTERVAL_MS = 4_000;
let pollTimer: ReturnType<typeof setInterval> | null = null;

export function render(container: HTMLElement): void {
  if (container.dataset.screen === 'leaderboard') return; // already mounted, polling loop keeps it fresh
  container.innerHTML = '';
  container.dataset.screen = 'leaderboard';

  const root = document.createElement('div');
  root.className = 'screen leaderboard-screen';
  root.innerHTML = '<h1>Loading...</h1>';
  container.appendChild(root);

  if (pollTimer) clearInterval(pollTimer);
  const poll = () => fetchAndRender(root);
  poll();
  pollTimer = setInterval(poll, POLL_INTERVAL_MS);
}

async function fetchAndRender(root: HTMLElement): Promise<void> {
  let data: LeaderboardResponse;
  try {
    const res = await fetch('/leaderboard.json');
    data = (await res.json()) as LeaderboardResponse;
  } catch {
    return;
  }

  root.innerHTML = '';

  const title = document.createElement('h1');
  title.textContent = data.clubName ? `${data.clubName} (${data.clubCall})` : 'PigletDupeDodger';
  root.appendChild(title);

  if (!data.score) {
    const msg = document.createElement('p');
    msg.textContent = 'Event not configured yet.';
    root.appendChild(msg);
    return;
  }

  const totalTile = document.createElement('div');
  totalTile.className = 'leaderboard-total';
  totalTile.textContent = String(data.score.total);
  root.appendChild(totalTile);
  const totalLabel = document.createElement('div');
  totalLabel.className = 'leaderboard-total-label';
  totalLabel.textContent = 'TOTAL SCORE';
  root.appendChild(totalLabel);

  const stats = document.createElement('div');
  stats.className = 'leaderboard-stats';
  stats.innerHTML = `
    <div><b>${data.score.qsoPoints}</b> QSO pts</div>
    <div><b>x${data.score.multiplier}</b> mult</div>
    <div><b>${data.score.bonusPoints}</b> bonus</div>
    <div><b>${data.score.gotaBonus}</b> GOTA</div>
  `;
  root.appendChild(stats);

  const tickerTitle = document.createElement('h2');
  tickerTitle.textContent = 'Latest QSOs';
  root.appendChild(tickerTitle);

  const ticker = document.createElement('ul');
  ticker.className = 'ticker leaderboard-ticker';
  for (const q of data.recentQsos) {
    const li = document.createElement('li');
    li.textContent = `${q.call} -- ${q.band}/${q.mode} (${q.station}) by ${q.operatorCall}`;
    ticker.appendChild(li);
  }
  root.appendChild(ticker);
}
