import { next } from '@vercel/functions';
import { isAllowlisted, parseAllowlist } from './lib/crm/auth.js';
import { parseCookies } from './lib/crm/cookies.js';
import { classifyAdminPath, decideGate, hashAlias, safeNextPath } from './lib/crm/gate.js';
import { verifyAccessToken } from './lib/auth/supabase-rest.js';

export const config = {
  matcher: ['/admin', '/admin/:path*'],
  runtime: 'nodejs',
};

const ROBOTS = {
  'x-robots-tag': 'noindex, nofollow, noarchive',
  'cache-control': 'private, no-store',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
};

function redirectTo(location) {
  return new Response(null, {
    status: 302,
    headers: {
      location: String(location),
      ...ROBOTS,
    },
  });
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const kind = classifyAdminPath(url.pathname);
  const cookies = parseCookies(request.headers.get('cookie'));
  const configured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
  let sessionState = 'none';
  if (cookies.crm_access && configured) {
    const user = await verifyAccessToken(cookies.crm_access, process.env);
    if (user?.email && isAllowlisted(user.email, parseAllowlist(process.env.CRM_ADMIN_EMAILS || ''))) {
      sessionState = 'valid';
    } else if (user?.email) {
      sessionState = 'forbidden';
    } else {
      sessionState = 'invalid';
    }
  } else if (cookies.crm_access) {
    sessionState = 'invalid';
  }

  const decision = decideGate({
    kind,
    sessionState,
    hasRefresh: Boolean(cookies.crm_refresh),
    configured,
  });
  const target = kind === 'alias'
    ? hashAlias(url.pathname, url.search)
    : `${url.pathname}${url.search}`;

  if (decision.type === 'hash') return redirectTo(new URL(hashAlias(url.pathname, url.search), url));
  if (decision.type === 'refresh') {
    const refreshUrl = new URL('/api/auth/refresh', url);
    refreshUrl.searchParams.set('next', safeNextPath(target));
    return redirectTo(refreshUrl);
  }
  if (decision.type === 'login') {
    const login = new URL('/admin/login', url);
    login.searchParams.set('next', safeNextPath(target));
    return redirectTo(login);
  }
  return next({ headers: ROBOTS });
}
