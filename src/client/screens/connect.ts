import { send } from '../ws-client.ts';
import { store } from '../store.ts';

export function render(container: HTMLElement): void {
  const state = store.get();
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'screen connect-screen';

  const title = document.createElement('h1');
  title.textContent = 'PigletDupeDodger';
  wrapper.appendChild(title);

  const status = document.createElement('p');
  status.className = `status status-${state.connection}`;
  status.textContent = `Status: ${state.connection}`;
  wrapper.appendChild(status);

  if (state.data.config) {
    const club = document.createElement('p');
    club.textContent = `${state.data.config.clubName} (${state.data.config.clubCall})`;
    wrapper.appendChild(club);
  }

  const onlineCount = document.createElement('p');
  onlineCount.textContent = `${state.data.operators.size} operator(s) known`;
  wrapper.appendChild(onlineCount);

  const qr = document.createElement('img');
  qr.src = '/qr.svg';
  qr.alt = 'Scan to open this page on another device';
  qr.className = 'connect-qr';
  wrapper.appendChild(qr);

  const form = document.createElement('form');
  form.className = 'connect-form';

  const callInput = document.createElement('input');
  callInput.placeholder = 'Your callsign';
  callInput.required = true;
  callInput.autofocus = true;
  form.appendChild(callInput);

  const nameInput = document.createElement('input');
  nameInput.placeholder = 'Name (optional)';
  form.appendChild(nameInput);

  const ageLabel = document.createElement('label');
  const ageInput = document.createElement('input');
  ageInput.type = 'checkbox';
  ageLabel.appendChild(ageInput);
  ageLabel.append(' 18 or under');
  form.appendChild(ageLabel);

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Connect';
  form.appendChild(submit);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!callInput.value.trim()) return;
    send({
      type: 'hello',
      operatorCall: callInput.value,
      name: nameInput.value.trim() || undefined,
      age18OrUnder: ageInput.checked || undefined,
    });
  });

  wrapper.appendChild(form);
  container.appendChild(wrapper);
}
