import { BANDS } from '../../shared/bands.ts';
import { reservationKey } from '../../shared/journal.ts';
import type { Mode, Reservation } from '../../shared/types.ts';
import { store } from '../store.ts';
import { send } from '../ws-client.ts';

const MODES: Mode[] = ['PH', 'CW', 'DIG'];

export interface ReservationTableOpts {
  readOnly: boolean;
  onClaim?: (band: string, mode: Mode) => void;
  onRelease?: (band: string, mode: Mode) => void;
}

// Shared between the operator grid screen (readOnly:false, wired to
// reserve/release) and the Captain's Station read-only grid monitor
// (readOnly:true, no handlers) -- one table-building implementation so the
// two views can't silently drift.
export function buildReservationTable(
  reservations: ReadonlyMap<string, Reservation>,
  you: string | null,
  opts: ReservationTableOpts,
): HTMLTableElement {
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
      const reservation = reservations.get(key);
      const holder = reservation?.operatorCall ?? null;
      const onClaim = () => {
        if (reservation) return; // occupied, ignore click (handled via release button in cell)
        opts.onClaim?.(band.id, mode);
      };
      const onRelease =
        !opts.readOnly && reservation && reservation.operatorCall === you ? () => opts.onRelease?.(band.id, mode) : undefined;
      row.appendChild(makeCell(holder, opts.readOnly ? null : you, onClaim, onRelease, opts.readOnly));
    }
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  return table;
}

export function buildGotaSection(
  reservations: ReadonlyMap<string, Reservation>,
  you: string | null,
  opts: { readOnly: boolean; onClaim?: (band: string, mode: Mode) => void; onRelease?: () => void },
): HTMLElement {
  const gotaSection = document.createElement('div');
  gotaSection.className = 'gota-slot';
  const gotaTitle = document.createElement('h2');
  gotaTitle.textContent = 'GOTA (one signal at a time, Rule 4.1.1)';
  gotaSection.appendChild(gotaTitle);

  const gotaReservation = reservations.get('GOTA');
  const gotaControls = document.createElement('div');
  gotaControls.className = 'gota-controls';

  if (gotaReservation && gotaReservation.operatorCall === you) {
    const status = document.createElement('span');
    status.className = 'cell cell-yours';
    status.textContent = `You (${gotaReservation.band} ${gotaReservation.mode})`;
    gotaControls.appendChild(status);
    if (!opts.readOnly) {
      const releaseBtn = document.createElement('button');
      releaseBtn.textContent = 'Release GOTA';
      releaseBtn.addEventListener('click', () => opts.onRelease?.());
      gotaControls.appendChild(releaseBtn);
    }
  } else if (gotaReservation) {
    const status = document.createElement('span');
    status.className = 'cell cell-taken';
    status.textContent = `${gotaReservation.operatorCall} (${gotaReservation.band} ${gotaReservation.mode})`;
    gotaControls.appendChild(status);
  } else if (opts.readOnly) {
    const status = document.createElement('span');
    status.className = 'cell cell-open';
    status.textContent = 'Open';
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
      opts.onClaim?.(bandSelect.value, modeSelect.value as Mode);
    });
    gotaControls.append(bandSelect, modeSelect, claimBtn);
  }
  gotaSection.appendChild(gotaControls);
  return gotaSection;
}

// Grid has no focusable text inputs holding in-progress user typing, so
// unlike log.ts it's exempt from the isNewMount-gated rebuild pattern -- a
// full rebuild on every store update is safe and simplest here.
export function render(container: HTMLElement, _isNewMount: boolean): void {
  const state = store.get();
  const you = state.you?.call ?? null;
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'screen grid-screen';

  const title = document.createElement('h1');
  title.textContent = 'Band / Mode Reservations';
  wrapper.appendChild(title);

  wrapper.appendChild(
    buildReservationTable(state.data.reservations, you, {
      readOnly: false,
      onClaim: (band, mode) => send({ type: 'reserve', band, mode, station: 'MAIN' }),
      onRelease: (band, mode) => send({ type: 'release', station: 'MAIN', band, mode }),
    }),
  );

  wrapper.appendChild(
    buildGotaSection(state.data.reservations, you, {
      readOnly: false,
      onClaim: (band, mode) => send({ type: 'reserve', band, mode, station: 'GOTA' }),
      onRelease: () => send({ type: 'release', station: 'GOTA' }),
    }),
  );

  container.appendChild(wrapper);
}

function makeCell(
  holder: string | null,
  you: string | null,
  onClaim: () => void,
  onRelease: (() => void) | undefined,
  readOnly = false,
): HTMLElement {
  const td = document.createElement('td');
  if (!holder) {
    if (readOnly) {
      const span = document.createElement('span');
      span.className = 'cell cell-open';
      span.textContent = 'Open';
      td.appendChild(span);
    } else {
      const btn = document.createElement('button');
      btn.className = 'cell cell-open';
      btn.textContent = 'Open';
      btn.addEventListener('click', onClaim);
      td.appendChild(btn);
    }
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
