import { DX_SECTION, SECTIONS } from '../shared/sections.ts';
import type { Qso } from '../shared/types.ts';

export function sectionCodeOptions(): string[] {
  return [...SECTIONS.map((s) => s.code), DX_SECTION];
}

export function workedCallOptions(qsos: Iterable<Qso>): string[] {
  const set = new Set<string>();
  for (const q of qsos) {
    if (!q.deleted) set.add(q.call);
  }
  return [...set].sort();
}

export function fillDatalist(datalist: HTMLDataListElement, options: readonly string[]): void {
  datalist.innerHTML = '';
  for (const opt of options) {
    const option = document.createElement('option');
    option.value = opt;
    datalist.appendChild(option);
  }
}
