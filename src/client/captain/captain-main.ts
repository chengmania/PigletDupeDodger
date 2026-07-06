import { getJson, postJson } from './captain-api.ts';
import { renderCaptainLogin } from './captain-login.ts';
import { renderCaptainSetup } from './captain-setup.ts';

interface StatusResponse {
  configured: boolean;
  loggedIn: boolean;
}

export async function mountCaptainApp(): Promise<void> {
  const appRoot = document.getElementById('app')!;
  appRoot.innerHTML = '';
  const content = document.createElement('div');
  content.className = 'app-content';
  appRoot.appendChild(content);

  async function refresh(): Promise<void> {
    const status = await getJson<StatusResponse>('/api/admin/status');
    if (!status.body?.configured) {
      renderCaptainSetup(content, refresh);
    } else if (!status.body.loggedIn) {
      renderCaptainLogin(content, refresh);
    } else {
      renderDashboardPlaceholder(content);
    }
  }

  await refresh();
}

// Placeholder until the full admin dashboard (club setup, grid monitor,
// live firehose, section map, exports, bonus checklist, score) lands.
function renderDashboardPlaceholder(container: HTMLElement): void {
  container.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'screen';

  const title = document.createElement('h1');
  title.textContent = "Captain's Station";
  root.appendChild(title);

  const msg = document.createElement('p');
  msg.textContent = "You're logged in.";
  root.appendChild(msg);

  const logoutBtn = document.createElement('button');
  logoutBtn.type = 'button';
  logoutBtn.textContent = 'Log Out';
  logoutBtn.addEventListener('click', async () => {
    await postJson('/api/admin/logout', {});
    location.reload();
  });
  root.appendChild(logoutBtn);

  container.appendChild(root);
}
