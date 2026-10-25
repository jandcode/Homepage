import { portalAuth } from './api.js';

const form = document.querySelector('#login-form');
const errorBox = document.querySelector('#login-error');
const params = new URLSearchParams(location.search);
const next = params.get('next') || '/portal';

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.textContent = '';
  const email = new FormData(form).get('email');
  try {
    await portalAuth('magic-link', { method: 'POST', body: { email } });
    errorBox.textContent = '';
    document.querySelector('#login-success').hidden = false;
    form.hidden = true;
  } catch (error) {
    errorBox.textContent = error.message;
  }
});

const previewBtn = document.querySelector('#preview-login');
if (previewBtn) {
  previewBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/portal/auth/preview-login?email=demo.client@example.com', { credentials: 'same-origin' });
      location.href = next;
    } catch {
      errorBox.textContent = 'Preview login is only available locally.';
    }
  });
}

if (params.get('error') === 'link_expired') {
  errorBox.textContent = 'That sign-in link expired. Request a new one.';
}
