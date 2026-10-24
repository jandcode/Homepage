// Local-only preview. In-memory CRM, not the production database.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { handleLoginRequest, handleLogoutRequest, handleRefreshRequest, handleSessionRequest } from '../lib/auth/handlers.js';
import { isAllowlisted, parseAllowlist } from '../lib/crm/auth.js';
import { parseCookies } from '../lib/crm/cookies.js';
import { classifyAdminPath, decideGate, hashAlias, safeNextPath } from '../lib/crm/gate.js';
import { createMemoryStore } from '../lib/crm/memory-store.js';
import { handleCrmRequest } from '../lib/crm/router.js';

if (process.env.VERCEL) {
  console.error('preview-admin is for local use only.');
  process.exit(1);
}

const root = join(import.meta.dirname, '..');
const port = Number(process.env.PORT || 4173);
const tokens = new Map();
const env = {
  SUPABASE_URL: 'http://preview.local',
  SUPABASE_ANON_KEY: 'preview-anon',
  SUPABASE_SERVICE_ROLE_KEY: 'preview-service',
  CRM_ADMIN_EMAILS: 'jan@jdcode.dev',
  CRM_API_KEY: 'preview-api-key',
  CRM_CONTACT_TO_LEAD: 'false',
  CRM_TIMEZONE: 'Europe/Berlin',
};
const store = createMemoryStore();
const allowlist = parseAllowlist(env.CRM_ADMIN_EMAILS);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.mp4': 'video/mp4',
};

function crmDeps() {
  return {
    env,
    now: () => new Date(),
    store,
    verifyAccessToken: async (token) => {
      const row = tokens.get(token);
      if (!row || row.refresh) return null;
      return row;
    },
    rateLimit: () => true,
  };
}

function authDeps() {
  return {
    env,
    now: () => new Date(),
    secure: () => false,
    rateLimit: () => true,
    syncAllowlist: null,
    signIn: async ({ email, password }) => {
      if (password !== 'preview' || !isAllowlisted(email, allowlist)) return { session: null, user: null };
      const access = randomUUID();
      const refresh = randomUUID();
      tokens.set(access, { email });
      tokens.set(refresh, { email, refresh: true });
      return { session: { access_token: access, refresh_token: refresh, expires_in: 3600 }, user: { email } };
    },
    revoke: async (token) => { tokens.delete(token); },
    verifyAccessToken: async (token) => {
      const row = tokens.get(token);
      if (!row || row.refresh) return null;
      return row;
    },
    refresh: async (token) => {
      const row = tokens.get(token);
      if (!row?.refresh) return null;
      const access = randomUUID();
      tokens.set(access, { email: row.email });
      return { access_token: access, refresh_token: token, expires_in: 3600, email: row.email };
    },
  };
}

function sessionState(cookieHeader) {
  const cookies = parseCookies(cookieHeader);
  const access = cookies.crm_access ? tokens.get(cookies.crm_access) : null;
  let state = 'none';
  if (access && !access.refresh && isAllowlisted(access.email, allowlist)) state = 'valid';
  else if (access && !access.refresh) state = 'forbidden';
  else if (cookies.crm_access) state = 'invalid';
  return {
    state,
    hasRefresh: Boolean(cookies.crm_refresh && tokens.get(cookies.crm_refresh)?.refresh),
  };
}

async function toRequest(req) {
  const host = req.headers.host || `127.0.0.1:${port}`;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
    else headers.set(key, value);
  }
  const method = req.method || 'GET';
  return new Request(`http://${host}${req.url}`, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : body,
  });
}

async function send(res, response) {
  const headers = {};
  response.headers.forEach((value, key) => {
    if (key === 'set-cookie') return;
    headers[key] = value;
  });
  const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  if (cookies.length) headers['set-cookie'] = cookies;
  res.writeHead(response.status, headers);
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function serveStatic(pathname) {
  const relative = (pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, ''));
  const candidates = [relative];
  if (!extname(relative)) {
    candidates.push(`${relative}.html`, join(relative, 'index.html'));
  }
  for (const candidate of candidates) {
    if (candidate.split(/[\\/]/).some((part) => !part || part === '..' || part.startsWith('.') || part === 'node_modules')) {
      continue;
    }
    const file = normalize(join(root, candidate));
    if (!file.startsWith(`${root}${sep}`)) continue;
    try {
      const body = await readFile(file);
      return { body, type: types[extname(file)] || 'application/octet-stream' };
    } catch {
      // try the next candidate
    }
  }
  return null;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    const request = await toRequest(req);
    if (url.pathname.startsWith('/api/auth/login')) return send(res, await handleLoginRequest(request, authDeps()));
    if (url.pathname.startsWith('/api/auth/logout')) return send(res, await handleLogoutRequest(request, authDeps()));
    if (url.pathname.startsWith('/api/auth/session')) return send(res, await handleSessionRequest(request, authDeps()));
    if (url.pathname.startsWith('/api/auth/refresh')) return send(res, await handleRefreshRequest(request, authDeps()));
    if (url.pathname.startsWith('/api/crm')) return send(res, await handleCrmRequest(request, crmDeps()));

    const kind = classifyAdminPath(url.pathname);
    if (kind !== 'other') {
      const session = sessionState(req.headers.cookie);
      const decision = decideGate({
        kind,
        sessionState: session.state,
        hasRefresh: session.hasRefresh,
        configured: true,
      });
      const target = kind === 'alias' ? hashAlias(url.pathname, url.search) : `${url.pathname}${url.search}`;
      if (decision.type === 'hash') {
        res.writeHead(302, { location: hashAlias(url.pathname, url.search) });
        res.end();
        return;
      }
      if (decision.type === 'refresh' || decision.type === 'login') {
        const location = decision.type === 'refresh'
          ? `/api/auth/refresh?next=${encodeURIComponent(safeNextPath(target))}`
          : `/admin/login?next=${encodeURIComponent(safeNextPath(target))}`;
        res.writeHead(302, { location });
        res.end();
        return;
      }
    }

    const file = await serveStatic(url.pathname);
    if (!file) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const headers = { 'content-type': file.type };
    if (url.pathname.startsWith('/admin')) {
      headers['x-robots-tag'] = 'noindex, nofollow, noarchive';
      headers['cache-control'] = 'private, no-store';
    }
    res.writeHead(200, headers);
    res.end(file.body);
  } catch (error) {
    console.error(error);
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Preview error');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`preview http://127.0.0.1:${port}`);
  console.log('admin login jan@jdcode.dev / preview');
  console.log('api key preview-api-key');
});
