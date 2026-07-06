import { currentTheme, toggleTheme } from './theme.ts';

export function mountHeader(root: HTMLElement): void {
  const header = document.createElement('header');
  header.className = 'app-header';

  const title = document.createElement('span');
  title.className = 'app-header-title';
  title.textContent = 'PigletDupeDodger';
  header.appendChild(title);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'theme-toggle';
  toggle.setAttribute('aria-label', 'Toggle light/dark theme');

  function updateIcon(): void {
    toggle.textContent = currentTheme() === 'light' ? '\u{1F319}' : '\u{2600}\u{FE0F}'; // moon : sun
  }
  updateIcon();

  toggle.addEventListener('click', () => {
    toggleTheme();
    updateIcon();
  });
  header.appendChild(toggle);

  root.appendChild(header);
}
