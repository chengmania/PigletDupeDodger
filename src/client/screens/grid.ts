import { BANDS } from '../../shared/bands.ts';
import { reservationKey } from '../../shared/journal.ts';
import type { Mode } from '../../shared/types.ts';
import { store } from '../store.ts';
import { send } from '../ws-client.ts';

const MODES: Mode[] = ['PH', 'CW', 'DIG'];

export function render(container: HTMLElement): void {
  const state = store.get();
  const you = state.you?.call ?? null;
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'screen grid-screen';

  const title = document.createElement('h1');
  title.textContent = 'Band / Mode Reservations';
  wrapper.appendChild(title);

  const table = document.createElement('table');
  table.className = 'reservation-grid';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  headRow.appendChild(document.createElement('th'));
  for (const mode of MODES) {
    const th = document.createElement('th');
    th.textContent = mode;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const band of BANDS) {
    const row = document.createElement('tr');
    const label = document.createElement('th');
    label.textContent = band.label;
    row.appendChild(label);

    for (const mode of MODES) {
      const key = reservationKey('MAIN', band.id, mode);
      const reservation = state.data.reservations.get(key);
      row.appendChild(makeCell(reservation?.operatorCall ?? null, you, () => {
        if (reservation) return; // occupied, ignore click (handled via release button in cell)
        send({ type: 'reserve', band: band.id, mode, station: 'MAIN' });
      }, reservation && reservation.operatorCall === you
        ? () => send({ type: 'release', station: 'MAIN', band: band.id, mode })
        : undefined));
    }
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  wrapper.appendChild(table);

  // GOTA: a single singleton slot, any band/mode -- rendered as its own row.
  const gotaSection = document.createElement('div');
  gotaSection.className = 'gota-slot';
  const gotaTitle = document.createElement('h2');
  gotaTitle.textContent = 'GOTA (one signal at a time, Rule 4.1.1)';
  gotaSection.appendChild(gotaTitle);

  const gotaReservation = state.data.reservations.get('GOTA');
  const gotaControls = document.createElement('div');
  gotaControls.className = 'gota-controls';

  if (gotaReservation && gotaReservation.operatorCall === you) {
    const status = document.createElement('span');
    status.className = 'cell cell-yours';
    status.textContent = `You (${gotaReservation.band} ${gotaReservation.mode})`;
    gotaControls.appendChild(status);
    const releaseBtn = document.createElement('button');
    releaseBtn.textContent = 'Release GOTA';
    releaseBtn.addEventListener('click', () => send({ type: 'release', station: 'GOTA' }));
    gotaControls.appendChild(releaseBtn);
  } else if (gotaReservation) {
    const status = document.createElement('span');
    status.className = 'cell cell-taken';
    status.textContent = `${gotaReservation.operatorCall} (${gotaReservation.band} ${gotaReservation.mode})`;
    gotaControls.appendChild(status);
  } else {
    const bandSelect = document.createElement('select');
    for (const band of BANDS) {
      const opt = document.createElement('option');
      opt.value = band.id;
      opt.textContent = band.label;
      bandSelect.appendChild(opt);
    }
    const modeSelect = document.createElement('select');
    for (const mode of MODES) {
      const opt = document.createElement('option');
      opt.value = mode;
      opt.textContent = mode;
      modeSelect.appendChild(opt);
    }
    const claimBtn = document.createElement('button');
    claimBtn.textContent = 'Claim GOTA';
    claimBtn.addEventListener('click', () => {
      send({ type: 'reserve', band: bandSelect.value, mode: modeSelect.value as Mode, station: 'GOTA' });
    });
    gotaControls.append(bandSelect, modeSelect, claimBtn);
  }
  gotaSection.appendChild(gotaControls);
  wrapper.appendChild(gotaSection);

  container.appendChild(wrapper);
}

function makeCell(
  holder: string | null,
  you: string | null,
  onClaim: () => void,
  onRelease: (() => void) | undefined,
): HTMLElement {
  const td = document.createElement('td');
  if (!holder) {
    const btn = document.createElement('button');
    btn.className = 'cell cell-open';
    btn.textContent = 'Open';
    btn.addEventListener('click', onClaim);
    td.appendChild(btn);
  } else if (holder === you) {
    const btn = document.createElement('button');
    btn.className = 'cell cell-yours';
    btn.textContent = 'Yours';
    if (onRelease) btn.addEventListener('click', onRelease);
    td.appendChild(btn);
  } else {
    const span = document.createElement('span');
    span.className = 'cell cell-taken';
    span.textContent = holder;
    td.appendChild(span);
  }
  return td;
}
