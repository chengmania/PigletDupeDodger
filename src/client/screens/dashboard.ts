import { BANDS } from '../../shared/bands.ts';
import { scoreLog } from '../../shared/scoring.ts';
import type { Mode } from '../../shared/types.ts';
import { sortNewestFirst, toQsoRow } from '../qso-list-model.ts';
import { mountSectionMap, type SectionMapHandle } from '../section-map.ts';
import { store } from '../store.ts';
import { statTile } from '../ui/stat-tile.ts';

const MODES: Mode[] = ['PH', 'CW', 'DIG'];

interface Els {
  totals: HTMLElement;
  warning: HTMLElement;
  matrixBody: HTMLElement;
  opList: HTMLElement;
  feedBody: HTMLElement;
  sectionMap: SectionMapHandle;
}

let els: Els | null = null;
// Tracks whether the currently-built shell assumed a config was present --
// lets a live config:set mid-session (no route change, so isNewMount stays
// false) still trigger the one-time shell rebuild it needs.
let builtForConfig = false;

export function render(container: HTMLElement, isNewMount: boolean): void {
  const hasConfig = !!store.get().data.config;

  if (isNewMount || !els || builtForConfig !== hasConfig) {
    build(container, hasConfig);
  }
  if (hasConfig) updateDynamic();
}

function build(container: HTMLElement, hasConfig: boolean): void {
  container.innerHTML = '';
  els = null;
  builtForConfig = hasConfig;

  const root = document.createElement('div');
  root.className = 'screen dashboard-screen';

  const title = document.createElement('h1');
  title.textContent = 'Dashboard';
  root.appendChild(title);

  if (!hasConfig) {
    const msg = document.createElement('p');
    msg.textContent = 'Event not configured yet -- ask your Captain to set up the club config.';
    root.appendChild(msg);
    container.appendChild(root);
    return;
  }

  const totals = document.createElement('div');
  totals.className = 'dashboard-totals';
  root.appendChild(totals);

  const warning = document.createElement('p');
  warning.className = 'dashboard-warning hidden';
  root.appendChild(warning);

  const matrixTitle = document.createElement('h2');
  matrixTitle.textContent = 'Band / Mode Matrix';
  root.appendChild(matrixTitle);

  const table = document.createElement('table');
  table.className = 'dashboard-matrix';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  headRow.appendChild(document.createElement('th'));
  for (const mode of MODES) {
    const th = document.createElement('th');
    th.textContent = mode;
    headRow.appendChild(th);
  }
  const totalTh = document.createElement('th');
  totalTh.textContent = 'Total';
  headRow.appendChild(totalTh);
  thead.appendChild(headRow);
  table.appendChild(thead);
  const matrixBody = document.createElement('tbody');
  table.appendChild(matrixBody);
  root.appendChild(table);

  const opTitle = document.createElement('h2');
  opTitle.textContent = 'Per-Operator';
  root.appendChild(opTitle);
  const opList = document.createElement('ul');
  root.appendChild(opList);

  const feedTitle = document.createElement('h2');
  feedTitle.textContent = 'Live QSO Feed';
  root.appendChild(feedTitle);
  const feedTable = document.createElement('table');
  feedTable.className = 'qso-table';
  const feedThead = document.createElement('thead');
  feedThead.innerHTML =
    '<tr><th>Call</th><th>UTC Time/Date</th><th>Band</th><th>Mode</th><th>Class</th><th>Section</th><th>Operator</th></tr>';
  feedTable.appendChild(feedThead);
  const feedBody = document.createElement('tbody');
  feedTable.appendChild(feedBody);
  root.appendChild(feedTable);

  const mapTitle = document.createElement('h2');
  mapTitle.textContent = 'Section Map';
  root.appendChild(mapTitle);
  const mapContainer = document.createElement('div');
  root.appendChild(mapContainer);
  const sectionMap = mountSectionMap(mapContainer, { alwaysExpanded: true });

  container.appendChild(root);

  els = { totals, warning, matrixBody, opList, feedBody, sectionMap };
}

function updateDynamic(): void {
  if (!els) return;
  const state = store.get();
  const config = state.data.config;
  if (!config) return;

  const qsos = [...state.data.qsos.values()];
  const operators = [...state.data.operators.values()];
  const score = scoreLog(qsos, config, state.data.bonuses, operators);

  els.totals.innerHTML = '';
  els.totals.append(
    statTile('QSO Points', String(score.qsoPoints)),
    statTile('Multiplier', `x${score.multiplier}`),
    statTile('Multiplied Points', String(score.multipliedPoints)),
    statTile('Bonus Points', String(score.bonusPoints)),
    statTile('GOTA Bonus', String(score.gotaBonus)),
    statTile('Youth Bonus', String(score.youthBonus)),
    statTile('Total', String(score.total)),
  );

  if (score.ineligibleClaims.length > 0) {
    els.warning.textContent = `Claimed but not counted (class-ineligible or requirements unmet): ${score.ineligibleClaims.join(', ')}`;
    els.warning.classList.remove('hidden');
  } else {
    els.warning.classList.add('hidden');
  }

  els.matrixBody.innerHTML = '';
  for (const band of BANDS) {
    const row = document.createElement('tr');
    const label = document.createElement('th');
    label.textContent = band.label;
    row.appendChild(label);
    let rowTotal = 0;
    for (const mode of MODES) {
      const count = qsos.filter((q) => !q.deleted && q.band === band.id && q.mode === mode).length;
      rowTotal += count;
      const td = document.createElement('td');
      td.textContent = String(count);
      row.appendChild(td);
    }
    const totalTd = document.createElement('td');
    totalTd.textContent = String(rowTotal);
    row.appendChild(totalTd);
    els.matrixBody.appendChild(row);
  }

  els.opList.innerHTML = '';
  for (const [call, stats] of Object.entries(score.perOperator).sort((a, b) => b[1].count - a[1].count)) {
    const li = document.createElement('li');
    li.textContent = `${call}: ${stats.count} QSOs, ${stats.qsoPoints} pts`;
    els.opList.appendChild(li);
  }

  // All-operators live QSO feed (CO-7) -- deleted rows are filtered out
  // here, unlike the admin firehose which intentionally shows them.
  els.feedBody.innerHTML = '';
  const rows = sortNewestFirst(qsos.filter((q) => !q.deleted)).map((q) => toQsoRow(q, null));
  for (const row of rows) {
    const tr = document.createElement('tr');
    const callCell = document.createElement('td');
    callCell.textContent = row.call;
    if (row.isDupe) {
      const badge = document.createElement('span');
      badge.className = 'badge badge-dupe';
      badge.textContent = 'DUPE';
      callCell.appendChild(badge);
    }
    tr.appendChild(callCell);
    for (const value of [row.utc, row.band, row.mode, row.exchClass, row.exchSection, row.operatorCall]) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.appendChild(td);
    }
    els.feedBody.appendChild(tr);
  }

  els.sectionMap.update();
}
