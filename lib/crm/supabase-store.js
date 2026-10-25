import { httpError } from './http.js';

const COMPANY = 'id, name, website, notes, created_at, updated_at';
const CONTACT = 'id, company_id, name, email, phone, role, notes, created_at, updated_at';
const DEAL = 'id, title, company_id, contact_id, stage, value, currency, source, next_step, next_step_date, won_at, lost_at, created_at, updated_at';
const ACTIVITY = 'id, deal_id, contact_id, type, body, occurred_at, created_at, updated_at';
const HISTORY = 'id, deal_id, from_stage, to_stage, changed_at';

function asNumber(value) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}

function one(value) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function mapDbError(error) {
  if (!error) return null;
  if (error.status) return error;
  if (error.code === 'PGRST116') return httpError(404, 'not_found', 'Record not found.');
  if (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST204') {
    return httpError(503, 'not_ready', 'CRM tables are missing. Run the Supabase migrations.');
  }
  if (error.code === '23503') return httpError(400, 'validation_error', 'That company or contact does not exist.');
  if (error.code === '23514') return httpError(400, 'validation_error', 'A field did not match the CRM rules.');
  console.error('crm database error', error.code || '', error.message || error);
  return httpError(500, 'database_error', 'The CRM database request failed.');
}

async function run(query) {
  const { data, error, count } = await query;
  if (error) throw mapDbError(error);
  return { data, count };
}

async function matchingIds(client, table, columns, q) {
  const filter = ilikeOr(columns, q);
  if (!filter) return [];
  const { data, error } = await client.from(table).select('id').or(filter).limit(50);
  if (error) throw mapDbError(error);
  return (data || []).map((row) => row.id);
}

export function ilikeOr(columns, raw) {
  const cleaned = String(raw || '').replace(/[%_,()"\\]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  const pattern = `"%${cleaned}%"`;
  return columns.map((column) => `${column}.ilike.${pattern}`).join(',');
}

function mapDeal(row, { detail = false } = {}) {
  const deal = {
    ...row,
    value: asNumber(row.value),
    company: one(row.company),
    contact: one(row.contact),
  };
  if (!detail) {
    delete deal.activities;
    delete deal.stage_history;
    return deal;
  }
  deal.activities = (row.activities || [])
    .map((item) => ({ ...item }))
    .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)));
  deal.stage_history = (row.stage_history || [])
    .map((item) => ({ ...item }))
    .sort((a, b) => String(a.changed_at).localeCompare(String(b.changed_at)));
  return deal;
}

function mapContact(row) {
  return { ...row, company: one(row.company) };
}

export function createSupabaseStore(client) {
  async function mustOne(query, label) {
    const { data, error } = await query.maybeSingle();
    if (error) throw mapDbError(error);
    if (!data) throw httpError(404, 'not_found', `${label} not found.`);
    return data;
  }

  return {
    async listCompanies({ q, limit, offset }) {
      let query = client.from('companies').select(COMPANY, { count: 'exact' });
      const filter = q ? ilikeOr(['name', 'website', 'notes'], q) : null;
      if (filter) query = query.or(filter);
      const { data, count } = await run(
        query.order('name', { ascending: true }).range(offset, offset + limit - 1),
      );
      return { data, count: count ?? data.length };
    },
    async getCompany(id) {
      const company = await mustOne(
        client.from('companies').select(`${COMPANY}, contacts(${CONTACT}), deals(${DEAL}, company:companies(id, name), contact:contacts(id, name, email))`).eq('id', id),
        'Company',
      );
      const contactIds = (company.contacts || []).map((contact) => contact.id);
      const dealIds = (company.deals || []).map((deal) => deal.id);
      let activityQuery = client.from('activities').select(ACTIVITY).order('occurred_at', { ascending: false }).limit(200);
      const ors = [];
      if (contactIds.length) ors.push(`contact_id.in.(${contactIds.join(',')})`);
      if (dealIds.length) ors.push(`deal_id.in.(${dealIds.join(',')})`);
      const activities = ors.length ? (await run(activityQuery.or(ors.join(',')))).data : [];
      return {
        ...company,
        deals: (company.deals || []).map((deal) => mapDeal(deal)),
        activities,
      };
    },
    async createCompany(fields) {
      const data = await mustOne(client.from('companies').insert(fields).select(COMPANY), 'Company');
      return data;
    },
    async updateCompany(id, fields) {
      await mustOne(client.from('companies').update(fields).eq('id', id).select('id'), 'Company');
      return this.getCompany(id);
    },
    async listContacts({ q, company_id: companyId, limit, offset }) {
      let query = client.from('contacts').select(`${CONTACT}, company:companies(id, name)`, { count: 'exact' });
      if (companyId) query = query.eq('company_id', companyId);
      const filter = q ? ilikeOr(['name', 'email', 'role', 'phone'], q) : null;
      if (filter) query = query.or(filter);
      const { data, count } = await run(
        query.order('name', { ascending: true }).range(offset, offset + limit - 1),
      );
      return { data: data.map(mapContact), count: count ?? data.length };
    },
    async getContact(id) {
      const contact = await mustOne(
        client.from('contacts').select(`${CONTACT}, company:companies(id, name, website), deals(${DEAL}, company:companies(id, name), contact:contacts(id, name, email))`).eq('id', id),
        'Contact',
      );
      const { data: activityRows } = await run(
        client.from('activities').select(ACTIVITY).eq('contact_id', id).order('occurred_at', { ascending: false }).limit(200),
      );
      return {
        ...mapContact(contact),
        deals: (contact.deals || []).map((deal) => mapDeal(deal)),
        activities: activityRows,
      };
    },
    async createContact(fields) {
      const created = await mustOne(client.from('contacts').insert(fields).select('id'), 'Contact');
      return this.getContact(created.id);
    },
    async updateContact(id, fields) {
      await mustOne(client.from('contacts').update(fields).eq('id', id).select('id'), 'Contact');
      return this.getContact(id);
    },
    async listDeals({ q, stage, company_id: companyId, contact_id: contactId, limit, offset }) {
      let query = client.from('deals').select(
        `${DEAL}, company:companies(id, name), contact:contacts(id, name, email)`,
        { count: 'exact' },
      );
      if (stage) query = query.eq('stage', stage);
      if (companyId) query = query.eq('company_id', companyId);
      if (contactId) query = query.eq('contact_id', contactId);
      if (q) {
        const parts = [];
        const own = ilikeOr(['title', 'source', 'next_step'], q);
        if (own) parts.push(own);
        const companyIds = await matchingIds(client, 'companies', ['name'], q);
        const contactIds = await matchingIds(client, 'contacts', ['name', 'email'], q);
        if (companyIds.length) parts.push(`company_id.in.(${companyIds.join(',')})`);
        if (contactIds.length) parts.push(`contact_id.in.(${contactIds.join(',')})`);
        if (parts.length) query = query.or(parts.join(','));
      }
      const { data, count } = await run(
        query.order('updated_at', { ascending: false }).range(offset, offset + limit - 1),
      );
      return { data: data.map((row) => mapDeal(row)), count: count ?? data.length };
    },
    async getDeal(id) {
      const row = await mustOne(
        client.from('deals').select(
          `${DEAL}, company:companies(id, name, website), contact:contacts(id, name, email, phone, role), activities(${ACTIVITY}), stage_history:deal_stage_history(${HISTORY})`,
        ).eq('id', id),
        'Deal',
      );
      return mapDeal(row, { detail: true });
    },
    async createDeal(fields) {
      const created = await mustOne(client.from('deals').insert(fields).select('id'), 'Deal');
      return this.getDeal(created.id);
    },
    async updateDeal(id, fields) {
      await mustOne(client.from('deals').update(fields).eq('id', id).select('id'), 'Deal');
      return this.getDeal(id);
    },
    async listActivities({ deal_id: dealId, contact_id: contactId, limit, offset }) {
      let query = client.from('activities').select(ACTIVITY, { count: 'exact' });
      if (dealId) query = query.eq('deal_id', dealId);
      if (contactId) query = query.eq('contact_id', contactId);
      const { data, count } = await run(
        query.order('occurred_at', { ascending: false }).range(offset, offset + limit - 1),
      );
      return { data, count: count ?? data.length };
    },
    async createActivity(fields) {
      return mustOne(client.from('activities').insert(fields).select(ACTIVITY), 'Activity');
    },
  };
}
