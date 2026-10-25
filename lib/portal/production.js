import { createClient } from '@supabase/supabase-js';
import { createRateLimiter } from '../crm/auth.js';
import { signInWithPassword } from '../auth/password.js';
import { refreshSession, revokeAccess, verifyAccessToken } from '../auth/supabase-rest.js';
import {
  handlePortalAdminLoginRequest,
  handlePortalCallbackRequest,
  handlePortalLogoutRequest,
  handlePortalMagicLinkRequest,
  handlePortalPreviewLoginRequest,
  handlePortalRefreshRequest,
  handlePortalSessionRequest,
  secureFromPortalRequest,
} from '../auth/portal-handlers.js';
import { createPortalMemoryStore } from './memory-store.js';
import { sendMagicLink, verifyMagicLinkToken } from '../auth/magic-link.js';
import { isSecureRequest } from './cookies.js';
import { errorBody, json } from '../crm/http.js';
import { handlePortalRequest } from './router.js';
import { createPortalSupabaseStore } from './supabase-store.js';

export function readPortalEnv(source = process.env) {
  return {
    SUPABASE_URL: source.SUPABASE_URL || '',
    SUPABASE_ANON_KEY: source.SUPABASE_ANON_KEY || '',
    SUPABASE_SERVICE_ROLE_KEY: source.SUPABASE_SERVICE_ROLE_KEY || '',
    CRM_ADMIN_EMAILS: source.CRM_ADMIN_EMAILS || '',
  };
}

const magicLimit = createRateLimiter({ limit: 8, windowMs: 15 * 60 * 1000 });
const loginLimit = createRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });

function serviceClient(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function userClient(env, accessToken) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function portalDeps(env = readPortalEnv(), accessToken = null) {
  const service = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? serviceClient(env) : null;
  const user = accessToken && env.SUPABASE_URL ? userClient(env, accessToken) : service;
  const store = user ? createPortalSupabaseStore(user, service) : null;
  return {
    env,
    now: () => new Date(),
    store,
    verifyAccessToken: (token) => verifyAccessToken(token, env),
  };
}

function authDeps(env, store) {
  return {
    env,
    now: () => new Date(),
    secure: secureFromPortalRequest,
    rateLimit: magicLimit,
    signIn: (credentials) => signInWithPassword(env, credentials),
    revoke: (token) => revokeAccess(token, env),
    verifyAccessToken: (token) => verifyAccessToken(token, env),
    refresh: (token) => refreshSession(token, env),
    sendMagicLink: (payload) => sendMagicLink(env, payload),
    verifyMagicLink: (payload) => verifyMagicLinkToken(env, payload),
    isInvitedEmail: (email) => store.emailIsPortalMember(email),
    linkMember: (userId, email) => store.linkMemberUser(userId, email),
  };
}

export async function productionPortal(request) {
  const cookies = request.headers.get('cookie') || '';
  const match = cookies.match(/portal_access=([^;]+)/);
  let accessToken = null;
  if (match) {
    try {
      accessToken = decodeURIComponent(match[1]);
    } catch {
      accessToken = match[1];
    }
  }
  const deps = portalDeps(readPortalEnv(), accessToken);
  if (!deps.store) return json(503, errorBody('not_configured', 'Portal storage is not configured.'));
  return handlePortalRequest(request, deps);
}

export function productionPortalAuth(action, request) {
  const deps = portalDeps();
  if (!deps.store) return json(503, errorBody('not_configured', 'Portal is not configured.'));
  const auth = authDeps(readPortalEnv(), deps.store);
  if (action === 'magic-link') return handlePortalMagicLinkRequest(request, auth);
  if (action === 'callback') return handlePortalCallbackRequest(request, auth);
  if (action === 'admin-login') {
    return handlePortalAdminLoginRequest(request, { ...auth, rateLimit: loginLimit });
  }
  if (action === 'logout') return handlePortalLogoutRequest(request, auth);
  if (action === 'session') return handlePortalSessionRequest(request, auth);
  if (action === 'refresh') return handlePortalRefreshRequest(request, auth);
  if (action === 'preview-login') {
    return handlePortalPreviewLoginRequest(request, {
      ...auth,
      allowPreview: process.env.PORTAL_PREVIEW === 'true',
      previewLogin: null,
    });
  }
  return json(404, errorBody('not_found', 'Not found.'));
}

export function createPreviewPortalDeps(env, tokens) {
  const store = createPortalMemoryStore();
  const allowlist = (env.CRM_ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return {
    env,
    store,
    verifyAccessToken: async (token) => {
      const row = tokens.get(token);
      if (!row || row.refresh) return null;
      return row;
    },
    tokens,
    allowlist,
  };
}

export function portalConfigured() {
  const env = readPortalEnv();
  return Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);
}

export { isSecureRequest };
