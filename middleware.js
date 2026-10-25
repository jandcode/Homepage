import { next } from '@vercel/functions';
import { isAllowlisted, parseAllowlist } from './lib/crm/auth.js';
import { parseCookies as parseCrmCookies } from './lib/crm/cookies.js';
import { classifyAdminPath, decideGate, hashAlias, safeNextPath } from './lib/crm/gate.js';
import { verifyAccessToken } from './lib/auth/supabase-rest.js';
import { parseCookies as parsePortalCookies } from './lib/portal/cookies.js';
import {
  classifyPortalPath,
  decidePortalGate,
  hashPortalAlias,
  safePortalNextPath,
} from './lib/portal/gate.js';

export const config = {
  matcher: ['/admin', '/admin/:path*', '/portal', '/portal/:path*'],
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

async function portalSessionState(cookies, configured, { adminRoute }) {
  if (!cookies.portal_access || !configured) {
    return cookies.portal_access ? 'invalid' : 'none';
  }
  const user = await verifyAccessToken(cookies.portal_access, process.env);
  if (!user?.email) return 'invalid';
  const email = user.email.toLowerCase();
  const isAdmin = isAllowlisted(email, parseAllowlist(process.env.CRM_ADMIN_EMAILS || ''));
  if (adminRoute) return isAdmin ? 'valid' : 'forbidden';
  return 'valid';
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const portalKind = classifyPortalPath(url.pathname);
  const configured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);

  if (portalKind !== 'other') {
    const cookies = parsePortalCookies(request.headers.get('cookie'));
    const adminRoute = portalKind.startsWith('admin');
    const sessionState = await portalSessionState(cookies, configured, { adminRoute });
    const decision = decidePortalGate({
      kind: portalKind,
      sessionState,
      hasRefresh: Boolean(cookies.portal_refresh),
      configured,
    });
    const target = portalKind.endsWith('alias')
      ? hashPortalAlias(url.pathname, url.search, { admin: adminRoute })
      : `${url.pathname}${url.search}`;

    if (decision.type === 'hash') {
      return redirectTo(new URL(hashPortalAlias(url.pathname, url.search, { admin: adminRoute }), url));
    }
    if (decision.type === 'refresh') {
      const refreshUrl = new URL('/api/portal/auth/refresh', url);
      refreshUrl.searchParams.set('next', safePortalNextPath(target, { admin: adminRoute }));
      if (adminRoute) refreshUrl.searchParams.set('admin', '1');
      return redirectTo(refreshUrl);
    }
    if (decision.type === 'login') {
      const login = new URL(adminRoute ? '/portal/admin/login' : '/portal/login', url);
      login.searchParams.set('next', safePortalNextPath(target, { admin: adminRoute }));
      return redirectTo(login);
    }
    return next({ headers: ROBOTS });
  }

  const kind = classifyAdminPath(url.pathname);
  const cookies = parseCrmCookies(request.headers.get('cookie'));
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
