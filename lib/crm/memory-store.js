import { randomUUID } from 'node:crypto';
import { httpError } from './http.js';

function nowIso(now) {
  return (now instanceof Date ? now : new Date()).toISOString();
}

function clone(value) {
  return structuredClone(value);
}

export function createMemoryStore() {
  const companies = [];
  const contacts = [];
  const deals = [];
  const activities = [];
  const history = [];

  function requireRow(list, id, label) {
    const row = list.find((item) => item.id === id);
    if (!row) throw httpError(404, 'not_found', `${label} not found.`);
    return row;
  }

  function companySummary(id) {
    if (!id) return null;
    const company = companies.find((item) => item.id === id);
    return company ? { id: company.id, name: company.name, website: company.website } : null;
  }

  function contactSummary(id) {
    if (!id) return null;
    const contact = contacts.find((item) => item.id === id);
    return contact ? { id: contact.id, name: contact.name, email: contact.email } : null;
  }

  function presentDeal(deal, { detail = false } = {}) {
    const base = {
      ...clone(deal),
      company: companySummary(deal.company_id),
      contact: contactSummary(deal.contact_id),
    };
    if (!detail) return base;
    return {
      ...base,
      activities: activities
        .filter((item) => item.deal_id === deal.id)
        .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
        .map(clone),
      stage_history: history
        .filter((item) => item.deal_id === deal.id)
        .sort((a, b) => a.changed_at.localeCompare(b.changed_at))
        .map(clone),
    };
  }

  function page(rows, { limit, offset }) {
    return { data: rows.slice(offset, offset + limit).map(clone), count: rows.length };
  }

  function needle(q) {
    return String(q || '').trim().toLowerCase();
  }

  function includes(q, values) {
    const term = needle(q);
    if (!term) return true;
    return values.some((value) => String(value || '').toLowerCase().includes(term));
  }

  function applyStage(deal, previous, now) {
    if (previous === deal.stage && previous != null) return;
    history.push({
      id: randomUUID(),
      deal_id: deal.id,
      from_stage: previous,
      to_stage: deal.stage,
      changed_at: now,
    });
    if (deal.stage === 'won') {
      deal.won_at = now;
      deal.lost_at = null;
    } else if (deal.stage === 'lost') {
      deal.lost_at = now;
      deal.won_at = null;
    }
  }

  return {
    async listCompanies({ q, limit, offset }) {
      const rows = companies
        .filter((company) => includes(q, [company.name, company.website, company.notes]))
        .sort((a, b) => a.name.localeCompare(b.name));
      return page(rows, { limit, offset });
    },
    async getCompany(id) {
      const company = requireRow(companies, id, 'Company');
      const companyContacts = contacts.filter((contact) => contact.company_id === id);
      const companyDeals = deals.filter((deal) => deal.company_id === id);
      const contactIds = new Set(companyContacts.map((contact) => contact.id));
      const dealIds = new Set(companyDeals.map((deal) => deal.id));
      return {
        ...clone(company),
        contacts: companyContacts.map(clone),
        deals: companyDeals.map((deal) => presentDeal(deal)),
        activities: activities
          .filter((item) => contactIds.has(item.contact_id) || dealIds.has(item.deal_id))
          .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
          .map(clone),
      };
    },
    async createCompany(fields, now = new Date()) {
      const stamp = nowIso(now);
      const row = {
        id: randomUUID(),
        name: fields.name,
        website: fields.website ?? null,
        notes: fields.notes ?? null,
        created_at: stamp,
        updated_at: stamp,
      };
      companies.push(row);
      return clone(row);
    },
    async updateCompany(id, fields, now = new Date()) {
      const row = requireRow(companies, id, 'Company');
      Object.assign(row, fields, { updated_at: nowIso(now) });
      return this.getCompany(id);
    },
    async listContacts({ q, company_id: companyId, limit, offset }) {
      const rows = contacts
        .filter((contact) => !companyId || contact.company_id === companyId)
        .filter((contact) => includes(q, [contact.name, contact.email, contact.role, contact.phone]))
        .sort((a, b) => a.name.localeCompare(b.name));
      return {
        data: rows.slice(offset, offset + limit).map((contact) => ({
          ...clone(contact),
          company: companySummary(contact.company_id),
        })),
        count: rows.length,
      };
    },
    async getContact(id) {
      const contact = requireRow(contacts, id, 'Contact');
      return {
        ...clone(contact),
        company: companySummary(contact.company_id),
        deals: deals.filter((deal) => deal.contact_id === id).map((deal) => presentDeal(deal)),
        activities: activities
          .filter((item) => item.contact_id === id)
          .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
          .map(clone),
      };
    },
    async createContact(fields, now = new Date()) {
      if (fields.company_id) requireRow(companies, fields.company_id, 'Company');
      const stamp = nowIso(now);
      const row = {
        id: randomUUID(),
        company_id: fields.company_id ?? null,
        name: fields.name,
        email: fields.email ?? null,
        phone: fields.phone ?? null,
        role: fields.role ?? null,
        notes: fields.notes ?? null,
        created_at: stamp,
        updated_at: stamp,
      };
      contacts.push(row);
      return this.getContact(row.id);
    },
    async updateContact(id, fields, now = new Date()) {
      const row = requireRow(contacts, id, 'Contact');
      if (fields.company_id) requireRow(companies, fields.company_id, 'Company');
      Object.assign(row, fields, { updated_at: nowIso(now) });
      return this.getContact(id);
    },
    async listDeals({ q, stage, company_id: companyId, contact_id: contactId, limit, offset }) {
      const rows = deals
        .filter((deal) => !stage || deal.stage === stage)
        .filter((deal) => !companyId || deal.company_id === companyId)
        .filter((deal) => !contactId || deal.contact_id === contactId)
        .filter((deal) => includes(q, [
          deal.title,
          deal.source,
          deal.next_step,
          companySummary(deal.company_id)?.name,
          contactSummary(deal.contact_id)?.name,
          contactSummary(deal.contact_id)?.email,
        ]))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      return {
        data: rows.slice(offset, offset + limit).map((deal) => presentDeal(deal)),
        count: rows.length,
      };
    },
    async getDeal(id) {
      return presentDeal(requireRow(deals, id, 'Deal'), { detail: true });
    },
    async createDeal(fields, now = new Date()) {
      if (fields.company_id) requireRow(companies, fields.company_id, 'Company');
      if (fields.contact_id) requireRow(contacts, fields.contact_id, 'Contact');
      const stamp = nowIso(now);
      const row = {
        id: randomUUID(),
        title: fields.title,
        company_id: fields.company_id ?? null,
        contact_id: fields.contact_id ?? null,
        stage: fields.stage || 'lead',
        value: fields.value ?? 0,
        currency: fields.currency || 'USD',
        source: fields.source ?? null,
        next_step: fields.next_step ?? null,
        next_step_date: fields.next_step_date ?? null,
        won_at: null,
        lost_at: null,
        created_at: stamp,
        updated_at: stamp,
      };
      applyStage(row, null, stamp);
      deals.push(row);
      return this.getDeal(row.id);
    },
    async updateDeal(id, fields, now = new Date()) {
      const row = requireRow(deals, id, 'Deal');
      if (fields.company_id) requireRow(companies, fields.company_id, 'Company');
      if (fields.contact_id) requireRow(contacts, fields.contact_id, 'Contact');
      const previous = row.stage;
      const stamp = nowIso(now);
      Object.assign(row, fields, { updated_at: stamp });
      if (fields.stage && fields.stage !== previous) applyStage(row, previous, stamp);
      return this.getDeal(id);
    },
    async listActivities({ deal_id: dealId, contact_id: contactId, limit, offset }) {
      const rows = activities
        .filter((item) => !dealId || item.deal_id === dealId)
        .filter((item) => !contactId || item.contact_id === contactId)
        .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
      return page(rows, { limit, offset });
    },
    async createActivity(fields, now = new Date()) {
      if (fields.deal_id) requireRow(deals, fields.deal_id, 'Deal');
      if (fields.contact_id) requireRow(contacts, fields.contact_id, 'Contact');
      const stamp = nowIso(now);
      const row = {
        id: randomUUID(),
        deal_id: fields.deal_id ?? null,
        contact_id: fields.contact_id ?? null,
        type: fields.type || 'note',
        body: fields.body,
        occurred_at: fields.occurred_at || stamp,
        created_at: stamp,
        updated_at: stamp,
      };
      activities.push(row);
      return clone(row);
    },
  };
}
