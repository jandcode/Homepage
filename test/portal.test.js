import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline } from '../lib/portal/timeline.js';
import { createPortalMemoryStore } from '../lib/portal/memory-store.js';
import { handlePortalRequest } from '../lib/portal/router.js';
import { DEMO_CLIENT_EMAIL, DEMO_PROJECT_ID } from '../lib/portal/constants.js';
import { randomUUID } from 'node:crypto';

test('timeline marks agreement as current for fresh demo project', () => {
  const project = { payment_status: 'pending', kickoff_at: null, work_phase: 'onboarding', package: 'audit' };
  const timeline = buildTimeline({ project, checklist: [{ completed_at: null }], acceptance: null });
  assert.equal(timeline.find((s) => s.id === 'agreement')?.status, 'current');
});

test('portal client can load demo project detail via memory store', async () => {
  const store = createPortalMemoryStore();
  const detail = await store.getProjectDetail(DEMO_PROJECT_ID, { email: DEMO_CLIENT_EMAIL, isAdmin: false });
  assert.equal(detail.project.title.includes('DEMO'), true);
  assert.ok(detail.checklist.length >= 5);
});

test('portal API rejects unauthenticated requests', async () => {
  const store = createPortalMemoryStore();
  const request = new Request('http://localhost/api/portal/me');
  const response = await handlePortalRequest(request, {
    env: { CRM_ADMIN_EMAILS: 'jan@jdcode.dev' },
    verifyAccessToken: async () => null,
    store,
  });
  assert.equal(response.status, 401);
});

test('portal API allows demo client with mocked session', async () => {
  const store = createPortalMemoryStore();
  const request = new Request('http://localhost/api/portal/me', {
    headers: { cookie: 'portal_access=test-token' },
  });
  const response = await handlePortalRequest(request, {
    env: { CRM_ADMIN_EMAILS: 'jan@jdcode.dev' },
    verifyAccessToken: async () => ({ id: randomUUID(), email: DEMO_CLIENT_EMAIL }),
    store,
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(body.data.projects.length >= 1);
});
