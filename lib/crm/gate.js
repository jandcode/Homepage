export function classifyAdminPath(pathname) {
  const path = String(pathname || '').replace(/\/+$/, '') || '/';
  if (path === '/admin/login' || path === '/admin/login.html') return 'public';
  if (path.startsWith('/admin/assets/')) return 'public';
  if (path === '/admin' || path === '/admin/index.html') return 'app';
  if (path.startsWith('/admin/')) return 'alias';
  return 'other';
}

export function safeNextPath(value) {
  if (typeof value !== 'string' || value.length > 500) return '/admin';
  let url;
  try {
    url = new URL(value, 'https://jdcode.dev');
  } catch {
    return '/admin';
  }
  if (url.origin !== 'https://jdcode.dev') return '/admin';
  if (url.pathname !== '/admin' && !url.pathname.startsWith('/admin/')) return '/admin';
  if (url.pathname.startsWith('/admin/login')) return '/admin';
  const hash = url.hash || '';
  if (hash && !hash.startsWith('#/')) return '/admin';
  return `${url.pathname}${url.search}${hash}`;
}

export function hashAlias(pathname, search = '') {
  const path = String(pathname || '').replace(/\/+$/, '') || '/';
  const rest = path.slice('/admin'.length) || '/';
  return `/admin#${rest}${search || ''}`;
}

export function decideGate({ kind, sessionState, hasRefresh, configured }) {
  if (kind === 'public' || kind === 'other') return { type: 'allow' };
  if (sessionState === 'valid') {
    if (kind === 'alias') return { type: 'hash' };
    return { type: 'allow' };
  }
  if (sessionState === 'forbidden' || !configured || !hasRefresh) return { type: 'login' };
  return { type: 'refresh' };
}
