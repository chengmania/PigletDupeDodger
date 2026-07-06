import { postJson } from './captain-api.ts';
import { renderCaptainRecovery } from './captain-recovery.ts';

export function renderCaptainLogin(container: HTMLElement, onSuccess: () => void): void {
  container.innerHTML = '';

  const root = document.createElement('div');
  root.className = 'screen captain-auth-screen';

  const title = document.createElement('h1');
  title.textContent = "Captain's Station -- Login";
  root.appendChild(title);

  const form = document.createElement('form');
  form.className = 'captain-form';

  const callInput = document.createElement('input');
  callInput.placeholder = 'Captain callsign';
  callInput.required = true;
  callInput.autofocus = true;
  form.appendChild(callInput);

  const passInput = document.createElement('input');
  passInput.type = 'password';
  passInput.placeholder = 'Password';
  passInput.required = true;
  form.appendChild(passInput);

  const error = document.createElement('p');
  error.className = 'dupe-status dupe-blocked hidden';
  form.appendChild(error);

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Log In';
  form.appendChild(submit);

  const forgotBtn = document.createElement('button');
  forgotBtn.type = 'button';
  forgotBtn.textContent = 'Forgot password?';
  forgotBtn.className = 'captain-link-btn';
  forgotBtn.addEventListener('click', () => {
    renderCaptainRecovery(container, () => renderCaptainLogin(container, onSuccess));
  });
  form.appendChild(forgotBtn);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.classList.add('hidden');
    const result = await postJson('/api/admin/login', { captainCall: callInput.value.trim(), password: passInput.value });
    if (!result.ok) {
      error.textContent = 'Invalid callsign or password.';
      error.classList.remove('hidden');
      return;
    }
    onSuccess();
  });

  root.appendChild(form);
  container.appendChild(root);
}
