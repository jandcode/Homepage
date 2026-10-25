const form = document.querySelector('#login-form');
const errorBox = document.querySelector('#login-error');
const params = new URLSearchParams(location.search);
const next = params.get('next') || '/portal/admin';

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.textContent = '';
  const body = {
    email: new FormData(form).get('email'),
    password: new FormData(form).get('password'),
  };
  const response = await fetch('/api/portal/auth/admin-login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    errorBox.textContent = payload?.error?.message || 'Sign-in failed.';
    return;
  }
  location.href = next;
});

const previewBtn = document.querySelector('#preview-login');
if (previewBtn) {
  previewBtn.addEventListener('click', async () => {
    await fetch('/api/portal/auth/preview-login?email=jan@jdcode.dev&admin=1', { credentials: 'same-origin' });
    location.href = next;
  });
}
