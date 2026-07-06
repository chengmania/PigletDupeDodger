import { BANDS } from '../../shared/bands.ts';
import { bonusChecklistRows } from '../../shared/bonuses.ts';
import { scoreLog } from '../../shared/scoring.ts';
import type { BonusClaim, ClubConfig, Mode, Qso } from '../../shared/types.ts';
import { sortNewestFirst, toQsoRow } from '../qso-list-model.ts';
import { store } from '../store.ts';
import { statTile } from '../ui/stat-tile.ts';

const MODES: Mode[] = ['PH', 'CW', 'DIG'];

export function render(container: HTMLElement, _isNewMount: boolean): void {
  container.innerHTML = '';

  const root = document.createElement('div');
  root.className = 'screen dashboard-screen';

  const title = document.createElement('h1');
  title.textContent = 'Dashboard';
  root.appendChild(title);

  const state = store.get();
  const config = state.data.config;

  if (!config) {
    const msg = document.createElement('p');
    msg.textContent = 'Event not configured yet -- ask your Captain to set up the club config.';
    root.appendChild(msg);
    container.appendChild(root);
    return;
  }

  const qsos = [...state.data.qsos.values()];
  const operators = [...state.data.operators.values()];
  const score = scoreLog(qsos, config, state.data.bonuses, operators);

  const totals = document.createElement('div');
  totals.className = 'dashboard-totals';
  totals.append(
    statTile('QSO Points', String(score.qsoPoints)),
    statTile('Multiplier', `x${score.multiplier}`),
    statTile('Multiplied Points', String(score.multipliedPoints)),
    statTile('Bonus Points', String(score.bonusPoints)),
    statTile('GOTA Bonus', String(score.gotaBonus)),
    statTile('Youth Bonus', String(score.youthBonus)),
    statTile('Total', String(score.total)),
  );
  root.appendChild(totals);

  if (score.ineligibleClaims.length > 0) {
    const warn = document.createElement('p');
    warn.className = 'dashboard-warning';
    warn.textContent = `Claimed but not counted (class-ineligible or requirements unmet): ${score.ineligibleClaims.join(', ')}`;
    root.appendChild(warn);
  }

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

  const tbody = document.createElement('tbody');
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
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  root.appendChild(table);

  const opTitle = document.createElement('h2');
  opTitle.textContent = 'Per-Operator';
  root.appendChild(opTitle);
  const opList = document.createElement('ul');
  for (const [call, stats] of Object.entries(score.perOperator).sort((a, b) => b[1].count - a[1].count)) {
    const li = document.createElement('li');
    li.textContent = `${call}: ${stats.count} QSOs, ${stats.qsoPoints} pts`;
    opList.appendChild(li);
  }
  root.appendChild(opList);

  root.appendChild(buildLiveFeed(qsos));
  root.appendChild(buildReadOnlyBonusChecklist(config, state.data.bonuses, qsos));

  container.appendChild(root);
}

// All-operators live QSO feed (CO-7) -- deleted rows are filtered out here,
// unlike the admin firehose (Milestone 8) which intentionally shows them.
function buildLiveFeed(qsos: readonly Qso[]): HTMLElement {
  const section = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = 'Live QSO Feed';
  section.appendChild(title);

  const rows = sortNewestFirst(qsos.filter((q) => !q.deleted)).map((q) => toQsoRow(q, null));

  const table = document.createElement('table');
  table.className = 'qso-table';
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>Call</th><th>UTC Time/Date</th><th>Band</th><th>Mode</th><th>Class</th><th>Section</th><th>Operator</th></tr>';
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
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
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  section.appendChild(table);
  return section;
}

// Read-only mirror of the Captain's bonus checklist -- all inputs disabled,
// no send() calls, since claiming/adjusting bonuses is admin-only (CO-5).
function buildReadOnlyBonusChecklist(
  config: Pick<ClubConfig, 'entryClass'>,
  bonuses: ReadonlyMap<string, BonusClaim>,
  qsos: readonly Qso[],
): HTMLElement {
  const section = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = 'Bonus Checklist';
  section.appendChild(title);

  const body = document.createElement('div');
  body.className = 'bonus-checklist';
  section.appendChild(body);

  const rows = bonusChecklistRows(config, bonuses, qsos);
  for (const { def, claim, coachedCount } of rows) {
    const row = document.createElement('div');
    row.className = 'bonus-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !!claim?.claimed;
    checkbox.disabled = true;

    const label = document.createElement('label');
    label.append(checkbox, ` ${def.name} (${def.points} pt${def.points === 1 ? '' : 's'}, ${def.ruleRef})`);
    row.appendChild(label);

    if (def.scaling === 'per-transmitter' || def.scaling === 'per-message') {
      const countInput = document.createElement('input');
      countInput.type = 'number';
      countInput.disabled = true;
      countInput.value = String((def.scaling === 'per-transmitter' ? claim?.transmitterCount : claim?.messageCount) ?? 0);
      row.appendChild(countInput);
    }

    if (def.requiresGotaCoachCount !== undefined) {
      const note = document.createElement('span');
      note.className = 'bonus-note';
      note.textContent = ` requires >=${def.requiresGotaCoachCount} coached contacts (currently ${coachedCount})`;
      row.appendChild(note);
    }

    body.appendChild(row);
  }

  return section;
}
