export async function portalApi(path, options = {}) {
  const headers = { accept: 'application/json', ...(options.headers || {}) };
  if (options.body && !headers['content-type']) headers['content-type'] = 'application/json';
  const response = await fetch(`/api/portal/${path.replace(/^\//, '')}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: 'same-origin',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || 'Request failed.';
    const error = new Error(message);
    error.status = response.status;
    error.fields = payload?.error?.fields;
    throw error;
  }
  return payload.data;
}

export async function portalAuth(path, options = {}) {
  const headers = { accept: 'application/json', ...(options.headers || {}) };
  if (options.body && !headers['content-type']) headers['content-type'] = 'application/json';
  const response = await fetch(`/api/portal/auth/${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: 'same-origin',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || 'Request failed.');
  }
  return payload.data;
}
