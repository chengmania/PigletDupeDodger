import { postJson } from './captain-api.ts';

export function renderCaptainRecovery(container: HTMLElement, onDone: () => void): void {
  renderCodeStep(container, onDone);
}

function renderCodeStep(container: HTMLElement, onDone: () => void): void {
  container.innerHTML = '';

  const root = document.createElement('div');
  root.className = 'screen captain-auth-screen';

  const title = document.createElement('h1');
  title.textContent = 'Forgot Password';
  root.appendChild(title);

  const intro = document.createElement('p');
  intro.textContent = 'Enter the recovery code that was shown when the admin account was first set up.';
  root.appendChild(intro);

  const form = document.createElement('form');
  form.className = 'captain-form';

  const codeInput = document.createElement('input');
  codeInput.placeholder = 'Recovery code';
  codeInput.required = true;
  form.appendChild(codeInput);

  const error = document.createElement('p');
  error.className = 'dupe-status dupe-blocked hidden';
  form.appendChild(error);

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Verify Code';
  form.appendChild(submit);

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.textContent = 'Back to Login';
  backBtn.className = 'captain-link-btn';
  backBtn.addEventListener('click', onDone);
  form.appendChild(backBtn);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.classList.add('hidden');
    const result = await postJson<{ valid: boolean }>('/api/admin/recovery/verify', { recoveryCode: codeInput.value.trim() });
    if (!result.body?.valid) {
      error.textContent = 'Invalid recovery code.';
      error.classList.remove('hidden');
      return;
    }
    renderNewPasswordStep(container, codeInput.value.trim(), onDone);
  });

  root.appendChild(form);
  container.appendChild(root);
}

function renderNewPasswordStep(container: HTMLElement, recoveryCode: string, onDone: () => void): void {
  container.innerHTML = '';

  const root = document.createElement('div');
  root.className = 'screen captain-auth-screen';

  const title = document.createElement('h1');
  title.textContent = 'Set a New Password';
  root.appendChild(title);

  const form = document.createElement('form');
  form.className = 'captain-form';

  const passInput = document.createElement('input');
  passInput.type = 'password';
  passInput.placeholder = 'New password';
  passInput.required = true;
  form.appendChild(passInput);

  const confirmInput = document.createElement('input');
  confirmInput.type = 'password';
  confirmInput.placeholder = 'Confirm new password';
  confirmInput.required = true;
  form.appendChild(confirmInput);

  const error = document.createElement('p');
  error.className = 'dupe-status dupe-blocked hidden';
  form.appendChild(error);

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Reset Password';
  form.appendChild(submit);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.classList.add('hidden');
    if (passInput.value !== confirmInput.value) {
      error.textContent = 'Passwords do not match.';
      error.classList.remove('hidden');
      return;
    }
    const result = await postJson<{ recoveryCode: string }>('/api/admin/recovery/reset', {
      recoveryCode,
      newPassword: passInput.value,
    });
    if (!result.ok || !result.body) {
      error.textContent = 'Reset failed -- the recovery code may have already been used.';
      error.classList.remove('hidden');
      return;
    }
    renderNewRecoveryCode(container, result.body.recoveryCode, onDone);
  });

  root.appendChild(form);
  container.appendChild(root);
}

function renderNewRecoveryCode(container: HTMLElement, recoveryCode: string, onDone: () => void): void {
  container.innerHTML = '';

  const root = document.createElement('div');
  root.className = 'screen captain-auth-screen';

  const title = document.createElement('h1');
  title.textContent = 'Password Reset -- New Recovery Code';
  root.appendChild(title);

  const warning = document.createElement('p');
  warning.textContent = 'Your old recovery code no longer works. Write this new one on the flash drive label.';
  root.appendChild(warning);

  const codeDisplay = document.createElement('div');
  codeDisplay.className = 'captain-recovery-code';
  codeDisplay.textContent = recoveryCode;
  root.appendChild(codeDisplay);

  const continueBtn = document.createElement('button');
  continueBtn.type = 'button';
  continueBtn.textContent = "I've written it down -- Back to Login";
  continueBtn.addEventListener('click', onDone);
  root.appendChild(continueBtn);

  container.appendChild(root);
}
