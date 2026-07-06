import { mountSectionMap } from '../section-map.ts';
import { store } from '../store.ts';

// Always-expanded reuse of the operator log screen's section map -- no new
// rendering logic, just wired to redraw on every store update the way a
// live admin dashboard panel should.
export function mountCaptainSectionMap(container: HTMLElement): () => void {
  container.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'screen captain-section-map-screen';

  const title = document.createElement('h1');
  title.textContent = 'Section Map';
  root.appendChild(title);

  const mapContainer = document.createElement('div');
  root.appendChild(mapContainer);
  container.appendChild(root);

  const handle = mountSectionMap(mapContainer, { alwaysExpanded: true });
  return store.subscribe(() => handle.update());
}
