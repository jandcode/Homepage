import { stageLabel } from './html.js';
import {
  renderCompanies,
  renderCompany,
  renderContact,
  renderContacts,
  renderDashboard,
  renderDeal,
  renderDeals,
  renderMessage,
  renderPipeline,
  renderSearch,
} from './render.js';

const view = document.querySelector('#view');
const flashBox = document.querySelector('#flash');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let renderToken = 0;
let pipelineStage = 'lead';

function readRoute() {
  const raw = (location.hash || '#/').replace(/^#/, '') || '/';
  const url = new URL(raw.startsWith('/') ? raw : `/${raw}`, 'https://jdcode.dev');
  return {
    pathname: url.pathname.replace(/\/+$/, '') || '/',
    params: url.searchParams,
  };
}

function section(pathname) {
  if (pathname.startsWith('/deals')) return 'deals';
  if (pathname.startsWith('/pipeline')) return 'pipeline';
  if (pathname.startsWith('/contacts')) return 'contacts';
  if (pathname.startsWith('/companies')) return 'companies';
  if (pathname.startsWith('/search')) return 'search';
  return 'dashboard';
}

function highlight(pathname) {
  const name = section(pathname);
  for (const link of document.querySelectorAll('[data-nav]')) {
    link.classList.toggle('current', link.dataset.nav === name);
  }
  const title = {
    dashboard: 'Dashboard',
    pipeline: 'Pipeline',
    deals: 'Deals',
    contacts: 'Contacts',
    companies: 'Companies',
    search: 'Search',
  }[name];
  document.title = `${title} — JDCODE CRM`;
}

function flash(message, bad = false) {
  flashBox.textContent = message || '';
  flashBox.classList.toggle('bad', Boolean(bad && message));
}

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: {
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
      credentials: 'same-origin',
    });
  } catch {
    throw Object.assign(new Error('Could not reach the CRM.'), { status: 0 });
  }
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) {
    const next = `${location.pathname}${location.search}${location.hash}`;
    location.href = `/admin/login?next=${encodeURIComponent(next)}`;
    throw Object.assign(new Error('Sign in required.'), { status: 401 });
  }
  if (!response.ok) {
    const fields = body.error?.fields ? Object.values(body.error.fields).join(' ') : '';
    throw Object.assign(new Error(fields || body.error?.message || 'Request failed.'), {
      status: response.status,
      body,
    });
  }
  return body;
}

function formData(form) {
  const data = {};
  for (const [key, value] of new FormData(form)) {
    data[key] = typeof value === 'string' ? value.trim() : value;
  }
  return data;
}

async function page(route) {
  const { pathname, params } = route;
  const dealId = pathname.match(/^\/deals\/([0-9a-f-]{36})$/i);
  const contactId = pathname.match(/^\/contacts\/([0-9a-f-]{36})$/i);
  const companyId = pathname.match(/^\/companies\/([0-9a-f-]{36})$/i);
  if (pathname === '/' || pathname === '/dashboard') {
    return renderDashboard((await api('/api/crm/dashboard')).data);
  }
  if (pathname === '/pipeline') {
    const result = await api('/api/crm/deals?limit=200');
    return renderPipeline(result.data, pipelineStage, result.count);
  }
  if (pathname === '/deals') {
    const query = new URLSearchParams();
    if (params.get('q')) query.set('q', params.get('q'));
    if (params.get('stage')) query.set('stage', params.get('stage'));
    query.set('limit', '100');
    return renderDeals(await api(`/api/crm/deals?${query}`), { q: params.get('q') || '', stage: params.get('stage') || '' });
  }
  if (dealId && UUID.test(dealId[1])) {
    const [deal, companies, contacts] = await Promise.all([
      api(`/api/crm/deals/${dealId[1]}`),
      api('/api/crm/companies?limit=200'),
      api('/api/crm/contacts?limit=200'),
    ]);
    return renderDeal(deal.data, companies.data, contacts.data);
  }
  if (pathname === '/contacts') {
    const q = params.get('q') || '';
    return renderContacts(await api(`/api/crm/contacts?limit=100${q ? `&q=${encodeURIComponent(q)}` : ''}`), { q });
  }
  if (contactId && UUID.test(contactId[1])) {
    const [contact, companies] = await Promise.all([
      api(`/api/crm/contacts/${contactId[1]}`),
      api('/api/crm/companies?limit=200'),
    ]);
    return renderContact(contact.data, companies.data);
  }
  if (pathname === '/companies') {
    const q = params.get('q') || '';
    return renderCompanies(await api(`/api/crm/companies?limit=100${q ? `&q=${encodeURIComponent(q)}` : ''}`), { q });
  }
  if (companyId && UUID.test(companyId[1])) {
    return renderCompany((await api(`/api/crm/companies/${companyId[1]}`)).data);
  }
  if (pathname === '/search') {
    const q = (params.get('q') || '').trim();
    if (!q) return renderMessage('Type a name, company, or deal in the search box.');
    return renderSearch((await api(`/api/crm/search?q=${encodeURIComponent(q)}`)).data, q);
  }
  return renderMessage('That page is not in the CRM.');
}

async function render() {
  const token = ++renderToken;
  const route = readRoute();
  highlight(route.pathname);
  view.innerHTML = '<p class="empty">Loading…</p>';
  try {
    const html = await page(route);
    if (token !== renderToken) return;
    view.innerHTML = html;
  } catch (error) {
    if (token !== renderToken || error.status === 401) return;
    view.innerHTML = renderMessage(error.message || 'Something went wrong.');
  }
}

async function moveDeal(id, stage) {
  try {
    await api(`/api/crm/deals/${id}/stage`, { method: 'POST', body: JSON.stringify({ stage }) });
    pipelineStage = stage;
    flash(`Moved to ${stageLabel(stage)}.`);
    await render();
  } catch (error) {
    if (error.status !== 401) flash(error.message, true);
  }
}

document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="#/"]');
  if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  if (location.hash === link.getAttribute('href')) render();
  else location.hash = link.getAttribute('href');
});

window.addEventListener('hashchange', () => { render(); });

document.querySelector('#logout').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  location.href = '/admin/login';
});

document.querySelector('#quick-open').addEventListener('click', () => {
  document.querySelector('#quick-error').textContent = '';
  document.querySelector('#quick').showModal();
});

document.querySelector('#quick-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const error = document.querySelector('#quick-error');
  error.textContent = '';
  const data = formData(form);
  if (!data.value) delete data.value;
  try {
    const result = await api('/api/crm/deals', { method: 'POST', body: JSON.stringify(data) });
    form.reset();
    document.querySelector('#quick').close();
    flash('Deal added.');
    location.hash = `#/deals/${result.data.id}`;
  } catch (err) {
    error.textContent = err.message;
  }
});

document.querySelector('#search-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const q = String(new FormData(event.currentTarget).get('q') || '').trim();
  location.hash = q ? `#/search?q=${encodeURIComponent(q)}` : '#/search';
});

document.addEventListener('submit', async (event) => {
  const form = event.target.closest('form[data-form]');
  if (!form || form.id === 'quick-form' || form.id === 'search-form') return;
  event.preventDefault();
  const name = form.dataset.form;
  const data = formData(form);
  const route = readRoute();
  try {
    if (name === 'filter-deals') {
      const query = new URLSearchParams();
      if (data.q) query.set('q', data.q);
      if (data.stage) query.set('stage', data.stage);
      location.hash = `#/deals${query.toString() ? `?${query}` : ''}`;
      return;
    }
    if (name === 'filter-contacts') {
      location.hash = data.q ? `#/contacts?q=${encodeURIComponent(data.q)}` : '#/contacts';
      return;
    }
    if (name === 'filter-companies') {
      location.hash = data.q ? `#/companies?q=${encodeURIComponent(data.q)}` : '#/companies';
      return;
    }
    if (name === 'save-deal') {
      const id = route.pathname.split('/')[2];
      await api(`/api/crm/deals/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
      flash('Deal saved.');
      await render();
      return;
    }
    if (name === 'deal-note') {
      const id = route.pathname.split('/')[2];
      await api(`/api/crm/deals/${id}/activities`, { method: 'POST', body: JSON.stringify(data) });
      flash('Note added.');
      await render();
      return;
    }
    if (name === 'save-contact') {
      const id = route.pathname.split('/')[2];
      await api(`/api/crm/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
      flash('Contact saved.');
      await render();
      return;
    }
    if (name === 'contact-note') {
      const id = route.pathname.split('/')[2];
      await api('/api/crm/activities', { method: 'POST', body: JSON.stringify({ ...data, contact_id: id }) });
      flash('Note added.');
      await render();
      return;
    }
    if (name === 'create-contact') {
      const created = await api('/api/crm/contacts', { method: 'POST', body: JSON.stringify(data) });
      flash('Contact added.');
      location.hash = `#/contacts/${created.data.id}`;
      return;
    }
    if (name === 'save-company') {
      const id = route.pathname.split('/')[2];
      await api(`/api/crm/companies/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
      flash('Company saved.');
      await render();
      return;
    }
    if (name === 'company-note') {
      await api('/api/crm/activities', { method: 'POST', body: JSON.stringify(data) });
      flash('Note added.');
      await render();
      return;
    }
    if (name === 'create-company') {
      const created = await api('/api/crm/companies', { method: 'POST', body: JSON.stringify(data) });
      flash('Company added.');
      location.hash = `#/companies/${created.data.id}`;
      return;
    }
  } catch (error) {
    if (error.status !== 401) flash(error.message, true);
  }
});

document.addEventListener('change', (event) => {
  if (event.target.id === 'board-stage') {
    pipelineStage = event.target.value;
    for (const column of document.querySelectorAll('.column')) {
      column.classList.toggle('active', column.dataset.stage === pipelineStage);
    }
    return;
  }
  const select = event.target.closest('[data-move]');
  if (!select) return;
  moveDeal(select.dataset.move, select.value);
});

document.addEventListener('dragstart', (event) => {
  const card = event.target.closest('[data-deal-id]');
  if (!card) return;
  event.dataTransfer.setData('text/plain', card.dataset.dealId);
  event.dataTransfer.effectAllowed = 'move';
});

document.addEventListener('dragover', (event) => {
  const column = event.target.closest('[data-drop-stage]');
  if (!column) return;
  event.preventDefault();
  column.classList.add('drop');
});

document.addEventListener('dragleave', (event) => {
  const column = event.target.closest('[data-drop-stage]');
  if (column) column.classList.remove('drop');
});

document.addEventListener('drop', (event) => {
  const column = event.target.closest('[data-drop-stage]');
  if (!column) return;
  event.preventDefault();
  column.classList.remove('drop');
  const id = event.dataTransfer.getData('text/plain');
  if (id) moveDeal(id, column.dataset.dropStage);
});

if (!location.hash) location.replace('#/');
render();
