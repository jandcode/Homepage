import { isAllowlisted, parseAllowlist, clientIp, sameOriginWrite } from '../crm/auth.js';
import { signInWithPassword } from './password.js';
import { refreshSession, revokeAccess, verifyAccessToken } from './supabase-rest.js';
import { sendMagicLink, verifyMagicLinkToken } from './magic-link.js';
import {
  clearSessionCookies,
  isSecureRequest,
  parseCookies,
  sessionCookies,
} from '../portal/cookies.js';
import { safePortalNextPath } from '../portal/gate.js';
import { errorBody, json, readJson, redirect, requireJson } from '../crm/http.js';

function toErrorResponse(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  if (!error?.expose) console.error(error);
  return json(status, errorBody(error?.code || 'internal_error', error?.expose ? error.message : 'Something went wrong.'));
}

export async function handlePortalMagicLinkRequest(request, deps) {
  try {
    if (request.method !== 'POST') return json(405, errorBody('method_not_allowed', 'Method not allowed.'), { allow: 'POST' });
    if (!sameOriginWrite(request)) return json(403, errorBody('forbidden', 'Cross-site writes are blocked.'));
    if (!deps.env.SUPABASE_URL || !deps.env.SUPABASE_ANON_KEY) {
      return json(503, errorBody('not_configured', 'Sign-in is not configured.'));
    }
    if (deps.rateLimit && !deps.rateLimit(`portal-magic:${clientIp(request)}`, deps.now())) {
      return json(429, errorBody('rate_limited', 'Too many sign-in attempts. Try again later.'));
    }
    requireJson(request);
    const body = await readJson(request);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email || email.length > 320) {
      return json(400, errorBody('validation_error', 'Enter a valid email address.'));
    }
    const allowed = await deps.isInvitedEmail(email);
    if (!allowed) {
      return json(403, errorBody('forbidden', 'This email is not invited to the client portal.'));
    }
    const origin = new URL(request.url).origin;
    const redirectTo = `${origin}/api/portal/auth/callback`;
    await deps.sendMagicLink({ email, redirectTo });
    return json(200, { data: { ok: true, message: 'Check your email for a sign-in link.' } });
  } catch (error) {
    if (error?.status) return toErrorResponse(error);
    return toErrorResponse(error);
  }
}

export async function handlePortalCallbackRequest(request, deps) {
  const url = new URL(request.url);
  const next = safePortalNextPath(url.searchParams.get('next') || '/portal');
  const secure = deps.secure(request);
  const fail = () => redirect(`/portal/login?error=link_expired&next=${encodeURIComponent(next)}`, clearSessionCookies(secure));
  try {
    if (request.method !== 'GET') return json(405, errorBody('method_not_allowed', 'Method not allowed.'), { allow: 'GET' });
    const token_hash = url.searchParams.get('token_hash') || url.searchParams.get('token');
    const type = url.searchParams.get('type') || 'magiclink';
    if (!token_hash) return fail();
    const session = await deps.verifyMagicLink({ token_hash, type });
    if (!session?.access_token || !session.refresh_token) return fail();
    const email = (session.email || '').toLowerCase();
    const invited = await deps.isInvitedEmail(email);
    const admin = isAllowlisted(email, parseAllowlist(deps.env.CRM_ADMIN_EMAILS || ''));
    if (!invited && !admin) return fail();
    if (deps.linkMember) await deps.linkMember(session.user_id, email);
    return redirect(next, sessionCookies({
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresIn: session.expires_in,
      secure,
    }));
  } catch (error) {
    console.error(error);
    return fail();
  }
}

export async function handlePortalAdminLoginRequest(request, deps) {
  try {
    if (request.method !== 'POST') return json(405, errorBody('method_not_allowed', 'Method not allowed.'), { allow: 'POST' });
    if (!sameOriginWrite(request)) return json(403, errorBody('forbidden', 'Cross-site writes are blocked.'));
    requireJson(request);
    const body = await readJson(request);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password) return json(401, errorBody('invalid_credentials', 'Invalid email or password.'));
    if (!isAllowlisted(email, parseAllowlist(deps.env.CRM_ADMIN_EMAILS || ''))) {
      return json(401, errorBody('invalid_credentials', 'Invalid email or password.'));
    }
    const result = await deps.signIn({ email, password });
    const session = result?.session;
    if (!session?.access_token) {
      return json(401, errorBody('invalid_credentials', 'Invalid email or password.'));
    }
    return json(200, { data: { email } }, {
      'set-cookie': sessionCookies({
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresIn: session.expires_in,
        secure: deps.secure(request),
      }),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function handlePortalLogoutRequest(request, deps) {
  try {
    if (request.method !== 'POST') return json(405, errorBody('method_not_allowed', 'Method not allowed.'), { allow: 'POST' });
    if (!sameOriginWrite(request)) return json(403, errorBody('forbidden', 'Cross-site writes are blocked.'));
    const cookies = parseCookies(request.headers.get('cookie'));
    if (cookies.portal_access && deps.revoke) {
      try {
        await deps.revoke(cookies.portal_access);
      } catch (error) {
        console.error('portal revoke failed', error?.message || error);
      }
    }
    return json(200, { data: { ok: true } }, {
      'set-cookie': clearSessionCookies(deps.secure(request)),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function handlePortalSessionRequest(request, deps) {
  try {
    if (request.method !== 'GET') return json(405, errorBody('method_not_allowed', 'Method not allowed.'), { allow: 'GET' });
    const cookies = parseCookies(request.headers.get('cookie'));
    if (!cookies.portal_access) return json(401, errorBody('unauthorized', 'Missing or invalid credentials.'));
    const user = await deps.verifyAccessToken(cookies.portal_access);
    if (!user?.email) return json(401, errorBody('unauthorized', 'Missing or invalid credentials.'));
    const email = user.email.toLowerCase();
    const admin = isAllowlisted(email, parseAllowlist(deps.env.CRM_ADMIN_EMAILS || ''));
    const invited = admin || (await deps.isInvitedEmail(email));
    if (!invited) return json(401, errorBody('unauthorized', 'Missing or invalid credentials.'));
    return json(200, { data: { email, admin, user_id: user.id } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function handlePortalRefreshRequest(request, deps) {
  const url = new URL(request.url);
  const admin = url.searchParams.get('admin') === '1';
  const next = safePortalNextPath(url.searchParams.get('next') || (admin ? '/portal/admin' : '/portal'), { admin });
  const secure = deps.secure(request);
  const fail = () => redirect(`/portal/${admin ? 'admin/' : ''}login?next=${encodeURIComponent(next)}`, clearSessionCookies(secure));
  try {
    if (request.method !== 'GET') return json(405, errorBody('method_not_allowed', 'Method not allowed.'), { allow: 'GET' });
    const cookies = parseCookies(request.headers.get('cookie'));
    if (!cookies.portal_refresh) return fail();
    const session = await deps.refresh(cookies.portal_refresh);
    const email = (session?.email || '').toLowerCase();
    if (!session?.access_token || !session.refresh_token) return fail();
    const isAdmin = isAllowlisted(email, parseAllowlist(deps.env.CRM_ADMIN_EMAILS || ''));
    const invited = isAdmin || (await deps.isInvitedEmail(email));
    if (!invited) return fail();
    if (deps.linkMember) await deps.linkMember(session.user_id, email);
    return redirect(next, sessionCookies({
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresIn: session.expires_in,
      secure,
    }));
  } catch (error) {
    console.error(error);
    return fail();
  }
}

export async function handlePortalPreviewLoginRequest(request, deps) {
  if (!deps.allowPreview) {
    return json(404, errorBody('not_found', 'Not found.'));
  }
  const url = new URL(request.url);
  const email = (url.searchParams.get('email') || '').toLowerCase();
  const admin = url.searchParams.get('admin') === '1';
  const next = safePortalNextPath(url.searchParams.get('next') || (admin ? '/portal/admin' : '/portal'), { admin });
  const session = await deps.previewLogin({ email, admin });
  if (!session) return json(403, errorBody('forbidden', 'Preview login failed.'));
  return redirect(next, sessionCookies({
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresIn: session.expires_in,
    secure: deps.secure(request),
  }));
}

export function secureFromPortalRequest(request) {
  return isSecureRequest(request);
}
