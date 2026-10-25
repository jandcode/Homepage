import { randomUUID } from 'node:crypto';
import {
  DEFAULT_CHECKLIST_TEMPLATES,
  DEFAULT_WELCOME_MARKDOWN,
  DEMO_CLIENT_EMAIL,
  DEMO_PROJECT_ID,
} from './constants.js';
import { contentHash } from './hash.js';
import { httpError } from '../crm/http.js';
import { buildTimeline, stuckSummary } from './timeline.js';

function clone(value) {
  return structuredClone(value);
}

const DEMO_AGREEMENT = `# Statement of Work — Tracking Audit (DEMO)

This is **sample agreement text** for preview only.

## Scope
JDCODE LLC will review your paid-media conversion tracking setup and deliver a written audit with prioritized fixes.

*Version: demo-2026-10-25*
`;

function seedDemo() {
  const clientId = 'a0000000-0000-4000-8000-000000000001';
  const projectId = DEMO_PROJECT_ID;
  const now = new Date().toISOString();
  const client = { id: clientId, name: 'Acme Recruiting (DEMO)', created_at: now, updated_at: now };
  const project = {
    id: projectId,
    client_id: clientId,
    title: 'Tracking Audit — Q4 (DEMO)',
    package: 'audit',
    work_phase: 'onboarding',
    agreement_markdown: DEMO_AGREEMENT,
    agreement_content_hash: contentHash(DEMO_AGREEMENT),
    welcome_markdown: DEFAULT_WELCOME_MARKDOWN,
    payment_url: 'https://example.com/pay-demo',
    payment_status: 'pending',
    booking_url: 'https://cal.com/jdcode/kickoff-demo',
    kickoff_at: null,
    demo_label: 'DEMO — not a real client',
    created_at: now,
    updated_at: now,
  };
  const members = [{
    id: randomUUID(),
    project_id: projectId,
    email: DEMO_CLIENT_EMAIL,
    user_id: null,
    invited_at: now,
    created_at: now,
  }];
  const checklist = DEFAULT_CHECKLIST_TEMPLATES.map((item) => ({
    id: randomUUID(),
    project_id: projectId,
    ...item,
    completed_at: null,
    completed_by_user_id: null,
    client_note: null,
    created_at: now,
    updated_at: now,
  }));
  const updates = [{
    id: randomUUID(),
    project_id: projectId,
    title: 'Portal ready (DEMO)',
    body_markdown: 'Your project space is set up. Complete the agreement and payment when you are ready.',
    published_at: now,
    created_at: now,
  }];
  return { client, project, members, checklist, updates, documents: [] };
}

export function createPortalMemoryStore() {
  const clients = [];
  const projects = [];
  const members = [];
  const acceptances = [];
  const checklist = [];
  const documents = [];
  const updates = [];

  const demo = seedDemo();
  clients.push(demo.client);
  projects.push(demo.project);
  members.push(...demo.members);
  checklist.push(...demo.checklist);
  updates.push(...demo.updates);

  function requireProject(id) {
    const project = projects.find((row) => row.id === id);
    if (!project) throw httpError(404, 'not_found', 'Project not found.');
    return project;
  }

  function memberProjectsForEmail(email) {
    const normalized = String(email || '').toLowerCase();
    const projectIds = members.filter((m) => m.email === normalized).map((m) => m.project_id);
    return projects.filter((p) => projectIds.includes(p.id));
  }

  function linkMemberUser(email, userId) {
    const normalized = String(email || '').toLowerCase();
    members.forEach((m) => {
      if (m.email === normalized && !m.user_id) m.user_id = userId;
    });
  }

  function isMember(email, projectId) {
    const normalized = String(email || '').toLowerCase();
    return members.some((m) => m.project_id === projectId && m.email === normalized);
  }

  function projectDetail(projectId, { email, isAdmin }) {
    const project = requireProject(projectId);
    if (!isAdmin && !isMember(email, projectId)) {
      throw httpError(403, 'forbidden', 'You do not have access to this project.');
    }
    const client = clients.find((c) => c.id === project.client_id);
    const items = checklist.filter((c) => c.project_id === projectId).sort((a, b) => a.sort_order - b.sort_order);
    const acceptance = acceptances.find((a) => a.project_id === projectId) || null;
    const ctx = { project, checklist: items, acceptance };
    return {
      project: clone({ ...project, client: client ? { id: client.id, name: client.name } : null }),
      checklist: items.map(clone),
      acceptance: acceptance ? clone(acceptance) : null,
      documents: documents.filter((d) => d.project_id === projectId).sort((a, b) => a.sort_order - b.sort_order).map(clone),
      updates: updates.filter((u) => u.project_id === projectId).sort((a, b) => b.published_at.localeCompare(a.published_at)).map(clone),
      timeline: buildTimeline(ctx),
      welcome_markdown: project.welcome_markdown || DEFAULT_WELCOME_MARKDOWN,
    };
  }

  return {
    async emailIsPortalMember(email) {
      const normalized = String(email || '').toLowerCase();
      return members.some((m) => m.email === normalized);
    },
    linkMemberUser,
    async listProjectsForUser({ email, isAdmin }) {
      if (isAdmin) {
        return projects.map((p) => {
          const client = clients.find((c) => c.id === p.client_id);
          const items = checklist.filter((c) => c.project_id === p.id);
          const acceptance = acceptances.find((a) => a.project_id === p.id) || null;
          const ctx = { project: p, checklist: items, acceptance };
          return {
            ...clone(p),
            client: client ? { id: client.id, name: client.name } : null,
            stuck_at: stuckSummary(ctx),
          };
        });
      }
      return memberProjectsForEmail(email).map((p) => {
        const client = clients.find((c) => c.id === p.client_id);
        const items = checklist.filter((c) => c.project_id === p.id);
        const acceptance = acceptances.find((a) => a.project_id === p.id) || null;
        const ctx = { project: p, checklist: items, acceptance };
        return {
          ...clone(p),
          client: client ? { id: client.id, name: client.name } : null,
          stuck_at: stuckSummary(ctx),
        };
      });
    },
    async getProjectDetail(projectId, auth) {
      return projectDetail(projectId, auth);
    },
    async acceptAgreement(projectId, { userId, email, ip, userAgent, data }) {
      if (!isMember(email, projectId)) throw httpError(403, 'forbidden', 'You do not have access to this project.');
      const project = requireProject(projectId);
      if (acceptances.some((a) => a.project_id === projectId)) {
        throw httpError(409, 'conflict', 'Agreement was already accepted.');
      }
      const row = {
        id: randomUUID(),
        project_id: projectId,
        user_id: userId || randomUUID(),
        full_name: data.full_name,
        company_name: data.company_name,
        job_title: data.job_title,
        agreement_content_hash: project.agreement_content_hash,
        accepted_at: new Date().toISOString(),
        ip_address: ip,
        user_agent: userAgent,
      };
      acceptances.push(row);
      return clone(row);
    },
    async patchChecklistItem(itemId, { email, isAdmin }, patch, _userId) {
      const item = checklist.find((c) => c.id === itemId);
      if (!item) throw httpError(404, 'not_found', 'Checklist item not found.');
      if (!isAdmin && !isMember(email, item.project_id)) {
        throw httpError(403, 'forbidden', 'You do not have access to this checklist item.');
      }
      if (patch.client_note !== undefined) item.client_note = patch.client_note;
      if (patch.completed !== undefined) {
        if (patch.completed) {
          item.completed_at = new Date().toISOString();
          item.completed_by_user_id = null;
        } else {
          item.completed_at = null;
          item.completed_by_user_id = null;
        }
      }
      item.updated_at = new Date().toISOString();
      return clone(item);
    },
    async adminCreateClient({ name }) {
      const now = new Date().toISOString();
      const row = { id: randomUUID(), name, created_at: now, updated_at: now };
      clients.push(row);
      return clone(row);
    },
    async adminCreateProject(payload) {
      const now = new Date().toISOString();
      const agreement = payload.agreement_markdown || '';
      const row = {
        id: randomUUID(),
        client_id: payload.client_id,
        title: payload.title,
        package: payload.package || 'audit',
        work_phase: 'onboarding',
        agreement_markdown: agreement,
        agreement_content_hash: contentHash(agreement),
        welcome_markdown: payload.welcome_markdown || null,
        payment_url: payload.payment_url || null,
        payment_status: 'pending',
        booking_url: payload.booking_url || null,
        kickoff_at: null,
        demo_label: null,
        created_at: now,
        updated_at: now,
      };
      projects.push(row);
      DEFAULT_CHECKLIST_TEMPLATES.forEach((template) => {
        checklist.push({
          id: randomUUID(),
          project_id: row.id,
          ...template,
          completed_at: null,
          completed_by_user_id: null,
          client_note: null,
          created_at: now,
          updated_at: now,
        });
      });
      return clone(row);
    },
    async adminInviteMember(projectId, { email }) {
      requireProject(projectId);
      const normalized = String(email || '').toLowerCase();
      if (members.some((m) => m.project_id === projectId && m.email === normalized)) {
        throw httpError(409, 'conflict', 'That email is already invited.');
      }
      const now = new Date().toISOString();
      const row = {
        id: randomUUID(),
        project_id: projectId,
        email: normalized,
        user_id: null,
        invited_at: now,
        created_at: now,
      };
      members.push(row);
      return clone(row);
    },
    async adminPatchProject(projectId, patch) {
      const project = requireProject(projectId);
      const fields = [
        'title', 'package', 'work_phase', 'agreement_markdown', 'welcome_markdown',
        'payment_url', 'payment_status', 'booking_url', 'kickoff_at', 'demo_label',
      ];
      fields.forEach((key) => {
        if (patch[key] !== undefined) project[key] = patch[key];
      });
      if (patch.agreement_markdown !== undefined) {
        project.agreement_content_hash = contentHash(patch.agreement_markdown);
      }
      project.updated_at = new Date().toISOString();
      return clone(project);
    },
    async adminPostUpdate(projectId, { title, body_markdown }) {
      requireProject(projectId);
      const now = new Date().toISOString();
      const row = {
        id: randomUUID(),
        project_id: projectId,
        title,
        body_markdown,
        published_at: now,
        created_at: now,
      };
      updates.push(row);
      return clone(row);
    },
    async adminAddDocument(projectId, doc) {
      requireProject(projectId);
      const row = {
        id: randomUUID(),
        project_id: projectId,
        title: doc.title,
        description: doc.description || null,
        url: doc.url || null,
        storage_path: doc.storage_path || null,
        sort_order: doc.sort_order ?? 0,
        created_at: new Date().toISOString(),
      };
      documents.push(row);
      return clone(row);
    },
    async adminPatchChecklistItem(itemId, patch) {
      const item = checklist.find((c) => c.id === itemId);
      if (!item) throw httpError(404, 'not_found', 'Checklist item not found.');
      ['title', 'instructions_markdown', 'sort_order'].forEach((key) => {
        if (patch[key] !== undefined) item[key] = patch[key];
      });
      item.updated_at = new Date().toISOString();
      return clone(item);
    },
    async adminListClients() {
      return clients.map(clone);
    },
  };
}
