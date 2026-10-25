export function classifyPortalPath(pathname) {
  const path = String(pathname || '').replace(/\/+$/, '') || '/';
  if (path === '/portal/login' || path === '/portal/login.html') return 'public';
  if (path === '/portal/auth/callback') return 'public';
  if (path.startsWith('/portal/assets/')) return 'public';
  if (path === '/portal/admin/login' || path === '/portal/admin/login.html') return 'public';
  if (path.startsWith('/portal/admin/assets/')) return 'public';
  if (path === '/portal/admin' || path === '/portal/admin/index.html') return 'admin_app';
  if (path.startsWith('/portal/admin/')) return 'admin_alias';
  if (path === '/portal' || path === '/portal/index.html') return 'client_app';
  if (path.startsWith('/portal/')) return 'client_alias';
  return 'other';
}

export function safePortalNextPath(value, { admin = false } = {}) {
  const fallback = admin ? '/portal/admin' : '/portal';
  if (typeof value !== 'string' || value.length > 500) return fallback;
  let url;
  try {
    url = new URL(value, 'https://jdcode.dev');
  } catch {
    return fallback;
  }
  if (url.origin !== 'https://jdcode.dev') return fallback;
  const prefix = admin ? '/portal/admin' : '/portal';
  if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) return fallback;
  if (url.pathname.includes('/login')) return fallback;
  const hash = url.hash || '';
  if (hash && !hash.startsWith('#/')) return fallback;
  return `${url.pathname}${url.search}${hash}`;
}

export function hashPortalAlias(pathname, search = '', { admin = false } = {}) {
  const base = admin ? '/portal/admin' : '/portal';
  const path = String(pathname || '').replace(/\/+$/, '') || '/';
  const rest = path.slice(base.length) || '/';
  return `${base}#${rest}${search || ''}`;
}

export function decidePortalGate({ kind, sessionState, hasRefresh, configured }) {
  if (kind === 'public' || kind === 'other') return { type: 'allow' };
  if (sessionState === 'valid') {
    if (kind === 'client_alias' || kind === 'admin_alias') return { type: 'hash' };
    return { type: 'allow' };
  }
  if (sessionState === 'forbidden' || !configured || !hasRefresh) return { type: 'login' };
  return { type: 'refresh' };
}
