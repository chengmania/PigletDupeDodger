export function statTile(label: string, value: string): HTMLElement {
  const tile = document.createElement('div');
  tile.className = 'stat-tile';
  const v = document.createElement('div');
  v.className = 'stat-value';
  v.textContent = value;
  const l = document.createElement('div');
  l.className = 'stat-label';
  l.textContent = label;
  tile.append(v, l);
  return tile;
}
