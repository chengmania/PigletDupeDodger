import { postJson } from './captain-api.ts';

export function renderCaptainSetup(container: HTMLElement, onComplete: () => void): void {
  container.innerHTML = '';

  const root = document.createElement('div');
  root.className = 'screen captain-auth-screen';

  const title = document.createElement('h1');
  title.textContent = "Captain's Station -- First-Time Setup";
  root.appendChild(title);

  const intro = document.createElement('p');
  intro.textContent = 'No admin has been configured yet on this flash drive. Set one up now.';
  root.appendChild(intro);

  const form = document.createElement('form');
  form.className = 'captain-form';

  const callInput = document.createElement('input');
  callInput.placeholder = 'Captain callsign';
  callInput.required = true;
  form.appendChild(callInput);

  const nameInput = document.createElement('input');
  nameInput.placeholder = 'Captain name';
  form.appendChild(nameInput);

  const passInput = document.createElement('input');
  passInput.type = 'password';
  passInput.placeholder = 'Password';
  passInput.required = true;
  form.appendChild(passInput);

  const confirmInput = document.createElement('input');
  confirmInput.type = 'password';
  confirmInput.placeholder = 'Confirm password';
  confirmInput.required = true;
  form.appendChild(confirmInput);

  const error = document.createElement('p');
  error.className = 'dupe-status dupe-blocked hidden';
  form.appendChild(error);

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Create Admin Account';
  form.appendChild(submit);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.classList.add('hidden');

    if (passInput.value !== confirmInput.value) {
      error.textContent = 'Passwords do not match.';
      error.classList.remove('hidden');
      return;
    }
    if (!callInput.value.trim() || !passInput.value) {
      error.textContent = 'Callsign and password are required.';
      error.classList.remove('hidden');
      return;
    }

    const result = await postJson<{ recoveryCode: string }>('/api/admin/setup', {
      captainCall: callInput.value.trim(),
      captainName: nameInput.value.trim(),
      password: passInput.value,
    });

    if (!result.ok || !result.body) {
      error.textContent = 'Setup failed -- an admin may already be configured.';
      error.classList.remove('hidden');
      return;
    }

    renderRecoveryCodeReveal(container, result.body.recoveryCode, onComplete);
  });

  root.appendChild(form);
  container.appendChild(root);
}

function renderRecoveryCodeReveal(container: HTMLElement, recoveryCode: string, onComplete: () => void): void {
  container.innerHTML = '';

  const root = document.createElement('div');
  root.className = 'screen captain-auth-screen';

  const title = document.createElement('h1');
  title.textContent = 'Save Your Recovery Code';
  root.appendChild(title);

  const warning = document.createElement('p');
  warning.textContent = 'This code is shown only once. Write it on the flash drive label -- it is the only way to reset your password if you forget it.';
  root.appendChild(warning);

  const codeDisplay = document.createElement('div');
  codeDisplay.className = 'captain-recovery-code';
  codeDisplay.textContent = recoveryCode;
  root.appendChild(codeDisplay);

  const continueBtn = document.createElement('button');
  continueBtn.type = 'button';
  continueBtn.textContent = "I've written it down -- Continue";
  continueBtn.addEventListener('click', onComplete);
  root.appendChild(continueBtn);

  container.appendChild(root);
}
