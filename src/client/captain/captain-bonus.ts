import { bonusChecklistRows } from '../../shared/bonuses.ts';
import type { BonusClaim } from '../../shared/types.ts';
import { store } from '../store.ts';
import { send } from '../ws-client.ts';

// Always editable -- reaching /captain already required a signed-in
// Captain session; config:set/bonus:set are independently re-checked
// server-side against conn.isAdmin regardless of what this UI shows.
export function mountCaptainBonus(container: HTMLElement): () => void {
  container.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'screen captain-bonus-screen';

  const title = document.createElement('h1');
  title.textContent = 'Bonus Checklist';
  root.appendChild(title);

  const body = document.createElement('div');
  body.className = 'bonus-checklist';
  root.appendChild(body);
  container.appendChild(root);

  let lastSnapshot = '';

  function refresh(): void {
    const state = store.get();
    const config = state.data.config;
    const snapshot = JSON.stringify([...state.data.bonuses.entries()]) + '|' + (config?.entryClass ?? '');
    if (snapshot === lastSnapshot) return;
    lastSnapshot = snapshot;

    body.innerHTML = '';
    if (!config) {
      const msg = document.createElement('p');
      msg.textContent = 'Set the entry class in Club Setup before claiming bonuses.';
      body.appendChild(msg);
      return;
    }

    const rows = bonusChecklistRows(config, state.data.bonuses, [...state.data.qsos.values()]);
    for (const { def, claim, coachedCount } of rows) {
      const row = document.createElement('div');
      row.className = 'bonus-row';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = !!claim?.claimed;
      checkbox.addEventListener('change', () => {
        const newClaim: BonusClaim = { ...claim, claimed: checkbox.checked };
        send({ type: 'bonus:set', bonusId: def.id, claim: newClaim });
      });

      const label = document.createElement('label');
      label.append(checkbox, ` ${def.name} (${def.points} pt${def.points === 1 ? '' : 's'}, ${def.ruleRef})`);
      row.appendChild(label);

      if (def.scaling === 'per-transmitter' || def.scaling === 'per-message') {
        const countInput = document.createElement('input');
        countInput.type = 'number';
        countInput.min = '0';
        countInput.value = String((def.scaling === 'per-transmitter' ? claim?.transmitterCount : claim?.messageCount) ?? 0);
        countInput.addEventListener('change', () => {
          const count = Number(countInput.value) || 0;
          const newClaim: BonusClaim = {
            ...claim,
            claimed: !!claim?.claimed,
            ...(def.scaling === 'per-transmitter' ? { transmitterCount: count } : { messageCount: count }),
          };
          send({ type: 'bonus:set', bonusId: def.id, claim: newClaim });
        });
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
  }

  refresh();
  return store.subscribe(refresh);
}
