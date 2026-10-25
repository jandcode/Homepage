import { DEFAULT_WELCOME_MARKDOWN, DEFAULT_CHECKLIST_TEMPLATES } from './constants.js';
import { contentHash } from './hash.js';
import { httpError } from '../crm/http.js';
import { buildTimeline, stuckSummary } from './timeline.js';

const CLIENT = 'id, name, created_at, updated_at';
const PROJECT = 'id, client_id, title, package, work_phase, agreement_markdown, agreement_content_hash, welcome_markdown, payment_url, payment_status, booking_url, kickoff_at, demo_label, created_at, updated_at';
const MEMBER = 'id, project_id, email, user_id, invited_at, created_at';
const ACCEPT = 'id, project_id, user_id, full_name, company_name, job_title, agreement_content_hash, accepted_at, ip_address, user_agent';
const CHECKLIST = 'id, project_id, slug, title, instructions_markdown, sort_order, completed_at, completed_by_user_id, client_note, created_at, updated_at';
const DOCUMENT = 'id, project_id, title, description, url, storage_path, sort_order, created_at';
const UPDATE = 'id, project_id, title, body_markdown, published_at, created_at';

function mapDbError(error) {
  if (!error) return null;
  if (error.status) return error;
  if (error.code === 'PGRST116') return httpError(404, 'not_found', 'Record not found.');
  if (error.code === '42P01' || error.code === 'PGRST205') {
    return httpError(503, 'not_ready', 'Portal tables are missing. Run the Supabase migrations.');
  }
  if (error.code === '23505') return httpError(409, 'conflict', 'That record already exists.');
  console.error('portal database error', error.code || '', error.message || error);
  return httpError(500, 'database_error', 'The portal database request failed.');
}

async function run(query) {
  const { data, error } = await query;
  if (error) throw mapDbError(error);
  return data;
}

export function createPortalSupabaseStore(client, serviceClient = null) {
  const admin = serviceClient || client;

  async function linkMemberUser(userId, email) {
    if (!userId || !email) return;
    await admin
      .from('portal_members')
      .update({ user_id: userId })
      .eq('email', email.toLowerCase())
      .is('user_id', null);
  }

  async function projectBundle(projectId) {
    const project = await run(
      client.from('portal_projects').select(`${PROJECT}, client:portal_clients(id, name)`).eq('id', projectId).maybeSingle(),
    );
    if (!project) throw httpError(404, 'not_found', 'Project not found.');
    const [checklist, acceptance, docs, feed] = await Promise.all([
      run(client.from('portal_checklist_items').select(CHECKLIST).eq('project_id', projectId).order('sort_order')),
      run(client.from('portal_agreement_acceptances').select(ACCEPT).eq('project_id', projectId).maybeSingle()),
      run(client.from('portal_documents').select(DOCUMENT).eq('project_id', projectId).order('sort_order')),
      run(client.from('portal_updates').select(UPDATE).eq('project_id', projectId).order('published_at', { ascending: false })),
    ]);
    const ctx = { project, checklist: checklist || [], acceptance };
    return {
      project,
      checklist: checklist || [],
      acceptance,
      documents: docs || [],
      updates: feed || [],
      timeline: buildTimeline(ctx),
      welcome_markdown: project.welcome_markdown || DEFAULT_WELCOME_MARKDOWN,
    };
  }

  return {
    linkMemberUser,
    async emailIsPortalMember(email) {
      const { count, error } = await admin
        .from('portal_members')
        .select('id', { count: 'exact', head: true })
        .eq('email', String(email || '').toLowerCase());
      if (error) throw mapDbError(error);
      return (count || 0) > 0;
    },
    async listProjectsForUser({ isAdmin }) {
      let query = client.from('portal_projects').select(`${PROJECT}, client:portal_clients(id, name)`).order('updated_at', { ascending: false });
      const rows = await run(query);
      const enriched = [];
      for (const project of rows || []) {
        const checklist = await run(
          client.from('portal_checklist_items').select('id, completed_at').eq('project_id', project.id),
        );
        const acceptance = await run(
          client.from('portal_agreement_acceptances').select('id').eq('project_id', project.id).maybeSingle(),
        );
        const ctx = { project, checklist: checklist || [], acceptance };
        enriched.push({
          ...project,
          client: Array.isArray(project.client) ? project.client[0] : project.client,
          stuck_at: stuckSummary(ctx),
        });
      }
      return enriched;
    },
    async getProjectDetail(projectId) {
      return projectBundle(projectId);
    },
    async acceptAgreement(projectId, { userId, ip, userAgent, data }) {
      const project = await run(client.from('portal_projects').select('agreement_content_hash').eq('id', projectId).maybeSingle());
      if (!project) throw httpError(404, 'not_found', 'Project not found.');
      const row = {
        project_id: projectId,
        user_id: userId,
        full_name: data.full_name,
        company_name: data.company_name,
        job_title: data.job_title,
        agreement_content_hash: project.agreement_content_hash,
        ip_address: ip || null,
        user_agent: userAgent || null,
      };
      return run(client.from('portal_agreement_acceptances').insert(row).select(ACCEPT).single());
    },
    async patchChecklistItem(itemId, patch, userId) {
      const updates = {};
      if (patch.client_note !== undefined) updates.client_note = patch.client_note;
      if (patch.completed !== undefined) {
        updates.completed_at = patch.completed ? new Date().toISOString() : null;
        updates.completed_by_user_id = patch.completed ? userId : null;
      }
      return run(
        client.from('portal_checklist_items').update(updates).eq('id', itemId).select(CHECKLIST).single(),
      );
    },
    async adminCreateClient({ name }) {
      return run(admin.from('portal_clients').insert({ name }).select(CLIENT).single());
    },
    async adminCreateProject(payload) {
      const agreement = payload.agreement_markdown || '';
      const project = await run(
        admin.from('portal_projects').insert({
          client_id: payload.client_id,
          title: payload.title,
          package: payload.package || 'audit',
          agreement_markdown: agreement,
          agreement_content_hash: contentHash(agreement),
          welcome_markdown: payload.welcome_markdown || null,
          payment_url: payload.payment_url || null,
          booking_url: payload.booking_url || null,
        }).select(PROJECT).single(),
      );
      const items = DEFAULT_CHECKLIST_TEMPLATES.map((template) => ({
        project_id: project.id,
        ...template,
      }));
      await run(admin.from('portal_checklist_items').insert(items));
      return project;
    },
    async adminInviteMember(projectId, { email }) {
      return run(
        admin.from('portal_members').insert({
          project_id: projectId,
          email: String(email || '').toLowerCase(),
        }).select(MEMBER).single(),
      );
    },
    async adminPatchProject(projectId, patch) {
      const updates = { ...patch };
      if (patch.agreement_markdown !== undefined) {
        updates.agreement_content_hash = contentHash(patch.agreement_markdown);
      }
      delete updates.id;
      return run(admin.from('portal_projects').update(updates).eq('id', projectId).select(PROJECT).single());
    },
    async adminPostUpdate(projectId, { title, body_markdown }) {
      return run(
        admin.from('portal_updates').insert({ project_id: projectId, title, body_markdown }).select(UPDATE).single(),
      );
    },
    async adminAddDocument(projectId, doc) {
      return run(
        admin.from('portal_documents').insert({
          project_id: projectId,
          title: doc.title,
          description: doc.description || null,
          url: doc.url || null,
          storage_path: doc.storage_path || null,
          sort_order: doc.sort_order ?? 0,
        }).select(DOCUMENT).single(),
      );
    },
    async adminPatchChecklistItem(itemId, patch) {
      return run(
        admin.from('portal_checklist_items').update(patch).eq('id', itemId).select(CHECKLIST).single(),
      );
    },
    async adminListClients() {
      return run(admin.from('portal_clients').select(CLIENT).order('name'));
    },
    async adminListMembers(projectId) {
      return run(admin.from('portal_members').select(MEMBER).eq('project_id', projectId));
    },
  };
}
