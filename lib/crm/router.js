import {
  clientIp,
  flagEnabled,
  isAllowlisted,
  parseAllowlist,
  readBearer,
  safeEqual,
  sameOriginWrite,
} from './auth.js';
import { parseCookies } from './cookies.js';
import { buildDashboard } from './dashboard.js';
import { resolveTimeZone } from './dates.js';
import { errorBody, httpError, json, readJson, requireJson } from './http.js';
import {
  isUuid,
  validateActivity,
  validateCompany,
  validateContact,
  validateDeal,
  validateInbound,
  validateListQuery,
  validateStage,
} from './validate.js';

function crmPath(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path !== '/api/crm' && !path.startsWith('/api/crm/')) return null;
  return path.slice('/api/crm'.length).replace(/^\//, '');
}

function methodNotAllowed(allow) {
  return json(405, errorBody('method_not_allowed', 'Method not allowed.'), { allow: allow.join(', ') });
}

function toErrorResponse(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = error?.code || 'internal_error';
  const message = error?.expose ? error.message : 'Something went wrong.';
  if (!error?.expose) console.error(error);
  return json(status, errorBody(code, message, error?.fields));
}

async function authenticate(request, deps) {
  const bearer = readBearer(request.headers.get('authorization'));
  if (request.headers.get('authorization')) {
    if (!bearer || !deps.env.CRM_API_KEY || !safeEqual(bearer, deps.env.CRM_API_KEY)) {
      return { ok: false, status: 401, code: 'unauthorized', message: 'Missing or invalid credentials.' };
    }
    return { ok: true, via: 'api_key' };
  }
  const cookies = parseCookies(request.headers.get('cookie'));
  if (!cookies.crm_access) {
    return { ok: false, status: 401, code: 'unauthorized', message: 'Missing or invalid credentials.' };
  }
  const user = await deps.verifyAccessToken(cookies.crm_access);
  if (!user?.email) {
    return { ok: false, status: 401, code: 'unauthorized', message: 'Missing or invalid credentials.' };
  }
  if (!isAllowlisted(user.email, parseAllowlist(deps.env.CRM_ADMIN_EMAILS))) {
    return { ok: false, status: 403, code: 'forbidden', message: 'This account is not allowed to use the CRM.' };
  }
  return { ok: true, via: 'session', email: user.email };
}

function parseId(path, prefix) {
  const rest = path.slice(prefix.length);
  const [id, extra = ''] = rest.split('/');
  if (!isUuid(id) || rest.split('/').length > 2) throw httpError(404, 'not_found', 'Not found.');
  return { id: id.toLowerCase(), extra };
}

export async function handleCrmRequest(request, deps) {
  try {
    const url = new URL(request.url);
    const path = crmPath(url.pathname);
    if (path == null) return json(404, errorBody('not_found', 'Not found.'));
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { allow: 'GET, POST, PATCH, OPTIONS', 'x-robots-tag': 'noindex' },
      });
    }
    if (path === 'inbound/contact') return inbound(request, deps);

    const actor = await authenticate(request, deps);
    if (!actor.ok) return json(actor.status, errorBody(actor.code, actor.message));
    if (actor.via === 'session' && request.method !== 'GET' && request.method !== 'HEAD') {
      if (!sameOriginWrite(request)) return json(403, errorBody('forbidden', 'Cross-site writes are blocked.'));
    }
    return await dispatch(request, path, url.searchParams, deps);
  } catch (error) {
    return toErrorResponse(error);
  }
}

async function dispatch(request, path, searchParams, deps) {
  if (path === 'dashboard') return dashboard(request, deps);
  if (path === 'search') return search(request, searchParams, deps);
  if (path === 'deals') return deals(request, searchParams, deps);
  if (path === 'contacts') return contacts(request, searchParams, deps);
  if (path === 'companies') return companies(request, searchParams, deps);
  if (path === 'activities') return activityCollection(request, searchParams, deps);
  if (path.startsWith('deals/')) return dealItem(request, path, deps);
  if (path.startsWith('contacts/')) return contactItem(request, path, deps);
  if (path.startsWith('companies/')) return companyItem(request, path, deps);
  return json(404, errorBody('not_found', 'Not found.'));
}

async function dashboard(request, deps) {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  const { data, count } = await deps.store.listDeals({ limit: 5000, offset: 0 });
  const summary = buildDashboard(data, deps.now(), resolveTimeZone(deps.env.CRM_TIMEZONE));
  summary.truncated = count > data.length;
  return json(200, { data: summary });
}

async function search(request, searchParams, deps) {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  const query = validateListQuery(searchParams);
  if (!query.q) throw httpError(400, 'validation_error', 'Provide a search query.', { q: 'Required.' });
  const list = { ...query, limit: 20, offset: 0 };
  const [deals, contacts, companies] = await Promise.all([
    deps.store.listDeals(list),
    deps.store.listContacts(list),
    deps.store.listCompanies(list),
  ]);
  return json(200, {
    data: { deals: deals.data, contacts: contacts.data, companies: companies.data },
  });
}

async function deals(request, searchParams, deps) {
  if (request.method === 'GET') {
    const query = validateListQuery(searchParams);
    const result = await deps.store.listDeals(query);
    return json(200, result);
  }
  if (request.method === 'POST') {
    requireJson(request);
    const { deal, nested } = validateDeal(await readJson(request));
    if (nested.company_name && !deal.company_id) {
      const company = await deps.store.createCompany({ name: nested.company_name }, deps.now());
      deal.company_id = company.id;
    }
    if (nested.contact_name && !deal.contact_id) {
      const contact = await deps.store.createContact({
        name: nested.contact_name,
        email: nested.contact_email ?? null,
        company_id: deal.company_id ?? null,
      }, deps.now());
      deal.contact_id = contact.id;
    }
    const created = await deps.store.createDeal(deal, deps.now());
    return json(201, { data: created });
  }
  return methodNotAllowed(['GET', 'POST']);
}

async function dealItem(request, path, deps) {
  const { id, extra } = parseId(path, 'deals/');
  if (extra === 'stage') {
    if (request.method !== 'POST') return methodNotAllowed(['POST']);
    requireJson(request);
    const stage = validateStage(await readJson(request));
    return json(200, { data: await deps.store.updateDeal(id, { stage }, deps.now()) });
  }
  if (extra === 'activities') {
    if (request.method !== 'POST') return methodNotAllowed(['POST']);
    requireJson(request);
    const deal = await deps.store.getDeal(id);
    const activity = validateActivity(await readJson(request), { deal_id: id });
    if (!activity.contact_id && deal.contact_id) activity.contact_id = deal.contact_id;
    return json(201, { data: await deps.store.createActivity(activity, deps.now()) });
  }
  if (extra) return json(404, errorBody('not_found', 'Not found.'));
  if (request.method === 'GET') return json(200, { data: await deps.store.getDeal(id) });
  if (request.method === 'PATCH') {
    requireJson(request);
    const { deal } = validateDeal(await readJson(request), { partial: true });
    if (!Object.keys(deal).length) {
      throw httpError(400, 'validation_error', 'Provide at least one field to update.');
    }
    return json(200, { data: await deps.store.updateDeal(id, deal, deps.now()) });
  }
  return methodNotAllowed(['GET', 'PATCH']);
}

async function contacts(request, searchParams, deps) {
  if (request.method === 'GET') {
    return json(200, await deps.store.listContacts(validateListQuery(searchParams)));
  }
  if (request.method === 'POST') {
    requireJson(request);
    const created = await deps.store.createContact(validateContact(await readJson(request)), deps.now());
    return json(201, { data: created });
  }
  return methodNotAllowed(['GET', 'POST']);
}

async function contactItem(request, path, deps) {
  const { id, extra } = parseId(path, 'contacts/');
  if (extra) return json(404, errorBody('not_found', 'Not found.'));
  if (request.method === 'GET') return json(200, { data: await deps.store.getContact(id) });
  if (request.method === 'PATCH') {
    requireJson(request);
    const fields = validateContact(await readJson(request), { partial: true });
    if (!Object.keys(fields).length) throw httpError(400, 'validation_error', 'Provide at least one field to update.');
    return json(200, { data: await deps.store.updateContact(id, fields, deps.now()) });
  }
  return methodNotAllowed(['GET', 'PATCH']);
}

async function companies(request, searchParams, deps) {
  if (request.method === 'GET') {
    return json(200, await deps.store.listCompanies(validateListQuery(searchParams)));
  }
  if (request.method === 'POST') {
    requireJson(request);
    const created = await deps.store.createCompany(validateCompany(await readJson(request)), deps.now());
    return json(201, { data: created });
  }
  return methodNotAllowed(['GET', 'POST']);
}

async function companyItem(request, path, deps) {
  const { id, extra } = parseId(path, 'companies/');
  if (extra) return json(404, errorBody('not_found', 'Not found.'));
  if (request.method === 'GET') return json(200, { data: await deps.store.getCompany(id) });
  if (request.method === 'PATCH') {
    requireJson(request);
    const fields = validateCompany(await readJson(request), { partial: true });
    if (!Object.keys(fields).length) throw httpError(400, 'validation_error', 'Provide at least one field to update.');
    return json(200, { data: await deps.store.updateCompany(id, fields, deps.now()) });
  }
  return methodNotAllowed(['GET', 'PATCH']);
}

async function activityCollection(request, searchParams, deps) {
  if (request.method === 'GET') {
    const query = validateListQuery(searchParams);
    if (!query.deal_id && !query.contact_id) {
      throw httpError(400, 'validation_error', 'Filter activities by deal_id or contact_id.', {
        deal_id: 'Required without contact_id.',
      });
    }
    return json(200, await deps.store.listActivities(query));
  }
  if (request.method === 'POST') {
    requireJson(request);
    const created = await deps.store.createActivity(validateActivity(await readJson(request)), deps.now());
    return json(201, { data: created });
  }
  return methodNotAllowed(['GET', 'POST']);
}

async function inbound(request, deps) {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  if (!flagEnabled(deps.env.CRM_CONTACT_TO_LEAD)) return json(404, errorBody('not_found', 'Not found.'));
  if (deps.rateLimit && !deps.rateLimit(`inbound:${clientIp(request)}`, deps.now())) {
    return json(429, errorBody('rate_limited', 'Too many inquiries. Try again later.'));
  }
  requireJson(request);
  const parsed = validateInbound(await readJson(request));
  if (parsed.dropped) return json(202, { data: { accepted: true } });
  const { value } = parsed;
  let companyId = null;
  if (value.company) {
    const company = await deps.store.createCompany({ name: value.company }, deps.now());
    companyId = company.id;
  }
  const contact = await deps.store.createContact({
    name: value.name || value.email,
    email: value.email ?? null,
    phone: value.phone ?? null,
    company_id: companyId,
  }, deps.now());
  const who = value.company || value.name || value.email;
  const deal = await deps.store.createDeal({
    title: `${who} website inquiry`.slice(0, 200),
    company_id: companyId,
    contact_id: contact.id,
    stage: 'lead',
    value: 0,
    currency: 'USD',
    source: 'website',
    next_step: 'Reply to website inquiry',
  }, deps.now());
  if (value.message) {
    await deps.store.createActivity({
      deal_id: deal.id,
      contact_id: contact.id,
      type: 'note',
      body: value.message,
    }, deps.now());
  }
  return json(201, { data: { accepted: true } });
}
