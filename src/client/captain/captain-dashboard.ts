import { mountCaptainBonus } from './captain-bonus.ts';
import { mountCaptainClubConfig } from './captain-clubconfig.ts';
import { mountCaptainExports } from './captain-exports.ts';
import { mountCaptainFirehose } from './captain-firehose.ts';
import { mountCaptainGrid } from './captain-grid.ts';
import { mountCaptainScore } from './captain-score.ts';
import { mountCaptainSectionMap } from './captain-section-map.ts';
import { postJson } from './captain-api.ts';

type SectionId = 'score' | 'grid' | 'firehose' | 'map' | 'bonus' | 'clubconfig' | 'exports';

interface Section {
  id: SectionId;
  label: string;
  mount: (container: HTMLElement) => (() => void) | void;
}

const SECTIONS: Section[] = [
  { id: 'score', label: 'Score', mount: mountCaptainScore },
  { id: 'grid', label: 'Grid Monitor', mount: mountCaptainGrid },
  { id: 'firehose', label: 'Live QSOs', mount: mountCaptainFirehose },
  { id: 'map', label: 'Section Map', mount: mountCaptainSectionMap },
  { id: 'bonus', label: 'Bonus Checklist', mount: mountCaptainBonus },
  { id: 'clubconfig', label: 'Club Setup', mount: mountCaptainClubConfig },
  { id: 'exports', label: 'Exports', mount: mountCaptainExports },
];

// /captain is a standalone page load, not part of the operator hash-router
// -- section switching just swaps which mount function owns the content div.
export function mountCaptainDashboard(root: HTMLElement): void {
  root.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'captain-dashboard';

  const topBar = document.createElement('div');
  topBar.className = 'captain-topbar';
  const title = document.createElement('h1');
  title.textContent = "Captain's Station";
  topBar.appendChild(title);

  const logoutBtn = document.createElement('button');
  logoutBtn.type = 'button';
  logoutBtn.className = 'captain-logout';
  logoutBtn.textContent = 'Log Out';
  logoutBtn.addEventListener('click', async () => {
    await postJson('/api/admin/logout', {});
    location.reload();
  });
  topBar.appendChild(logoutBtn);
  wrapper.appendChild(topBar);

  const tabs = document.createElement('nav');
  tabs.className = 'captain-tabs';
  wrapper.appendChild(tabs);

  const content = document.createElement('div');
  content.className = 'captain-section-content';
  wrapper.appendChild(content);

  root.appendChild(wrapper);

  const tabButtons = new Map<SectionId, HTMLButtonElement>();
  let activeCleanup: (() => void) | void;

  function showSection(id: SectionId): void {
    activeCleanup?.();
    for (const [sectionId, btn] of tabButtons) btn.classList.toggle('active', sectionId === id);
    content.innerHTML = '';
    const section = SECTIONS.find((s) => s.id === id)!;
    activeCleanup = section.mount(content);
  }

  for (const section of SECTIONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = section.label;
    btn.addEventListener('click', () => showSection(section.id));
    tabs.appendChild(btn);
    tabButtons.set(section.id, btn);
  }

  showSection(SECTIONS[0]!.id);
}
