import { portalApi } from '../../assets/api.js';
import { renderMarkdown } from '../../assets/markdown.js';

const view = document.querySelector('#view');
const flashBox = document.querySelector('#flash');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readRoute() {
  const raw = (location.hash || '#/').replace(/^#/, '') || '/';
  const url = new URL(raw.startsWith('/') ? raw : `/${raw}`, 'https://jdcode.dev');
  return { pathname: url.pathname.replace(/\/+$/, '') || '/', parts: url.pathname.split('/').filter(Boolean) };
}

function flash(message, bad = false) {
  flashBox.textContent = message || '';
  flashBox.classList.toggle('bad', Boolean(bad && message));
}

async function renderDashboard() {
  const data = await portalApi('admin/overview');
  const projects = data.projects || [];
  view.innerHTML = `
    <div class="page-head"><h1>Portal admin</h1><button class="btn" id="new-project">New project</button></div>
    <section class="panel">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Project</th><th>Client</th><th>Package</th><th>Stuck at</th><th>Payment</th></tr></thead>
          <tbody>
            ${projects.map((p) => `<tr>
              <td data-label="Project"><a href="#/projects/${p.id}">${p.title}</a></td>
              <td data-label="Client">${p.client?.name || '—'}</td>
              <td data-label="Package">${p.package}</td>
              <td data-label="Stuck at">${p.stuck_at}</td>
              <td data-label="Payment">${p.payment_status}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </section>`;
  document.querySelector('#new-project')?.addEventListener('click', () => {
    location.hash = '#/new-project';
  });
}

async function renderNewProject() {
  const clients = await portalApi('admin/clients');
  view.innerHTML = `
    <div class="page-head"><h1>New project</h1></div>
    <form class="panel stack" id="create-project">
      <label>Client
        <select name="client_id" required>
          ${clients.map((c) => `<option value="${c.id}">${c.name}</option>`).join('')}
        </select>
      </label>
      <label>Title <input name="title" required maxlength="200"></label>
      <label>Package
        <select name="package">
          <option value="audit">Audit</option>
          <option value="implementation">Implementation</option>
          <option value="retainer">Retainer</option>
        </select>
      </label>
      <label>Agreement (markdown) <textarea name="agreement_markdown" rows="8"></textarea></label>
      <label>Payment URL <input name="payment_url" type="url"></label>
      <label>Booking URL <input name="booking_url" type="url"></label>
      <button class="btn" type="submit">Create project</button>
      <p class="warn-text" id="form-error"></p>
    </form>
    <section class="panel stack">
      <h2>New client</h2>
      <form id="create-client" class="stack">
        <label>Company name <input name="name" required maxlength="200"></label>
        <button class="btn btn-ghost" type="submit">Add client</button>
      </form>
    </section>`;
  document.querySelector('#create-project').addEventListener('submit', async (event) => {
    event.preventDefault();
    const fd = new FormData(event.target);
    try {
      const row = await portalApi('admin/projects', {
        method: 'POST',
        body: {
          client_id: fd.get('client_id'),
          title: fd.get('title'),
          package: fd.get('package'),
          agreement_markdown: fd.get('agreement_markdown'),
          payment_url: fd.get('payment_url') || null,
          booking_url: fd.get('booking_url') || null,
        },
      });
      location.hash = `#/projects/${row.id}`;
    } catch (error) {
      document.querySelector('#form-error').textContent = error.message;
    }
  });
  document.querySelector('#create-client').addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = new FormData(event.target).get('name');
    await portalApi('admin/clients', { method: 'POST', body: { name } });
    flash('Client added.');
    await renderNewProject();
  });
}

async function renderProject(id) {
  const detail = await portalApi(`admin/projects/${id}`);
  const p = detail.project;
  view.innerHTML = `
    <div class="page-head">
      <div>
        <p class="kicker"><a href="#/">← All projects</a></p>
        <h1>${p.title}</h1>
        <p class="fine">${p.client?.name} · ${p.package} · ${p.work_phase}</p>
      </div>
    </div>
    <div class="split">
      <section class="panel stack">
        <h2>Project settings</h2>
        <form id="patch-project" class="stack">
          <label>Payment status
            <select name="payment_status">
              <option value="pending" ${p.payment_status === 'pending' ? 'selected' : ''}>Pending</option>
              <option value="paid" ${p.payment_status === 'paid' ? 'selected' : ''}>Paid</option>
              <option value="waived" ${p.payment_status === 'waived' ? 'selected' : ''}>Waived</option>
            </select>
          </label>
          <label>Work phase
            <select name="work_phase">
              <option value="onboarding">Onboarding</option>
              <option value="in_progress">In progress</option>
              <option value="delivered">Delivered</option>
              <option value="retainer_active">Retainer active</option>
            </select>
          </label>
          <label>Payment URL <input name="payment_url" value="${p.payment_url || ''}"></label>
          <label>Booking URL <input name="booking_url" value="${p.booking_url || ''}"></label>
          <label>Kickoff (ISO datetime) <input name="kickoff_at" value="${p.kickoff_at || ''}"></label>
          <label>Agreement markdown <textarea name="agreement_markdown" rows="6">${p.agreement_markdown || ''}</textarea></label>
          <button class="btn" type="submit">Save</button>
        </form>
        <form id="invite-member" class="stack">
          <h3>Invite client</h3>
          <label>Email <input name="email" type="email" required></label>
          <button class="btn btn-ghost" type="submit">Send invite (adds member)</button>
        </form>
      </section>
      <section class="panel stack">
        <h2>Post update</h2>
        <form id="post-update" class="stack">
          <label>Title <input name="title" required></label>
          <label>Body (markdown) <textarea name="body_markdown" rows="5" required></textarea></label>
          <button class="btn" type="submit">Publish</button>
        </form>
        <form id="add-document" class="stack">
          <h3>Add document link</h3>
          <label>Title <input name="title" required></label>
          <label>URL <input name="url" type="url" required></label>
          <label>Description <input name="description"></label>
          <button class="btn btn-ghost" type="submit">Add</button>
        </form>
      </section>
    </div>
    <section class="panel">
      <h2>Client timeline</h2>
      <ol class="stepper">${detail.timeline.map((step, i) => `
        <li class="${step.status}"><span class="dot">${step.status === 'done' ? '✓' : i + 1}</span><strong>${step.label}</strong></li>`).join('')}
      </ol>
    </section>`;
  const phaseSelect = document.querySelector('[name="work_phase"]');
  if (phaseSelect) phaseSelect.value = p.work_phase;

  document.querySelector('#patch-project').addEventListener('submit', async (event) => {
    event.preventDefault();
    const fd = new FormData(event.target);
    await portalApi(`admin/projects/${id}`, {
      method: 'PATCH',
      body: {
        payment_status: fd.get('payment_status'),
        work_phase: fd.get('work_phase'),
        payment_url: fd.get('payment_url') || null,
        booking_url: fd.get('booking_url') || null,
        kickoff_at: fd.get('kickoff_at') || null,
        agreement_markdown: fd.get('agreement_markdown'),
      },
    });
    flash('Saved.');
    await renderProject(id);
  });
  document.querySelector('#invite-member').addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = new FormData(event.target).get('email');
    await portalApi(`admin/projects/${id}/members`, { method: 'POST', body: { email } });
    flash('Member invited.');
  });
  document.querySelector('#post-update').addEventListener('submit', async (event) => {
    event.preventDefault();
    const fd = new FormData(event.target);
    await portalApi(`admin/projects/${id}/updates`, {
      method: 'POST',
      body: { title: fd.get('title'), body_markdown: fd.get('body_markdown') },
    });
    flash('Update published.');
    event.target.reset();
  });
  document.querySelector('#add-document').addEventListener('submit', async (event) => {
    event.preventDefault();
    const fd = new FormData(event.target);
    await portalApi(`admin/projects/${id}/documents`, {
      method: 'POST',
      body: { title: fd.get('title'), url: fd.get('url'), description: fd.get('description') },
    });
    flash('Document added.');
    event.target.reset();
  });
}

async function render() {
  const route = readRoute();
  if (route.pathname === '/new-project') return renderNewProject();
  if (route.parts[0] === 'projects' && UUID.test(route.parts[1])) return renderProject(route.parts[1]);
  return renderDashboard();
}

document.querySelector('#logout')?.addEventListener('click', async () => {
  await fetch('/api/portal/auth/logout', { method: 'POST', credentials: 'same-origin' });
  location.href = '/portal/admin/login';
});

window.addEventListener('hashchange', () => { render().catch((e) => flash(e.message, true)); });
render().catch((error) => {
  if (error.status === 401 || error.status === 403) location.href = '/portal/admin/login';
  else flash(error.message, true);
});
