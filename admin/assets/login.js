const form = document.querySelector('#login-form');
const error = document.querySelector('#login-error');
const params = new URLSearchParams(location.search);

function safeNext(value) {
  if (!value || !value.startsWith('/admin') || value.startsWith('//') || value.includes('\\') || value.includes('://')) {
    return '/admin';
  }
  if (value.startsWith('/admin/login')) return '/admin';
  return value;
}

const next = safeNext(params.get('next'));

const existing = await fetch('/api/auth/session');
if (existing.ok) location.replace(next);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  error.textContent = '';
  form.querySelector('button').disabled = true;
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: form.email.value.trim(),
        password: form.password.value,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      error.textContent = body.error?.message || 'Could not sign in.';
      return;
    }
    location.href = next;
  } catch {
    error.textContent = 'Could not reach the CRM.';
  } finally {
    form.querySelector('button').disabled = false;
  }
});
