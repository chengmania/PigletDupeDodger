import { DX_SECTION, SECTIONS } from '../shared/sections.ts';

export function sectionCodeOptions(): string[] {
  return [...SECTIONS.map((s) => s.code), DX_SECTION];
}

export function fillDatalist(datalist: HTMLDataListElement, options: readonly string[]): void {
  datalist.innerHTML = '';
  for (const opt of options) {
    const option = document.createElement('option');
    option.value = opt;
    datalist.appendChild(option);
  }
}
