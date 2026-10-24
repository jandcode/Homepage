import { ACTIVITY_TYPES, STAGES } from './constants.js';
import { httpError } from './http.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === 'string' && UUID.test(value);
}

function fail(fields) {
  throw httpError(400, 'validation_error', 'Check the highlighted fields.', fields);
}

function takeText(body, key, { max, required }, partial, fields, value) {
  if (partial && !(key in body)) return;
  const raw = body[key];
  if (raw == null || raw === '') {
    if (required) fields[key] = 'Required.';
    else value[key] = null;
    return;
  }
  if (typeof raw !== 'string') {
    fields[key] = 'Must be text.';
    return;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    if (required) fields[key] = 'Required.';
    else value[key] = null;
    return;
  }
  if (trimmed.length > max) {
    fields[key] = `Must be ${max} characters or fewer.`;
    return;
  }
  value[key] = trimmed;
}

function takeEmail(body, key, partial, fields, value) {
  if (partial && !(key in body)) return;
  const raw = body[key];
  if (raw == null || raw === '') {
    value[key] = null;
    return;
  }
  if (typeof raw !== 'string') {
    fields[key] = 'Must be an email address.';
    return;
  }
  const email = raw.trim().toLowerCase();
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fields[key] = 'Must be an email address.';
    return;
  }
  value[key] = email;
}

function takeUuid(body, key, partial, fields, value) {
  if (partial && !(key in body)) return;
  const raw = body[key];
  if (raw == null || raw === '') {
    value[key] = null;
    return;
  }
  if (!isUuid(raw)) {
    fields[key] = 'Must be an id.';
    return;
  }
  value[key] = raw.toLowerCase();
}

function takeMoney(body, key, partial, fields, value, { defaultZero }) {
  if (partial && !(key in body)) return;
  const raw = body[key];
  if (raw == null || raw === '') {
    if (defaultZero) value[key] = 0;
    return;
  }
  const number = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : NaN;
  if (!Number.isFinite(number) || number < 0 || number > 9_999_999_999.99) {
    fields[key] = 'Enter a value of 0 or more.';
    return;
  }
  value[key] = Math.round(number * 100) / 100;
}

function takeCurrency(body, partial, fields, value, { defaultUsd }) {
  if (partial && !('currency' in body)) return;
  const raw = body.currency;
  if (raw == null || raw === '') {
    if (defaultUsd) value.currency = 'USD';
    else if (!partial) value.currency = 'USD';
    return;
  }
  if (typeof raw !== 'string' || !/^[A-Za-z]{3}$/.test(raw.trim())) {
    fields.currency = 'Use a 3-letter currency code.';
    return;
  }
  value.currency = raw.trim().toUpperCase();
}

function takeStage(body, partial, fields, value, { defaultStage }) {
  if (partial && !('stage' in body)) return;
  const raw = body.stage;
  if ((raw == null || raw === '') && defaultStage) {
    value.stage = 'lead';
    return;
  }
  if (typeof raw !== 'string' || !STAGES.includes(raw)) {
    fields.stage = `Stage must be one of: ${STAGES.join(', ')}.`;
    return;
  }
  value.stage = raw;
}

function takeDay(body, key, partial, fields, value) {
  if (partial && !(key in body)) return;
  const raw = body[key];
  if (raw == null || raw === '') {
    value[key] = null;
    return;
  }
  if (typeof raw !== 'string' || !isYmd(raw)) {
    fields[key] = 'Use a YYYY-MM-DD date.';
    return;
  }
  value[key] = raw;
}

function isYmd(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validateCompany(body, { partial = false } = {}) {
  const fields = {};
  const value = {};
  takeText(body, 'name', { max: 200, required: true }, partial, fields, value);
  takeText(body, 'website', { max: 500 }, partial, fields, value);
  takeText(body, 'notes', { max: 20000 }, partial, fields, value);
  if (Object.keys(fields).length) fail(fields);
  return value;
}

export function validateContact(body, { partial = false } = {}) {
  const fields = {};
  const value = {};
  takeText(body, 'name', { max: 200, required: true }, partial, fields, value);
  takeEmail(body, 'email', partial, fields, value);
  takeText(body, 'phone', { max: 50 }, partial, fields, value);
  takeText(body, 'role', { max: 120 }, partial, fields, value);
  takeText(body, 'notes', { max: 20000 }, partial, fields, value);
  takeUuid(body, 'company_id', partial, fields, value);
  if (Object.keys(fields).length) fail(fields);
  return value;
}

export function validateDeal(body, { partial = false } = {}) {
  const fields = {};
  const value = {};
  const nested = {};
  takeText(body, 'title', { max: 200, required: true }, partial, fields, value);
  takeStage(body, partial, fields, value, { defaultStage: !partial });
  takeMoney(body, 'value', partial, fields, value, { defaultZero: !partial });
  takeCurrency(body, partial, fields, value, { defaultUsd: !partial });
  takeText(body, 'source', { max: 200 }, partial, fields, value);
  takeText(body, 'next_step', { max: 500 }, partial, fields, value);
  takeDay(body, 'next_step_date', partial, fields, value);
  takeUuid(body, 'company_id', partial, fields, value);
  takeUuid(body, 'contact_id', partial, fields, value);
  if (!partial) {
    if ('company_name' in body) takeText(body, 'company_name', { max: 200 }, false, fields, nested);
    if ('contact_name' in body) takeText(body, 'contact_name', { max: 200 }, false, fields, nested);
    if ('contact_email' in body) takeEmail(body, 'contact_email', false, fields, nested);
    if (!nested.contact_name && nested.contact_email) nested.contact_name = nested.contact_email;
  } else if ('company_name' in body || 'contact_name' in body || 'contact_email' in body) {
    fields.company_name = 'Link a company or contact with company_id and contact_id.';
  }
  if (Object.keys(fields).length) fail(fields);
  return { deal: value, nested };
}

export function validateStage(body) {
  const fields = {};
  const value = {};
  takeStage(body, false, fields, value, { defaultStage: false });
  if (Object.keys(fields).length) fail(fields);
  return value.stage;
}

export function validateActivity(body, defaults = {}) {
  const fields = {};
  const value = { ...defaults };
  const type = body.type == null || body.type === '' ? 'note' : body.type;
  if (typeof type !== 'string' || !ACTIVITY_TYPES.includes(type)) {
    fields.type = `Type must be one of: ${ACTIVITY_TYPES.join(', ')}.`;
  } else {
    value.type = type;
  }
  takeText(body, 'body', { max: 20000, required: true }, false, fields, value);
  if ('occurred_at' in body && body.occurred_at != null && body.occurred_at !== '') {
    const stamp = Date.parse(body.occurred_at);
    if (!Number.isFinite(stamp)) fields.occurred_at = 'Use an ISO timestamp.';
    else value.occurred_at = new Date(stamp).toISOString();
  }
  if (!('deal_id' in defaults)) takeUuid(body, 'deal_id', false, fields, value);
  if (!('contact_id' in defaults)) takeUuid(body, 'contact_id', false, fields, value);
  if (!value.deal_id && !value.contact_id) {
    fields.deal_id = 'Link the activity to a deal or a contact.';
  }
  if (Object.keys(fields).length) fail(fields);
  return value;
}

export function validateListQuery(searchParams) {
  const fields = {};
  const limitRaw = searchParams.get('limit');
  const offsetRaw = searchParams.get('offset');
  let limit = 50;
  let offset = 0;
  if (limitRaw != null && limitRaw !== '') {
    if (!/^\d+$/.test(limitRaw)) fields.limit = 'limit must be a whole number.';
    else limit = Math.min(200, Math.max(1, Number(limitRaw)));
  }
  if (offsetRaw != null && offsetRaw !== '') {
    if (!/^\d+$/.test(offsetRaw)) fields.offset = 'offset must be a whole number.';
    else offset = Number(offsetRaw);
  }
  const stage = searchParams.get('stage');
  if (stage && !STAGES.includes(stage)) fields.stage = 'Unknown stage.';
  const q = (searchParams.get('q') || '').trim();
  if (q.length > 100) fields.q = 'Search must be 100 characters or fewer.';
  for (const key of ['company_id', 'contact_id', 'deal_id']) {
    const id = searchParams.get(key);
    if (id && !isUuid(id)) fields[key] = 'Must be an id.';
  }
  if (Object.keys(fields).length) fail(fields);
  return {
    limit,
    offset,
    q,
    stage: stage || null,
    company_id: searchParams.get('company_id')?.toLowerCase() || null,
    contact_id: searchParams.get('contact_id')?.toLowerCase() || null,
    deal_id: searchParams.get('deal_id')?.toLowerCase() || null,
  };
}

export function validateInbound(body) {
  const fields = {};
  const value = {};
  const honeypot = typeof body.company_url === 'string' ? body.company_url.trim() : '';
  if (honeypot) return { dropped: true };
  takeText(body, 'name', { max: 200 }, false, fields, value);
  takeEmail(body, 'email', false, fields, value);
  takeText(body, 'phone', { max: 50 }, false, fields, value);
  takeText(body, 'company', { max: 200 }, false, fields, value);
  takeText(body, 'message', { max: 20000 }, false, fields, value);
  if (!value.name && !value.email) fields.name = 'Name or email is required.';
  if (Object.keys(fields).length) fail(fields);
  return { dropped: false, value };
}
