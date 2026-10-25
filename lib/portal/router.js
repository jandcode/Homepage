import { isAllowlisted, parseAllowlist, sameOriginWrite, clientIp } from '../crm/auth.js';
import { parseCookies } from './cookies.js';
import { errorBody, httpError, json, readJson, requireJson } from '../crm/http.js';
import { isUuid, validateAcceptAgreement, validateChecklistPatch } from './validate.js';

function portalPath(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path !== '/api/portal' && !path.startsWith('/api/portal/')) return null;
  const rest = path.slice('/api/portal'.length).replace(/^\//, '');
  if (rest.startsWith('auth/')) return null;
  return rest;
}

function toErrorResponse(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = error?.code || 'internal_error';
  const message = error?.expose ? error.message : 'Something went wrong.';
  if (!error?.expose) console.error(error);
  return json(status, errorBody(code, message, error?.fields));
}

async function authenticate(request, deps) {
  const cookies = parseCookies(request.headers.get('cookie'));
  if (!cookies.portal_access) {
    return { ok: false, status: 401, code: 'unauthorized', message: 'Missing or invalid credentials.' };
  }
  const user = await deps.verifyAccessToken(cookies.portal_access);
  if (!user?.email) {
    return { ok: false, status: 401, code: 'unauthorized', message: 'Missing or invalid credentials.' };
  }
  const email = user.email.toLowerCase();
  const admin = isAllowlisted(email, parseAllowlist(deps.env.CRM_ADMIN_EMAILS || ''));
  const invited = admin || (await deps.store.emailIsPortalMember(email));
  if (!invited) {
    return { ok: false, status: 403, code: 'forbidden', message: 'This account is not allowed to use the portal.' };
  }
  if (deps.store.linkMemberUser) await deps.store.linkMemberUser(user.id, email);
  return { ok: true, email, admin, userId: user.id, accessToken: cookies.portal_access };
}

function requireAdmin(auth) {
  if (!auth.admin) throw httpError(403, 'forbidden', 'Admin access required.');
}

export async function handlePortalRequest(request, deps) {
  try {
    const url = new URL(request.url);
    const path = portalPath(url.pathname);
    if (path == null) return json(404, errorBody('not_found', 'Not found.'));
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { allow: 'GET, POST, PATCH, OPTIONS', 'x-robots-tag': 'noindex' },
      });
    }

    const auth = await authenticate(request, deps);
    if (!auth.ok) return json(auth.status, errorBody(auth.code, auth.message));

    const segments = path.split('/').filter(Boolean);

    if (segments[0] === 'me' && segments.length === 1 && request.method === 'GET') {
      const projects = await deps.store.listProjectsForUser({ email: auth.email, isAdmin: auth.admin });
      return json(200, { data: { email: auth.email, admin: auth.admin, projects } });
    }

    if (segments[0] === 'projects' && segments.length === 2 && isUuid(segments[1]) && request.method === 'GET') {
      const detail = await deps.store.getProjectDetail(segments[1], {
        email: auth.email,
        isAdmin: auth.admin,
      });
      return json(200, { data: detail });
    }

    if (
      segments[0] === 'projects'
      && segments.length === 3
      && segments[2] === 'accept-agreement'
      && isUuid(segments[1])
      && request.method === 'POST'
    ) {
      if (!sameOriginWrite(request)) return json(403, errorBody('forbidden', 'Cross-site writes are blocked.'));
      requireJson(request);
      const body = await readJson(request);
      const validated = validateAcceptAgreement(body);
      if (!validated.ok) return json(400, errorBody('validation_error', 'Check the form.', validated.fields));
      const row = await deps.store.acceptAgreement(segments[1], {
        userId: auth.userId,
        email: auth.email,
        ip: clientIp(request),
        userAgent: request.headers.get('user-agent') || '',
        data: validated.data,
      });
      return json(201, { data: row });
    }

    if (
      segments[0] === 'checklist'
      && segments.length === 2
      && isUuid(segments[1])
      && request.method === 'PATCH'
    ) {
      if (!sameOriginWrite(request)) return json(403, errorBody('forbidden', 'Cross-site writes are blocked.'));
      requireJson(request);
      const body = await readJson(request);
      const validated = validateChecklistPatch(body);
      if (!validated.ok) return json(400, errorBody('validation_error', 'Invalid update.', validated.fields));
      const row = await deps.store.patchChecklistItem(
        segments[1],
        { email: auth.email, isAdmin: auth.admin },
        validated.data,
        auth.userId,
      );
      return json(200, { data: row });
    }

    if (segments[0] === 'admin') {
      requireAdmin(auth);
      if (!sameOriginWrite(request) && request.method !== 'GET') {
        return json(403, errorBody('forbidden', 'Cross-site writes are blocked.'));
      }

      if (segments[1] === 'overview' && segments.length === 2 && request.method === 'GET') {
        const projects = await deps.store.listProjectsForUser({ email: auth.email, isAdmin: true });
        return json(200, { data: { projects } });
      }

      if (segments[1] === 'clients' && segments.length === 2) {
        if (request.method === 'GET') {
          const rows = await deps.store.adminListClients();
          return json(200, { data: rows });
        }
        if (request.method === 'POST') {
          requireJson(request);
          const body = await readJson(request);
          const name = typeof body.name === 'string' ? body.name.trim() : '';
          if (!name) return json(400, errorBody('validation_error', 'Name is required.'));
          const row = await deps.store.adminCreateClient({ name });
          return json(201, { data: row });
        }
      }

      if (segments[1] === 'projects' && segments.length === 2) {
        if (request.method === 'POST') {
          requireJson(request);
          const body = await readJson(request);
          if (!isUuid(body.client_id) || !body.title) {
            return json(400, errorBody('validation_error', 'client_id and title are required.'));
          }
          const row = await deps.store.adminCreateProject(body);
          return json(201, { data: row });
        }
      }

      if (segments[1] === 'projects' && segments.length === 3 && isUuid(segments[2])) {
        const projectId = segments[2];
        if (request.method === 'GET') {
          const detail = await deps.store.getProjectDetail(projectId, { email: auth.email, isAdmin: true });
          const memberList = deps.store.adminListMembers
            ? await deps.store.adminListMembers(projectId)
            : [];
          return json(200, { data: { ...detail, members: memberList } });
        }
        if (request.method === 'PATCH') {
          requireJson(request);
          const body = await readJson(request);
          const row = await deps.store.adminPatchProject(projectId, body);
          return json(200, { data: row });
        }
      }

      if (
        segments[1] === 'projects'
        && segments.length === 4
        && segments[3] === 'members'
        && isUuid(segments[2])
        && request.method === 'POST'
      ) {
        requireJson(request);
        const body = await readJson(request);
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
        if (!email) return json(400, errorBody('validation_error', 'Email is required.'));
        const row = await deps.store.adminInviteMember(segments[2], { email });
        return json(201, { data: row });
      }

      if (
        segments[1] === 'projects'
        && segments.length === 4
        && segments[3] === 'updates'
        && isUuid(segments[2])
        && request.method === 'POST'
      ) {
        requireJson(request);
        const body = await readJson(request);
        if (!body.title || !body.body_markdown) {
          return json(400, errorBody('validation_error', 'title and body_markdown are required.'));
        }
        const row = await deps.store.adminPostUpdate(segments[2], body);
        return json(201, { data: row });
      }

      if (
        segments[1] === 'projects'
        && segments.length === 4
        && segments[3] === 'documents'
        && isUuid(segments[2])
        && request.method === 'POST'
      ) {
        requireJson(request);
        const body = await readJson(request);
        if (!body.title || (!body.url && !body.storage_path)) {
          return json(400, errorBody('validation_error', 'title and url or storage_path are required.'));
        }
        const row = await deps.store.adminAddDocument(segments[2], body);
        return json(201, { data: row });
      }

      if (segments[1] === 'checklist' && segments.length === 3 && isUuid(segments[2]) && request.method === 'PATCH') {
        requireJson(request);
        const body = await readJson(request);
        const row = await deps.store.adminPatchChecklistItem(segments[2], body);
        return json(200, { data: row });
      }
    }

    return json(404, errorBody('not_found', 'Not found.'));
  } catch (error) {
    return toErrorResponse(error);
  }
}
