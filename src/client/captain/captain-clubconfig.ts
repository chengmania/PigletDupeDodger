import { SECTIONS } from '../../shared/sections.ts';
import type { ClubConfig } from '../../shared/types.ts';
import { fillDatalist } from '../autocomplete.ts';
import { store } from '../store.ts';
import { send } from '../ws-client.ts';

// Always editable -- unlike the old host-mode gating, reaching this screen
// at all already required a signed-in Captain session (conn.isAdmin, gated
// server-side on config:set regardless of what this form does client-side).
export function mountCaptainClubConfig(container: HTMLElement): () => void {
  container.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'screen captain-clubconfig-screen';

  const title = document.createElement('h1');
  title.textContent = 'Club Setup';
  root.appendChild(title);

  const config = store.get().data.config;

  const form = document.createElement('form');
  form.className = 'host-setup-form';

  const clubName = labeledInput(form, 'Club Name', config?.clubName ?? '');
  const clubCall = labeledInput(form, 'Club Call', config?.clubCall ?? '');
  const gotaCall = labeledInput(form, 'GOTA Call (optional)', config?.gotaCall ?? '');
  const entryClass = labeledInput(form, 'Entry Class (e.g. 3A)', config?.entryClass ?? '');
  const section = labeledInput(form, 'Section', config?.section ?? '');
  const sectionsDatalist = document.createElement('datalist');
  sectionsDatalist.id = 'captain-setup-sections-list';
  fillDatalist(
    sectionsDatalist,
    SECTIONS.map((s) => s.code),
  );
  section.setAttribute('list', sectionsDatalist.id);
  form.appendChild(sectionsDatalist);

  const powerMult = document.createElement('select');
  for (const [value, label] of [
    ['1', 'x1 (>100W)'],
    ['2', 'x2 (<=100W or QRP on generator/mains)'],
    ['5', 'x5 (QRP battery)'],
  ] as const) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    powerMult.appendChild(opt);
  }
  powerMult.value = String(config?.powerMult ?? 1);
  wrapLabeled(form, 'Power Multiplier', powerMult);

  const eventStartUtc = labeledInput(form, 'Event Start (UTC ISO)', config?.eventStartUtc ?? '');
  const eventEndUtc = labeledInput(form, 'Event End (UTC ISO)', config?.eventEndUtc ?? '');
  const location = labeledInput(form, 'Location (optional)', config?.location ?? '');
  const participantCount = labeledInput(form, 'Participant Count (optional)', config?.participantCount?.toString() ?? '');

  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.textContent = 'Save Config';
  form.appendChild(saveBtn);

  const savedNotice = document.createElement('span');
  savedNotice.className = 'captain-save-notice hidden';
  savedNotice.textContent = 'Saved.';
  form.appendChild(savedNotice);

  let noticeTimer: ReturnType<typeof setTimeout> | null = null;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const newConfig: ClubConfig = {
      clubName: clubName.value.trim(),
      clubCall: clubCall.value.trim().toUpperCase(),
      gotaCall: gotaCall.value.trim().toUpperCase() || undefined,
      entryClass: entryClass.value.trim().toUpperCase(),
      section: section.value.trim().toUpperCase(),
      powerMult: Number(powerMult.value) as 1 | 2 | 5,
      eventStartUtc: eventStartUtc.value.trim(),
      eventEndUtc: eventEndUtc.value.trim(),
      location: location.value.trim() || undefined,
      participantCount: participantCount.value.trim() ? Number(participantCount.value.trim()) : undefined,
    };
    send({ type: 'config:set', config: newConfig });
    savedNotice.classList.remove('hidden');
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => savedNotice.classList.add('hidden'), 2000);
  });

  root.appendChild(form);
  container.appendChild(root);

  return () => {
    if (noticeTimer) clearTimeout(noticeTimer);
  };
}

function labeledInput(form: HTMLElement, label: string, value: string): HTMLInputElement {
  const input = document.createElement('input');
  input.value = value;
  wrapLabeled(form, label, input);
  return input;
}

function wrapLabeled(form: HTMLElement, label: string, control: HTMLElement): void {
  const wrapper = document.createElement('label');
  wrapper.className = 'field-label';
  const span = document.createElement('span');
  span.textContent = label;
  wrapper.append(span, control);
  form.appendChild(wrapper);
}
