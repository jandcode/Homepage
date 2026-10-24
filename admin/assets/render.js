import {
  ACTIVITY_LABELS,
  STAGE_ORDER,
  escapeHtml,
  formatDay,
  formatMoney,
  formatTotals,
  formatWhen,
  localToday,
  safeUrl,
  stageLabel,
  stageOptions,
} from './html.js';

function personOptions(rows, selected, emptyLabel) {
  const options = [`<option value="">${escapeHtml(emptyLabel)}</option>`];
  for (const row of rows || []) {
    const label = row.email ? `${row.name} · ${row.email}` : row.name;
    options.push(
      `<option value="${escapeHtml(row.id)}"${row.id === selected ? ' selected' : ''}>${escapeHtml(label)}</option>`,
    );
  }
  return options.join('');
}

function timeline(activities) {
  if (!activities?.length) return '<p class="empty">No notes yet.</p>';
  return `<ol class="timeline">${activities.map((item) => `
    <li>
      <div class="meta"><span class="pill">${escapeHtml(ACTIVITY_LABELS[item.type] || item.type)}</span> ${escapeHtml(formatWhen(item.occurred_at))}</div>
      <p>${escapeHtml(item.body)}</p>
    </li>`).join('')}</ol>`;
}

function noteForm(formName, extra = '') {
  return `
    <form data-form="${formName}" class="stack">
      ${extra}
      <label>Type
        <select name="type">
          <option value="note">Note</option>
          <option value="email">Email</option>
          <option value="call">Call</option>
          <option value="meeting">Meeting</option>
        </select>
      </label>
      <label>Note
        <textarea name="body" required maxlength="20000" rows="4" placeholder="What happened?"></textarea>
      </label>
      <button class="btn" type="submit">Add note</button>
    </form>`;
}

function followList(items, empty) {
  if (!items?.length) return `<p class="empty">${escapeHtml(empty)}</p>`;
  return `<ul class="follow">${items.map((item) => `
    <li>
      <a href="#/deals/${escapeHtml(item.id)}">${escapeHtml(item.title)}</a>
      <span>${escapeHtml(formatDay(item.next_step_date))}${item.company_name ? ` · ${escapeHtml(item.company_name)}` : ''}</span>
      <em>${escapeHtml(item.next_step || 'No next step written down')}</em>
    </li>`).join('')}</ul>`;
}

export function renderDashboard(summary) {
  const usd = (summary.open_pipeline || []).find((item) => item.currency === 'USD');
  const won = formatTotals(summary.won_this_month);
  return `
    <header class="page-head">
      <div>
        <p class="kicker">Today ${escapeHtml(formatDay(summary.today))}</p>
        <h1>Pipeline</h1>
      </div>
    </header>
    <section class="stats">
      <article><p class="kicker">Open pipeline</p><strong>${escapeHtml(formatTotals(summary.open_pipeline))}</strong><span>${usd && summary.open_pipeline.length > 1 ? 'Mixed currencies kept apart' : 'Open deals'}</span></article>
      <article><p class="kicker">Due today</p><strong>${summary.followups_due_today.length}</strong><span>Follow-ups</span></article>
      <article class="${summary.followups_overdue.length ? 'warn' : ''}"><p class="kicker">Overdue</p><strong>${summary.followups_overdue.length}</strong><span>Need a next step</span></article>
      <article><p class="kicker">Won this month</p><strong>${escapeHtml(won)}</strong><span>${summary.won_this_month_count} closed</span></article>
    </section>
    <section class="panel">
      <h2>Open value by stage</h2>
      <div class="bars">
        ${summary.open_pipeline_by_stage.map((row) => `
          <a class="bar" href="#/pipeline">
            <span>${escapeHtml(stageLabel(row.stage))}</span>
            <strong>${escapeHtml(formatTotals(row.totals))}</strong>
            <em>${row.count}</em>
          </a>`).join('')}
      </div>
      ${summary.truncated ? '<p class="warn-text">Dashboard totals use the first 5,000 deals.</p>' : ''}
      <p class="fine">Month and “today” use ${escapeHtml(summary.timezone)}.</p>
    </section>
    <div class="split">
      <section class="panel">
        <h2>Due today</h2>
        ${followList(summary.followups_due_today, 'Nothing due today.')}
      </section>
      <section class="panel">
        <h2>Overdue</h2>
        ${followList(summary.followups_overdue, 'Nothing overdue.')}
      </section>
    </div>`;
}

export function renderPipeline(deals, activeStage, count = deals.length) {
  const today = localToday();
  const groups = Object.fromEntries(STAGE_ORDER.map((stage) => [stage, []]));
  for (const deal of deals) {
    if (groups[deal.stage]) groups[deal.stage].push(deal);
  }
  return `
    <header class="page-head">
      <div>
        <p class="kicker">Eight stages</p>
        <h1>Pipeline</h1>
      </div>
      <label class="mobile-stage">Show
        <select id="board-stage" data-selected="${escapeHtml(activeStage)}">${stageOptions(activeStage)}</select>
      </label>
    </header>
    ${count > deals.length ? `<p class="warn-text">Showing ${deals.length} of ${count} deals.</p>` : ''}
    <div class="board" data-active="${escapeHtml(activeStage)}">
      ${STAGE_ORDER.map((stage) => `
        <section class="column ${stage === activeStage ? 'active' : ''}" data-drop-stage="${stage}" data-stage="${stage}">
          <header>
            <h2>${escapeHtml(stageLabel(stage))}</h2>
            <span>${groups[stage].length}</span>
          </header>
          <p class="col-value">${escapeHtml(formatTotals(sum(groups[stage])))}</p>
          <div class="cards">
            ${groups[stage].map((deal) => card(deal, today)).join('') || '<p class="empty">Empty</p>'}
          </div>
        </section>`).join('')}
    </div>`;
}

function sum(deals) {
  const map = new Map();
  for (const deal of deals) {
    const currency = deal.currency || 'USD';
    const current = map.get(currency) || { currency, value: 0, count: 0 };
    current.value = Math.round((current.value + Number(deal.value || 0)) * 100) / 100;
    current.count += 1;
    map.set(currency, current);
  }
  return [...map.values()];
}

function card(deal, today) {
  const late = deal.next_step_date && deal.next_step_date < today && deal.stage !== 'won' && deal.stage !== 'lost';
  return `
    <article class="card" draggable="true" data-deal-id="${escapeHtml(deal.id)}">
      <a href="#/deals/${escapeHtml(deal.id)}">${escapeHtml(deal.title)}</a>
      <p>${escapeHtml(deal.company?.name || deal.contact?.name || 'No company yet')}</p>
      <div class="card-meta">
        <span>${escapeHtml(formatMoney(deal.value, deal.currency))}</span>
        <span class="${late ? 'late' : ''}">${deal.next_step_date ? escapeHtml(formatDay(deal.next_step_date)) : 'No date'}</span>
      </div>
      <label class="move">Move
        <select data-move="${escapeHtml(deal.id)}" aria-label="Move ${escapeHtml(deal.title)}">${stageOptions(deal.stage)}</select>
      </label>
    </article>`;
}

export function renderDeals(result, query) {
  const rows = result.data || [];
  return `
    <header class="page-head"><div><p class="kicker">${result.count} deals</p><h1>Deals</h1></div></header>
    <form class="filters" data-form="filter-deals">
      <input name="q" value="${escapeHtml(query.q || '')}" placeholder="Search title, company, source" aria-label="Search deals">
      <select name="stage" aria-label="Stage">
        <option value="">All stages</option>
        ${stageOptions(query.stage || '')}
      </select>
      <button class="btn btn-ghost" type="submit">Filter</button>
    </form>
    ${rows.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Deal</th><th>Stage</th><th>Value</th><th>Next step</th><th>When</th></tr></thead>
      <tbody>
        ${rows.map((deal) => `<tr>
          <td data-label="Deal"><a href="#/deals/${escapeHtml(deal.id)}">${escapeHtml(deal.title)}</a><small>${escapeHtml(deal.company?.name || '')}</small></td>
          <td data-label="Stage">${escapeHtml(stageLabel(deal.stage))}</td>
          <td data-label="Value">${escapeHtml(formatMoney(deal.value, deal.currency))}</td>
          <td data-label="Next step">${escapeHtml(deal.next_step || '—')}</td>
          <td data-label="When">${escapeHtml(formatDay(deal.next_step_date))}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>` : '<p class="empty">No deals match. Add one with New deal.</p>'}`;
}

export function renderDeal(deal, companies, contacts) {
  return `
    <header class="page-head">
      <div>
        <p class="kicker"><a href="#/deals">Deals</a></p>
        <h1>${escapeHtml(deal.title)}</h1>
      </div>
      <strong class="price">${escapeHtml(formatMoney(deal.value, deal.currency))}</strong>
    </header>
    <div class="split">
      <form class="panel stack" data-form="save-deal">
        <label>Title <input name="title" required maxlength="200" value="${escapeHtml(deal.title)}"></label>
        <label>Stage <select name="stage">${stageOptions(deal.stage)}</select></label>
        <div class="pair">
          <label>Value <input name="value" inputmode="decimal" value="${escapeHtml(deal.value)}"></label>
          <label>Currency <input name="currency" maxlength="3" value="${escapeHtml(deal.currency || 'USD')}"></label>
        </div>
        <label>Company <select name="company_id">${personOptions(companies, deal.company_id, 'No company')}</select></label>
        <label>Contact <select name="contact_id">${personOptions(contacts, deal.contact_id, 'No contact')}</select></label>
        <label>Source <input name="source" maxlength="200" value="${escapeHtml(deal.source || '')}"></label>
        <label>Next step <input name="next_step" maxlength="500" value="${escapeHtml(deal.next_step || '')}"></label>
        <label>Next step date <input type="date" name="next_step_date" value="${escapeHtml(deal.next_step_date || '')}"></label>
        <button class="btn" type="submit">Save deal</button>
      </form>
      <div>
        <section class="panel">
          <h2>Stage history</h2>
          <ol class="history">
            ${(deal.stage_history || []).map((item) => `<li>${item.from_stage
              ? `${escapeHtml(stageLabel(item.from_stage))} → ${escapeHtml(stageLabel(item.to_stage))}`
              : `Opened as ${escapeHtml(stageLabel(item.to_stage))}`}
              <span>${escapeHtml(formatWhen(item.changed_at))}</span></li>`).join('') || '<li>No history yet.</li>'}
          </ol>
        </section>
        <section class="panel">
          <h2>Notes</h2>
          ${timeline(deal.activities)}
          ${noteForm('deal-note')}
        </section>
      </div>
    </div>`;
}

export function renderContacts(result, query) {
  const rows = result.data || [];
  return `
    <header class="page-head"><div><p class="kicker">${result.count} people</p><h1>Contacts</h1></div></header>
    <form class="filters" data-form="filter-contacts">
      <input name="q" value="${escapeHtml(query.q || '')}" placeholder="Search name or email" aria-label="Search contacts">
      <button class="btn btn-ghost" type="submit">Search</button>
    </form>
    <form class="panel stack" data-form="create-contact">
      <h2>Quick add</h2>
      <div class="pair">
        <label>Name <input name="name" required maxlength="200"></label>
        <label>Email <input name="email" type="email" maxlength="320"></label>
      </div>
      <div class="pair">
        <label>Phone <input name="phone" maxlength="50"></label>
        <label>Role <input name="role" maxlength="120"></label>
      </div>
      <button class="btn" type="submit">Add contact</button>
    </form>
    ${rows.length ? `<ul class="directory">${rows.map((contact) => `
      <li><a href="#/contacts/${escapeHtml(contact.id)}">${escapeHtml(contact.name)}</a>
        <span>${escapeHtml(contact.email || contact.role || 'No email')}${contact.company?.name ? ` · ${escapeHtml(contact.company.name)}` : ''}</span>
      </li>`).join('')}</ul>` : '<p class="empty">No contacts yet.</p>'}`;
}

export function renderContact(contact, companies) {
  const href = safeUrl(contact.company?.website);
  return `
    <header class="page-head">
      <div>
        <p class="kicker"><a href="#/contacts">Contacts</a></p>
        <h1>${escapeHtml(contact.name)}</h1>
      </div>
    </header>
    <div class="split">
      <form class="panel stack" data-form="save-contact">
        <label>Name <input name="name" required maxlength="200" value="${escapeHtml(contact.name)}"></label>
        <label>Email <input name="email" type="email" maxlength="320" value="${escapeHtml(contact.email || '')}"></label>
        <label>Phone <input name="phone" maxlength="50" value="${escapeHtml(contact.phone || '')}"></label>
        <label>Role <input name="role" maxlength="120" value="${escapeHtml(contact.role || '')}"></label>
        <label>Company <select name="company_id">${personOptions(companies, contact.company_id, 'No company')}</select></label>
        <label>Notes <textarea name="notes" maxlength="20000" rows="4">${escapeHtml(contact.notes || '')}</textarea></label>
        <button class="btn" type="submit">Save contact</button>
      </form>
      <div>
        <section class="panel">
          <h2>Deals</h2>
          ${(contact.deals || []).length ? `<ul class="directory">${contact.deals.map((deal) => `
            <li><a href="#/deals/${escapeHtml(deal.id)}">${escapeHtml(deal.title)}</a><span>${escapeHtml(stageLabel(deal.stage))} · ${escapeHtml(formatMoney(deal.value, deal.currency))}</span></li>`).join('')}</ul>` : '<p class="empty">No deals linked.</p>'}
          ${href ? `<p class="fine"><a href="${escapeHtml(href)}" rel="noreferrer">${escapeHtml(href)}</a></p>` : ''}
        </section>
        <section class="panel">
          <h2>Notes</h2>
          ${timeline(contact.activities)}
          ${noteForm('contact-note')}
        </section>
      </div>
    </div>`;
}

export function renderCompanies(result, query) {
  const rows = result.data || [];
  return `
    <header class="page-head"><div><p class="kicker">${result.count} companies</p><h1>Companies</h1></div></header>
    <form class="filters" data-form="filter-companies">
      <input name="q" value="${escapeHtml(query.q || '')}" placeholder="Search companies" aria-label="Search companies">
      <button class="btn btn-ghost" type="submit">Search</button>
    </form>
    <form class="panel stack" data-form="create-company">
      <h2>Quick add</h2>
      <div class="pair">
        <label>Name <input name="name" required maxlength="200"></label>
        <label>Website <input name="website" maxlength="500" placeholder="https://"></label>
      </div>
      <button class="btn" type="submit">Add company</button>
    </form>
    ${rows.length ? `<ul class="directory">${rows.map((company) => `
      <li><a href="#/companies/${escapeHtml(company.id)}">${escapeHtml(company.name)}</a><span>${escapeHtml(company.website || 'No website')}</span></li>`).join('')}</ul>` : '<p class="empty">No companies yet.</p>'}`;
}

export function renderCompany(company) {
  const href = safeUrl(company.website);
  const contacts = company.contacts || [];
  return `
    <header class="page-head">
      <div>
        <p class="kicker"><a href="#/companies">Companies</a></p>
        <h1>${escapeHtml(company.name)}</h1>
      </div>
    </header>
    <div class="split">
      <form class="panel stack" data-form="save-company">
        <label>Name <input name="name" required maxlength="200" value="${escapeHtml(company.name)}"></label>
        <label>Website <input name="website" maxlength="500" value="${escapeHtml(company.website || '')}"></label>
        <label>Notes <textarea name="notes" maxlength="20000" rows="5">${escapeHtml(company.notes || '')}</textarea></label>
        <button class="btn" type="submit">Save company</button>
        ${href ? `<a class="fine" href="${escapeHtml(href)}" rel="noreferrer">${escapeHtml(href)}</a>` : ''}
      </form>
      <div>
        <section class="panel">
          <h2>People</h2>
          ${contacts.length ? `<ul class="directory">${contacts.map((contact) => `
            <li><a href="#/contacts/${escapeHtml(contact.id)}">${escapeHtml(contact.name)}</a><span>${escapeHtml(contact.email || contact.role || '')}</span></li>`).join('')}</ul>` : '<p class="empty">No contacts yet.</p>'}
        </section>
        <section class="panel">
          <h2>Deals</h2>
          ${(company.deals || []).length ? `<ul class="directory">${company.deals.map((deal) => `
            <li><a href="#/deals/${escapeHtml(deal.id)}">${escapeHtml(deal.title)}</a><span>${escapeHtml(stageLabel(deal.stage))} · ${escapeHtml(formatMoney(deal.value, deal.currency))}</span></li>`).join('')}</ul>` : '<p class="empty">No deals yet.</p>'}
        </section>
        <section class="panel">
          <h2>Notes</h2>
          ${timeline(company.activities)}
          ${contacts.length ? noteForm('company-note', `<label>On contact <select name="contact_id" required>${personOptions(contacts, '', 'Choose')}</select></label>`) : '<p class="empty">Add a contact to attach a note.</p>'}
        </section>
      </div>
    </div>`;
}

export function renderSearch(result, q) {
  const block = (title, rows, hrefFor, line) => `
    <section class="panel"><h2>${title}</h2>
      ${rows.length ? `<ul class="directory">${rows.map((row) => `<li><a href="${hrefFor(row)}">${escapeHtml(row.title || row.name)}</a><span>${escapeHtml(line(row))}</span></li>`).join('')}</ul>` : '<p class="empty">No matches.</p>'}
    </section>`;
  return `
    <header class="page-head"><div><p class="kicker">Search</p><h1>${escapeHtml(q)}</h1></div></header>
    ${block('Deals', result.deals || [], (row) => `#/deals/${escapeHtml(row.id)}`, (row) => `${stageLabel(row.stage)} · ${row.company?.name || formatMoney(row.value, row.currency)}`)}
    ${block('Contacts', result.contacts || [], (row) => `#/contacts/${escapeHtml(row.id)}`, (row) => row.email || row.role || '')}
    ${block('Companies', result.companies || [], (row) => `#/companies/${escapeHtml(row.id)}`, (row) => row.website || '')}`;
}

export function renderMessage(text) {
  return `<p class="empty">${escapeHtml(text)}</p>`;
}
