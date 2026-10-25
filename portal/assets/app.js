import { portalApi } from './api.js';
import { renderMarkdown } from './markdown.js';

const view = document.querySelector('#view');
const flashBox = document.querySelector('#flash');
const demoBanner = document.querySelector('#demo-banner');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const KICKOFF_AGENDA = [
  'Goals, channels, and what “a conversion” means for your business',
  'Walkthrough of current tracking (tags, pixels, offline imports if any)',
  'Access gaps and timeline for the audit or implementation',
  'Communication rhythm and what to expect in the portal',
  'Q&A and next steps',
];

let me = null;
let currentProject = null;

function readRoute() {
  const raw = (location.hash || '#/').replace(/^#/, '') || '/';
  const url = new URL(raw.startsWith('/') ? raw : `/${raw}`, 'https://jdcode.dev');
  const parts = url.pathname.split('/').filter(Boolean);
  return { parts, tab: url.searchParams.get('tab') || 'overview' };
}

function flash(message, bad = false) {
  flashBox.textContent = message || '';
  flashBox.classList.toggle('bad', Boolean(bad && message));
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

const TAB_FOR_STEP = {
  agreement: 'agreement',
  payment: 'payment',
  access: 'checklist',
  kickoff: 'kickoff',
  in_progress: 'updates',
  delivered: 'documents',
  retainer: 'updates',
};

function nextAction(projectId, timeline) {
  const current = timeline.find((s) => s.status === 'current');
  if (!current) return { label: 'All stages complete', hint: 'Check updates and documents for deliverables.', tab: 'updates' };
  const hints = {
    agreement: 'Review and accept the statement of work to start onboarding.',
    payment: 'Complete payment so we can schedule your kickoff.',
    access: 'Grant platform access using the checklist — we cannot audit without it.',
    kickoff: 'Book your 45-minute kickoff call when you are ready.',
    in_progress: 'Work is in progress. Watch the updates feed for milestones.',
    delivered: 'Your deliverables are in Documents.',
    retainer: 'Retainer monitoring is active.',
  };
  return {
    label: current.label,
    hint: hints[current.id] || 'Continue in the portal.',
    tab: TAB_FOR_STEP[current.id] || 'overview',
  };
}

function renderStepper(timeline, projectId) {
  return `<ol class="stepper">${timeline.map((step, index) => `
    <li class="${step.status}">
      <span class="dot" aria-hidden="true">${step.status === 'done' ? '✓' : String(index + 1).padStart(2, '0')}</span>
      <div>
        <strong>${step.label}</strong>
        ${step.status === 'current' ? '<div class="fine">Active stage</div>' : ''}
      </div>
      <span class="stage-tag">${step.status === 'done' ? 'Complete' : step.status === 'current' ? 'Now' : 'Queued'}</span>
    </li>`).join('')}</ol>`;
}

function tabs(projectId, active) {
  const items = [
    ['overview', 'Overview'],
    ['welcome', 'Welcome'],
    ['agreement', 'Agreement'],
    ['payment', 'Payment'],
    ['checklist', 'Access'],
    ['kickoff', 'Kickoff'],
    ['documents', 'Documents'],
    ['updates', 'Updates'],
  ];
  return `<nav class="tabs" aria-label="Project sections">${items.map(([id, label]) => `
    <a href="#/project/${projectId}?tab=${id}" class="${active === id ? 'current' : ''}">${label}</a>`).join('')}</nav>`;
}

function renderOverview(detail) {
  const p = detail.project;
  const next = nextAction(p.id, detail.timeline);
  const doneCount = detail.timeline.filter((s) => s.done).length;
  return `
    <header class="mission-hero">
      <div>
        <p class="kicker">${p.client?.name || 'Project'} · ${p.package}</p>
        <h1>${p.title}</h1>
        <div class="mission-meta">
          <div><span class="label">Payment</span><span class="status-pill ${p.payment_status === 'paid' ? 'ok' : ''}">${p.payment_status}</span></div>
          <div><span class="label">Stages</span><span>${doneCount} / ${detail.timeline.length}</span></div>
          <div><span class="label">Phase</span><span>${p.work_phase.replace('_', ' ')}</span></div>
        </div>
      </div>
      <aside class="mission-next">
        <span class="label">Next action</span>
        <strong>${next.label}</strong>
        <p>${next.hint}</p>
        <a class="btn btn-acc" href="#/project/${p.id}?tab=${next.tab}" style="margin-top:14px">Go to step</a>
      </aside>
    </header>
    ${tabs(p.id, 'overview')}
    <div class="split">
      <section class="panel">
        <h2>Mission timeline</h2>
        ${renderStepper(detail.timeline, p.id)}
      </section>
      <section class="panel">
        <h2>Status feed</h2>
        ${detail.updates.length ? detail.updates.slice(0, 3).map((u) => `
          <article class="feed-item">
            <div class="meta">${formatDate(u.published_at)}</div>
            <strong>${u.title}</strong>
            <div class="md">${renderMarkdown(u.body_markdown)}</div>
          </article>`).join('') : '<p class="empty">No transmissions yet — updates appear here as work progresses.</p>'}
      </section>
    </div>`;
}

function renderWelcome(detail) {
  const p = detail.project;
  return `
    <div class="page-head"><h1>Welcome</h1></div>
    ${tabs(p.id, 'welcome')}
    <article class="panel md">${renderMarkdown(detail.welcome_markdown)}</article>`;
}

function renderAgreement(detail) {
  const p = detail.project;
  const accepted = detail.acceptance;
  if (accepted) {
    return `
      <div class="page-head"><h1>Agreement</h1></div>
      ${tabs(p.id, 'agreement')}
      <section class="panel">
        <p class="kicker">Accepted ${formatDate(accepted.accepted_at)}</p>
        <p><strong>${accepted.full_name}</strong> · ${accepted.company_name} · ${accepted.job_title}</p>
        <p class="fine">Content hash: <code>${accepted.agreement_content_hash.slice(0, 12)}…</code></p>
        <button type="button" class="btn" id="print-agreement">Print / save PDF</button>
      </section>
      <article class="panel md" id="agreement-print">${renderMarkdown(p.agreement_markdown)}</article>`;
  }
  return `
    <div class="page-head"><h1>Agreement</h1></div>
    ${tabs(p.id, 'agreement')}
    <article class="panel md">${renderMarkdown(p.agreement_markdown)}</article>
    <form class="panel stack" id="accept-form">
      <h2>Accept agreement</h2>
      <label><input type="checkbox" name="agreed" required> I have read and agree to the statement of work above.</label>
      <label>Full legal name <input name="full_name" required maxlength="200"></label>
      <label>Company <input name="company_name" required maxlength="200"></label>
      <label>Job title <input name="job_title" required maxlength="200"></label>
      <button class="btn" type="submit">Accept agreement</button>
      <p id="accept-error" class="warn-text" role="alert"></p>
    </form>`;
}

function renderPayment(detail) {
  const p = detail.project;
  const paid = p.payment_status === 'paid' || p.payment_status === 'waived';
  return `
    <div class="page-head"><h1>Payment</h1></div>
    ${tabs(p.id, 'payment')}
    <section class="panel stack">
      <p class="kicker">Status</p>
      <p class="price">${paid ? 'Paid' : 'Pending'}</p>
      ${!paid && p.payment_url ? `<a class="btn btn-acc" href="${p.payment_url}" target="_blank" rel="noopener noreferrer">Pay now</a>` : ''}
      ${!paid && !p.payment_url ? '<p class="fine">Your payment link will appear here once issued.</p>' : ''}
      ${p.payment_status === 'waived' ? '<p class="fine">Payment waived for this project.</p>' : ''}
    </section>`;
}

function renderChecklist(detail) {
  const p = detail.project;
  const items = detail.checklist;
  return `
    <div class="page-head"><h1>Access checklist</h1></div>
    ${tabs(p.id, 'checklist')}
    <section class="panel">
      <p class="fine">Tick each item when access is granted. Add a short note if useful.</p>
      ${items.map((item) => `
        <article class="checklist-item" data-id="${item.id}">
          <header>
            <input type="checkbox" ${item.completed_at ? 'checked' : ''} aria-label="Mark ${item.title} complete">
            <strong>${item.title}</strong>
          </header>
          <div class="md">${renderMarkdown(item.instructions_markdown)}</div>
          <label class="fine">Note
            <textarea rows="2" maxlength="5000">${item.client_note || ''}</textarea>
          </label>
        </article>`).join('')}
    </section>`;
}

function renderKickoff(detail) {
  const p = detail.project;
  return `
    <div class="page-head"><h1>Kickoff call</h1></div>
    ${tabs(p.id, 'kickoff')}
    <section class="panel stack">
      <p class="kicker">45-minute agenda</p>
      <ul>${KICKOFF_AGENDA.map((line) => `<li>${line}</li>`).join('')}</ul>
      ${p.booking_url ? `<a class="btn" href="${p.booking_url}" target="_blank" rel="noopener noreferrer">Book kickoff</a>` : '<p class="fine">Booking link coming soon.</p>'}
      <p><strong>Scheduled:</strong> ${formatDate(p.kickoff_at)}</p>
    </section>`;
}

function renderDocuments(detail) {
  const p = detail.project;
  return `
    <div class="page-head"><h1>Documents</h1></div>
    ${tabs(p.id, 'documents')}
    <section class="panel">
      ${detail.documents.length ? `<ul class="directory">${detail.documents.map((doc) => `
        <li><a href="${doc.url || '#'}" target="_blank" rel="noopener noreferrer">${doc.title}</a>
        ${doc.description ? `<span>${doc.description}</span>` : ''}</li>`).join('')}</ul>` : '<p class="empty">Documents will appear here as they are delivered.</p>'}
    </section>`;
}

function renderUpdates(detail) {
  const p = detail.project;
  return `
    <div class="page-head"><h1>Status updates</h1></div>
    ${tabs(p.id, 'updates')}
    <section class="panel">
      ${detail.updates.length ? detail.updates.map((u) => `
        <article class="feed-item">
          <div class="meta">${formatDate(u.published_at)}</div>
          <strong>${u.title}</strong>
          <div class="md">${renderMarkdown(u.body_markdown)}</div>
        </article>`).join('') : '<p class="empty">No updates yet.</p>'}
    </section>`;
}

async function loadProject(id) {
  currentProject = await portalApi(`projects/${id}`);
  if (currentProject.project.demo_label) {
    demoBanner.hidden = false;
    demoBanner.textContent = currentProject.project.demo_label;
  } else {
    demoBanner.hidden = true;
  }
}

async function render() {
  const route = readRoute();
  if (!me) {
    me = await portalApi('me');
    if (me.admin) {
      const adminLink = document.querySelector('#admin-link');
      if (adminLink) adminLink.hidden = false;
    }
  }
  if (route.parts[0] === 'project' && UUID.test(route.parts[1])) {
    await loadProject(route.parts[1]);
    const tab = route.tab || 'overview';
    const map = {
      overview: renderOverview,
      welcome: renderWelcome,
      agreement: renderAgreement,
      payment: renderPayment,
      checklist: renderChecklist,
      kickoff: renderKickoff,
      documents: renderDocuments,
      updates: renderUpdates,
    };
    view.innerHTML = (map[tab] || renderOverview)(currentProject);
    wireProjectHandlers(route.parts[1]);
    return;
  }
  const projects = me.projects || [];
  if (projects.length === 1) {
    location.hash = `#/project/${projects[0].id}`;
    return;
  }
  view.innerHTML = `
    <div class="page-head"><h1>Your projects</h1></div>
    <section class="panel">
      ${projects.length ? `<ul class="directory">${projects.map((p) => `
        <li><a href="#/project/${p.id}">${p.title}</a><span>${p.client?.name || ''} · ${p.stuck_at}</span></li>`).join('')}</ul>` : '<p class="empty">No projects are linked to your account yet.</p>'}
    </section>`;
}

function wireProjectHandlers(projectId) {
  const acceptForm = document.querySelector('#accept-form');
  if (acceptForm) {
    acceptForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const errorBox = document.querySelector('#accept-error');
      errorBox.textContent = '';
      const data = new FormData(acceptForm);
      try {
        await portalApi(`projects/${projectId}/accept-agreement`, {
          method: 'POST',
          body: {
            agreed: data.get('agreed') === 'on',
            full_name: data.get('full_name'),
            company_name: data.get('company_name'),
            job_title: data.get('job_title'),
          },
        });
        flash('Agreement accepted. Thank you.');
        await render();
      } catch (error) {
        errorBox.textContent = error.message;
      }
    });
  }
  const printBtn = document.querySelector('#print-agreement');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      const html = document.querySelector('#agreement-print')?.innerHTML || '';
      const win = window.open('', '_blank', 'noopener');
      if (!win) return;
      win.document.write(`<html><head><title>Agreement</title></head><body>${html}</body></html>`);
      win.document.close();
      win.print();
    });
  }
  document.querySelectorAll('.checklist-item').forEach((row) => {
    const id = row.dataset.id;
    const checkbox = row.querySelector('input[type="checkbox"]');
    const note = row.querySelector('textarea');
    let timer;
    const save = async () => {
      try {
        await portalApi(`checklist/${id}`, {
          method: 'PATCH',
          body: { completed: checkbox.checked, client_note: note.value },
        });
        flash('Checklist saved.');
      } catch (error) {
        flash(error.message, true);
      }
    };
    checkbox.addEventListener('change', save);
    note.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(save, 600);
    });
  });
}

document.querySelector('#logout')?.addEventListener('click', async () => {
  await fetch('/api/portal/auth/logout', { method: 'POST', credentials: 'same-origin' });
  location.href = '/portal/login';
});

window.addEventListener('hashchange', () => { render().catch((e) => flash(e.message, true)); });
render().catch((error) => {
  if (error.status === 401) location.href = '/portal/login';
  else flash(error.message, true);
});
