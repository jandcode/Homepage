import { clientIp, isAllowlisted, parseAllowlist, sameOriginWrite } from '../crm/auth.js';
import { clearSessionCookies, isSecureRequest, parseCookies, sessionCookies } from '../crm/cookies.js';
import { safeNextPath } from '../crm/gate.js';
import { errorBody, json, readJson, redirect, requireJson } from '../crm/http.js';

function toErrorResponse(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  if (!error?.expose) console.error(error);
  return json(status, errorBody(error?.code || 'internal_error', error?.expose ? error.message : 'Something went wrong.'));
}

export async function handleLoginRequest(request, deps) {
  try {
    if (request.method !== 'POST') return json(405, errorBody('method_not_allowed', 'Method not allowed.'), { allow: 'POST' });
    if (!sameOriginWrite(request)) return json(403, errorBody('forbidden', 'Cross-site writes are blocked.'));
    if (!deps.env.SUPABASE_URL || !deps.env.SUPABASE_ANON_KEY) {
      return json(503, errorBody('not_configured', 'Sign-in is not configured.'));
    }
    if (deps.rateLimit && !deps.rateLimit(`login:${clientIp(request)}`, deps.now())) {
      return json(429, errorBody('rate_limited', 'Too many sign-in attempts. Try again later.'));
    }
    requireJson(request);
    const body = await readJson(request);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password || password.length > 200 || email.length > 320) {
      return json(401, errorBody('invalid_credentials', 'Invalid email or password.'));
    }
    const result = await deps.signIn({ email, password });
    const session = result?.session;
    const userEmail = result?.user?.email || '';
    const allowed = session?.access_token && userEmail && isAllowlisted(userEmail, parseAllowlist(deps.env.CRM_ADMIN_EMAILS));
    if (!allowed) {
      if (session?.access_token && deps.revoke) {
        try {
          await deps.revoke(session.access_token);
        } catch (error) {
          console.error('crm revoke failed', error?.message || error);
        }
      }
      return json(401, errorBody('invalid_credentials', 'Invalid email or password.'));
    }
    if (deps.syncAllowlist) {
      try {
        await deps.syncAllowlist(parseAllowlist(deps.env.CRM_ADMIN_EMAILS));
      } catch (error) {
        console.error('crm allowlist sync failed', error?.message || error);
      }
    }
    return json(200, { data: { email: userEmail.toLowerCase() } }, {
      'set-cookie': sessionCookies({
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresIn: session.expires_in,
        secure: deps.secure(request),
      }),
    });
  } catch (error) {
    if (error?.status) return toErrorResponse(error);
    console.error(error);
    return json(503, errorBody('unavailable', 'Sign-in is unavailable right now.'));
  }
}

export async function handleLogoutRequest(request, deps) {
  try {
    if (request.method !== 'POST') return json(405, errorBody('method_not_allowed', 'Method not allowed.'), { allow: 'POST' });
    if (!sameOriginWrite(request)) return json(403, errorBody('forbidden', 'Cross-site writes are blocked.'));
    const cookies = parseCookies(request.headers.get('cookie'));
    if (cookies.crm_access && deps.revoke) {
      try {
        await deps.revoke(cookies.crm_access);
      } catch (error) {
        console.error('crm revoke failed', error?.message || error);
      }
    }
    return json(200, { data: { ok: true } }, {
      'set-cookie': clearSessionCookies(deps.secure(request)),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function handleSessionRequest(request, deps) {
  try {
    if (request.method !== 'GET') return json(405, errorBody('method_not_allowed', 'Method not allowed.'), { allow: 'GET' });
    const cookies = parseCookies(request.headers.get('cookie'));
    if (!cookies.crm_access) return json(401, errorBody('unauthorized', 'Missing or invalid credentials.'));
    const user = await deps.verifyAccessToken(cookies.crm_access);
    if (!user?.email || !isAllowlisted(user.email, parseAllowlist(deps.env.CRM_ADMIN_EMAILS))) {
      return json(401, errorBody('unauthorized', 'Missing or invalid credentials.'));
    }
    return json(200, { data: { email: user.email.toLowerCase() } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function handleRefreshRequest(request, deps) {
  const url = new URL(request.url);
  const next = safeNextPath(url.searchParams.get('next') || '/admin');
  const secure = deps.secure(request);
  const fail = () => redirect(`/admin/login?next=${encodeURIComponent(next)}`, clearSessionCookies(secure));
  try {
    if (request.method !== 'GET') return json(405, errorBody('method_not_allowed', 'Method not allowed.'), { allow: 'GET' });
    const cookies = parseCookies(request.headers.get('cookie'));
    if (!deps.env.SUPABASE_URL || !deps.env.SUPABASE_ANON_KEY || !cookies.crm_refresh) return fail();
    const session = await deps.refresh(cookies.crm_refresh);
    let email = session?.email || '';
    if (session?.access_token && !email) {
      const user = await deps.verifyAccessToken(session.access_token);
      email = user?.email || '';
    }
    if (!session?.access_token || !session.refresh_token || !isAllowlisted(email, parseAllowlist(deps.env.CRM_ADMIN_EMAILS))) {
      return fail();
    }
    if (deps.syncAllowlist) {
      try {
        await deps.syncAllowlist(parseAllowlist(deps.env.CRM_ADMIN_EMAILS));
      } catch (error) {
        console.error('crm allowlist sync failed', error?.message || error);
      }
    }
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

export function secureFromRequest(request) {
  return isSecureRequest(request);
}
