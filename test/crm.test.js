import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import test from 'node:test';
import { handleLoginRequest, handleRefreshRequest, handleSessionRequest } from '../lib/auth/handlers.js';
import { isAllowlisted, parseAllowlist, safeEqual } from '../lib/crm/auth.js';
import { STAGES } from '../lib/crm/constants.js';
import { buildDashboard } from '../lib/crm/dashboard.js';
import { monthWindow } from '../lib/crm/dates.js';
import { classifyAdminPath, decideGate, hashAlias, safeNextPath } from '../lib/crm/gate.js';
import { createMemoryStore } from '../lib/crm/memory-store.js';
import { productionCrm } from '../lib/crm/production.js';
import { handleCrmRequest } from '../lib/crm/router.js';
import { ilikeOr } from '../lib/crm/supabase-store.js';
import { STAGE_ORDER } from '../admin/assets/html.js';
import { renderCompany, renderDeal } from '../admin/assets/render.js';

const root = join(import.meta.dirname, '..');

function env(overrides = {}) {
  return {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    CRM_ADMIN_EMAILS: 'jan@jdcode.dev, Ops@Agency.test ',
    CRM_API_KEY: 'test-key',
    CRM_CONTACT_TO_LEAD: 'false',
    CRM_TIMEZONE: 'Europe/Berlin',
    ...overrides,
  };
}

function deps(store = createMemoryStore(), overrides = {}) {
  return {
    env: env(overrides),
    store,
    now: () => new Date('2026-10-24T12:00:00Z'),
    verifyAccessToken: async (token) => {
      if (token === 'good-session') return { email: 'Jan@jdcode.dev' };
      if (token === 'other-session') return { email: 'stranger@example.com' };
      return null;
    },
    rateLimit: () => true,
  };
}

async function call(method, path, { body, token, cookie, origin, store, overrides, dep } = {}) {
  const headers = { origin: origin || 'https://jdcode.dev' };
  if (body) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  if (cookie) headers.cookie = cookie;
  const request = new Request(`https://jdcode.dev${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const response = await handleCrmRequest(request, dep || deps(store, overrides));
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: response.status, json, headers: response.headers };
}

test('allowlist and api key comparison', () => {
  const list = parseAllowlist(' jan@jdcode.dev, Ops@Agency.test ,,');
  assert.deepEqual(list, ['jan@jdcode.dev', 'ops@agency.test']);
  assert.equal(isAllowlisted('JAN@jdcode.dev', list), true);
  assert.equal(safeEqual('test-key', 'test-key'), true);
  assert.equal(safeEqual('test-key', 'test-key-longer'), false);
  assert.equal(safeEqual('', 'test-key'), false);
});

test('admin gate fails closed and does not refresh a forbidden session', () => {
  assert.equal(classifyAdminPath('/admin/login'), 'public');
  assert.equal(classifyAdminPath('/admin/assets/app.js'), 'public');
  assert.equal(classifyAdminPath('/admin/deals'), 'alias');
  assert.equal(hashAlias('/admin/deals', '?x=1'), '/admin#/deals?x=1');
  assert.equal(safeNextPath('https://evil.test'), '/admin');
  assert.equal(safeNextPath('/admin/login'), '/admin');
  assert.equal(safeNextPath('/admin#/deals/abc'), '/admin#/deals/abc');
  assert.deepEqual(decideGate({ kind: 'app', sessionState: 'forbidden', hasRefresh: true, configured: true }), { type: 'login' });
  assert.deepEqual(decideGate({ kind: 'app', sessionState: 'invalid', hasRefresh: true, configured: true }), { type: 'refresh' });
  assert.deepEqual(decideGate({ kind: 'app', sessionState: 'none', hasRefresh: false, configured: false }), { type: 'login' });
  assert.deepEqual(decideGate({ kind: 'alias', sessionState: 'valid', hasRefresh: false, configured: true }), { type: 'hash' });
  assert.deepEqual(decideGate({ kind: 'public', sessionState: 'none', hasRefresh: false, configured: false }), { type: 'allow' });
});

test('month boundaries follow the CRM timezone', () => {
  const zone = 'Europe/Berlin';
  const october = monthWindow(new Date('2026-10-24T22:30:00Z'), zone);
  assert.equal(october.today, '2026-10-25');
  const early = buildDashboard([
    { id: '1', title: 'A', stage: 'won', value: 990, currency: 'USD', won_at: '2026-09-30T22:00:00Z', company: null, contact: null },
    { id: '2', title: 'B', stage: 'won', value: 10, currency: 'USD', won_at: '2026-09-30T21:00:00Z', company: null, contact: null },
    { id: '3', title: 'C', stage: 'lead', value: 990, currency: 'EUR', next_step_date: '2026-10-24', company: { name: 'Acme' }, contact: null },
  ], new Date('2026-10-24T12:00:00Z'), zone);
  assert.equal(early.today, '2026-10-24');
  assert.equal(early.won_this_month_count, 1);
  assert.equal(early.won_this_month[0].value, 990);
  assert.equal(early.followups_due_today.length, 1);
  assert.equal(early.open_pipeline_by_stage.find((row) => row.stage === 'lead').totals[0].currency, 'EUR');
});

test('crm api requires a bearer key or an allowlisted session', async () => {
  const missing = await call('GET', '/api/crm/deals');
  assert.equal(missing.status, 401);
  const wrong = await call('GET', '/api/crm/deals', { token: 'nope' });
  assert.equal(wrong.status, 401);
  const stranger = await call('GET', '/api/crm/deals', { cookie: 'crm_access=other-session' });
  assert.equal(stranger.status, 403);
  const session = await call('GET', '/api/crm/deals', { cookie: 'crm_access=good-session' });
  assert.equal(session.status, 200);
  const blocked = await call('POST', '/api/crm/companies', {
    cookie: 'crm_access=good-session',
    origin: 'https://evil.test',
    body: { name: 'Nope' },
  });
  assert.equal(blocked.status, 403);
});

test('deals, stage history, search, and dashboard', async () => {
  const store = createMemoryStore();
  const created = await call('POST', '/api/crm/deals', {
    token: 'test-key',
    store,
    body: {
      title: 'Northwind audit',
      value: 990,
      source: 'referral',
      next_step: 'Send outline',
      next_step_date: '2026-10-23',
      company_name: 'Northwind',
      contact_name: 'Ada Meier',
      contact_email: 'Ada@Northwind.example',
    },
  });
  assert.equal(created.status, 201);
  const deal = created.json.data;
  assert.equal(deal.stage, 'lead');
  assert.equal(deal.value, 990);
  assert.equal(deal.currency, 'USD');
  assert.equal(deal.contact.email, 'ada@northwind.example');
  assert.equal(deal.stage_history.length, 1);
  assert.equal(deal.stage_history[0].from_stage, null);

  const same = await call('POST', `/api/crm/deals/${deal.id}/stage`, {
    token: 'test-key', store, body: { stage: 'lead' },
  });
  assert.equal(same.json.data.stage_history.length, 1);

  const moved = await call('POST', `/api/crm/deals/${deal.id}/stage`, {
    token: 'test-key', store, body: { stage: 'audit_paid' },
  });
  assert.equal(moved.json.data.stage, 'audit_paid');
  assert.equal(moved.json.data.stage_history.at(-1).from_stage, 'lead');

  const note = await call('POST', `/api/crm/deals/${deal.id}/activities`, {
    token: 'test-key', store, body: { type: 'call', body: 'Paid the audit.' },
  });
  assert.equal(note.status, 201);
  assert.equal(note.json.data.contact_id, deal.contact_id);

  const won = await call('PATCH', `/api/crm/deals/${deal.id}`, {
    token: 'test-key', store, body: { stage: 'won', next_step_date: null },
  });
  assert.ok(won.json.data.won_at);
  const lost = await call('POST', `/api/crm/deals/${deal.id}/stage`, {
    token: 'test-key', store, body: { stage: 'lost' },
  });
  assert.equal(lost.json.data.won_at, null);
  assert.ok(lost.json.data.lost_at);

  const found = await call('GET', '/api/crm/search?q=Northwind', { token: 'test-key', store });
  assert.equal(found.json.data.companies.length, 1);
  assert.equal(found.json.data.deals.length, 1);
  assert.equal(found.json.data.contacts[0].email, 'ada@northwind.example');

  const open = await call('POST', '/api/crm/deals', {
    token: 'test-key',
    store,
    body: { title: 'Agency retainer', value: 2000, currency: 'eur', stage: 'retainer', next_step_date: '2026-10-24' },
  });
  assert.equal(open.json.data.currency, 'EUR');
  const dashboard = await call('GET', '/api/crm/dashboard', { token: 'test-key', store });
  const retainer = dashboard.json.data.open_pipeline_by_stage.find((row) => row.stage === 'retainer');
  assert.equal(retainer.totals[0].value, 2000);
  assert.equal(dashboard.json.data.followups_due_today[0].title, 'Agency retainer');
  assert.equal(dashboard.json.data.won_this_month_count, 0);

  const bad = await call('POST', '/api/crm/deals', { token: 'test-key', store, body: { title: 'X', stage: 'nope' } });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error.code, 'validation_error');
  const orphan = await call('POST', '/api/crm/activities', { token: 'test-key', store, body: { body: 'Hello' } });
  assert.equal(orphan.status, 400);
});

test('contact form intake stays off unless the flag is set', async () => {
  const store = createMemoryStore();
  const hidden = await call('POST', '/api/crm/inbound/contact', {
    store, body: { name: 'Sam', email: 'sam@example.com' },
  });
  assert.equal(hidden.status, 404);
  const dropped = await call('POST', '/api/crm/inbound/contact', {
    store,
    overrides: { CRM_CONTACT_TO_LEAD: 'true' },
    body: { name: 'Bot', email: 'bot@example.com', company_url: 'http://spam.test' },
  });
  assert.equal(dropped.status, 202);
  const created = await call('POST', '/api/crm/inbound/contact', {
    store,
    overrides: { CRM_CONTACT_TO_LEAD: 'true' },
    body: { name: 'Sam', email: 'sam@example.com', company: 'Sam Co', message: 'Need an audit' },
  });
  assert.equal(created.status, 201);
  const deals = await call('GET', '/api/crm/deals', { token: 'test-key', store });
  assert.equal(deals.json.count, 1);
  assert.equal(deals.json.data[0].source, 'website');
  const detail = await call('GET', `/api/crm/deals/${deals.json.data[0].id}`, { token: 'test-key', store });
  assert.equal(detail.json.data.activities[0].body, 'Need an audit');
});

test('login rejects unknown admins and refresh honors the allowlist', async () => {
  let revoked = 0;
  const base = {
    env: env(),
    now: () => new Date(),
    secure: () => false,
    rateLimit: () => true,
    syncAllowlist: async () => {},
    revoke: async () => { revoked += 1; },
    verifyAccessToken: async () => ({ email: 'jan@jdcode.dev' }),
    refresh: async () => ({ access_token: 'next', refresh_token: 'r2', expires_in: 3600, email: 'stranger@example.com' }),
  };
  const bad = await handleLoginRequest(new Request('https://jdcode.dev/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://jdcode.dev', host: 'jdcode.dev' },
    body: JSON.stringify({ email: 'stranger@example.com', password: 'secret' }),
  }), {
    ...base,
    signIn: async () => ({ session: { access_token: 'a', refresh_token: 'r', expires_in: 3600 }, user: { email: 'stranger@example.com' } }),
  });
  assert.equal(bad.status, 401);
  assert.equal(revoked, 1);

  const good = await handleLoginRequest(new Request('https://jdcode.dev/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://jdcode.dev' },
    body: JSON.stringify({ email: 'jan@jdcode.dev', password: 'secret' }),
  }), {
    ...base,
    signIn: async () => ({ session: { access_token: 'a', refresh_token: 'r', expires_in: 3600 }, user: { email: 'jan@jdcode.dev' } }),
  });
  assert.equal(good.status, 200);
  assert.match(good.headers.get('set-cookie'), /crm_access=/);

  const session = await handleSessionRequest(new Request('https://jdcode.dev/api/auth/session', {
    headers: { cookie: 'crm_access=good' },
  }), base);
  assert.equal(session.status, 200);

  const refresh = await handleRefreshRequest(new Request('https://jdcode.dev/api/auth/refresh?next=https://evil.test', {
    headers: { cookie: 'crm_refresh=old' },
  }), base);
  assert.equal(refresh.status, 302);
  assert.equal(new URL(refresh.headers.get('location'), 'https://jdcode.dev').pathname, '/admin/login');
  assert.match(refresh.headers.get('set-cookie'), /Max-Age=0/);
});

test('unconfigured storage fails closed', async () => {
  const snapshot = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const response = await productionCrm(new Request('https://jdcode.dev/api/crm/deals'));
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.error.code, 'not_configured');
  } finally {
    for (const [key, value] of Object.entries(snapshot)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('admin html escapes notes and stage list matches the database', () => {
  assert.deepEqual(STAGE_ORDER, STAGES);
  const html = renderDeal({
    id: '11111111-1111-4111-8111-111111111111',
    title: '<img src=x onerror=alert(1)>',
    stage: 'lead',
    value: 990,
    currency: 'USD',
    company_id: null,
    contact_id: null,
    stage_history: [],
    activities: [{ id: 'a', type: 'note', body: '</textarea><script>alert(1)</script>', occurred_at: '2026-10-24T12:00:00Z' }],
  }, [], []);
  assert.equal(html.includes('<img'), false);
  assert.equal(html.includes('<script>'), false);
  assert.match(html, /&lt;img/);
  const company = renderCompany({
    id: '1',
    name: 'Ok',
    website: 'javascript:alert(1)',
    notes: '',
    contacts: [],
    deals: [],
    activities: [],
  });
  assert.equal(company.includes('href="javascript:'), false);
});

test('migration enables rls and keeps the allowlist helper private', () => {
  const sql = readFileSync(join(root, 'supabase/migrations/20261024035345_crm_init.sql'), 'utf8');
  for (const table of ['companies', 'contacts', 'deals', 'activities', 'deal_stage_history', 'crm_admin_emails']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /function private\.is_crm_admin/);
  assert.equal(sql.includes('raw_user_meta_data'), false);
  assert.equal(/auth\.jwt\(\)[^;]*user_metadata/.test(sql), false);
  assert.equal(/create policy[^\n]+crm_admin_emails/.test(sql), false);
  assert.match(sql, /'audit_call_booked'/);
  assert.match(sql, /'retainer'/);
  const filter = ilikeOr(['title', 'source'], 'a,b%');
  assert.equal(filter.includes(',b'), false);
  assert.match(filter, /title\.ilike\."%a b%"/);
});

test('vercel rewrites multi-segment crm api paths to the catch-all handler', () => {
  const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
  const rewrite = vercel.rewrites?.find((entry) => entry.source?.startsWith('/api/crm/'));
  assert.ok(rewrite, 'expected a CRM API rewrite in vercel.json');
  assert.match(rewrite.source, /:path\*$/);
  assert.equal(rewrite.destination, '/api/crm/[...path]');
});

test('public pages stay free of the admin area', () => {
  const robots = readFileSync(join(root, 'robots.txt'), 'utf8');
  const sitemap = readFileSync(join(root, 'sitemap.xml'), 'utf8');
  const vercel = readFileSync(join(root, 'vercel.json'), 'utf8');
  const home = readFileSync(join(root, 'index.html'), 'utf8');
  assert.match(robots, /Disallow: \/admin/);
  assert.match(robots, /Disallow: \/api\//);
  assert.equal(sitemap.includes('/admin'), false);
  assert.equal(vercel.includes('admin'), false);
  assert.equal(home.includes('/admin'), false);
  const admin = readFileSync(join(root, 'admin/index.html'), 'utf8');
  const login = readFileSync(join(root, 'admin/login.html'), 'utf8');
  assert.match(admin, /noindex, nofollow, noarchive/);
  assert.match(login, /noindex, nofollow, noarchive/);
});

test('javascript files parse', () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.git') continue;
      const path = join(dir, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) walk(path);
      else if (entry.endsWith('.js') || entry.endsWith('.mjs')) files.push(path);
    }
  };
  walk(root);
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${file}\n${result.stderr}`);
  }
});
