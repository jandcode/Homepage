import { createClient } from '@supabase/supabase-js';
import { syncAllowlist } from '../auth/allowlist.js';
import {
  handleLoginRequest,
  handleLogoutRequest,
  handleRefreshRequest,
  handleSessionRequest,
} from '../auth/handlers.js';
import { signInWithPassword } from '../auth/password.js';
import { refreshSession, revokeAccess, verifyAccessToken } from '../auth/supabase-rest.js';
import { createRateLimiter } from './auth.js';
import { isSecureRequest } from './cookies.js';
import { errorBody, json } from './http.js';
import { handleCrmRequest } from './router.js';
import { createSupabaseStore } from './supabase-store.js';

export function readEnv(source = process.env) {
  return {
    SUPABASE_URL: source.SUPABASE_URL || '',
    SUPABASE_ANON_KEY: source.SUPABASE_ANON_KEY || '',
    SUPABASE_SERVICE_ROLE_KEY: source.SUPABASE_SERVICE_ROLE_KEY || '',
    CRM_ADMIN_EMAILS: source.CRM_ADMIN_EMAILS || '',
    CRM_API_KEY: source.CRM_API_KEY || '',
    CRM_CONTACT_TO_LEAD: source.CRM_CONTACT_TO_LEAD || '',
    CRM_TIMEZONE: source.CRM_TIMEZONE || '',
  };
}

const loginLimit = createRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });
const inboundLimit = createRateLimiter({ limit: 8, windowMs: 60 * 60 * 1000 });

function serviceClient(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function crmDeps(env = readEnv()) {
  const service = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? serviceClient(env) : null;
  return {
    env,
    now: () => new Date(),
    store: service ? createSupabaseStore(service) : null,
    verifyAccessToken: (token) => verifyAccessToken(token, env),
    rateLimit: inboundLimit,
  };
}

export function authDeps(env = readEnv()) {
  const service = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? serviceClient(env) : null;
  return {
    env,
    now: () => new Date(),
    secure: isSecureRequest,
    rateLimit: loginLimit,
    signIn: (credentials) => signInWithPassword(env, credentials),
    revoke: (token) => revokeAccess(token, env),
    verifyAccessToken: (token) => verifyAccessToken(token, env),
    refresh: (token) => refreshSession(token, env),
    syncAllowlist: service ? (emails) => syncAllowlist(service, emails) : null,
  };
}

export function productionCrm(request) {
  const deps = crmDeps();
  if (!deps.store) return json(503, errorBody('not_configured', 'CRM storage is not configured.'));
  return handleCrmRequest(request, deps);
}

export function productionLogin(request) {
  return handleLoginRequest(request, authDeps());
}

export function productionLogout(request) {
  return handleLogoutRequest(request, authDeps());
}

export function productionSession(request) {
  return handleSessionRequest(request, authDeps());
}

export function productionRefresh(request) {
  return handleRefreshRequest(request, authDeps());
}
