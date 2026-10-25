-- Demo portal data for local previews. Clearly labeled; safe to skip in production.
-- Run manually after migrations if you want sample rows in a dev project.

insert into public.portal_clients (id, name)
values ('a0000000-0000-4000-8000-000000000001', 'Acme Recruiting (DEMO)')
on conflict do nothing;

insert into public.portal_projects (
  id,
  client_id,
  title,
  package,
  work_phase,
  agreement_markdown,
  agreement_content_hash,
  welcome_markdown,
  payment_url,
  payment_status,
  booking_url,
  demo_label
)
values (
  'b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'Tracking Audit — Q4 (DEMO)',
  'audit',
  'onboarding',
  $agreement$
# Statement of Work — Tracking Audit (DEMO)

This is **sample agreement text** for preview only. It is not a binding contract.

## Scope
JDCODE LLC will review your paid-media conversion tracking setup and deliver a written audit with prioritized fixes.

## Deliverables
- Access review checklist
- 45-minute kickoff call
- Audit report (PDF) within 10 business days after access is complete

## Client responsibilities
Grant read access to the platforms listed in the portal checklist and respond to questions within 2 business days.

## Fees
Fees are agreed offline. Payment is completed via the link in your portal.

*Version: demo-2026-10-25*
$agreement$,
  encode(digest($agreement$
# Statement of Work — Tracking Audit (DEMO)

This is **sample agreement text** for preview only. It is not a binding contract.

## Scope
JDCODE LLC will review your paid-media conversion tracking setup and deliver a written audit with prioritized fixes.

## Deliverables
- Access review checklist
- 45-minute kickoff call
- Audit report (PDF) within 10 business days after access is complete

## Client responsibilities
Grant read access to the platforms listed in the portal checklist and respond to questions within 2 business days.

## Fees
Fees are agreed offline. Payment is completed via the link in your portal.

*Version: demo-2026-10-25*
$agreement$, 'sha256'), 'hex'),
  $welcome$
# Welcome to your JDCODE project (DEMO)

Thanks for choosing JDCODE. This portal is your home base for onboarding and delivery.

## What happens next
1. Review and accept the agreement
2. Complete payment
3. Grant access using the checklist
4. Book your 45-minute kickoff call
5. We run the audit and share the report in **Documents**

## How we communicate
- **Portal updates** for milestones (check the feed on your dashboard)
- **Email** for time-sensitive questions
- Typical response time: **1 business day** (Mon–Fri, US/EU-friendly)

## Your kickoff
The kickoff is fixed at **45 minutes**. Come prepared with your main ad platforms and any recent conversion issues.
$welcome$,
  'https://example.com/pay-demo',
  'pending',
  'https://cal.com/jdcode/kickoff-demo',
  'DEMO — not a real client'
)
on conflict do nothing;

insert into public.portal_members (project_id, email)
values (
  'b0000000-0000-4000-8000-000000000001',
  'demo.client@example.com'
)
on conflict do nothing;

insert into public.portal_checklist_items (project_id, slug, title, instructions_markdown, sort_order)
values
  (
    'b0000000-0000-4000-8000-000000000001',
    'ga4',
    'Google Analytics 4',
    'Invite **jan@jdcode.dev** as Viewer on the GA4 property used for ads reporting.',
    10
  ),
  (
    'b0000000-0000-4000-8000-000000000001',
    'gtm',
    'Google Tag Manager',
    'Add Jan as **Read** user on the web container. Note the container ID in the field below if helpful.',
    20
  ),
  (
    'b0000000-0000-4000-8000-000000000001',
    'meta',
    'Meta Business / Events Manager',
    'Partner access or Events Manager read access to the pixel/dataset used for lead ads.',
    30
  ),
  (
    'b0000000-0000-4000-8000-000000000001',
    'google_ads',
    'Google Ads',
    'Read-only access to the account running conversion campaigns.',
    40
  ),
  (
    'b0000000-0000-4000-8000-000000000001',
    'cmp',
    'Consent Management Platform',
    'Share admin or documentation access for your CMP (Cookiebot, Usercentrics, etc.).',
    50
  ),
  (
    'b0000000-0000-4000-8000-000000000001',
    'cms',
    'Website / CMS',
    'Staging or read access if we need to verify tag placement (optional for audit-only).',
    60
  ),
  (
    'b0000000-0000-4000-8000-000000000001',
    'sgtm',
    'Server-side GTM hosting',
    'If you use sGTM, share the hosting project (Stape, GCP, etc.) or note **N/A**.',
    70
  )
on conflict (project_id, slug) do nothing;

insert into public.portal_updates (project_id, title, body_markdown, published_at)
values (
  'b0000000-0000-4000-8000-000000000001',
  'Portal ready (DEMO)',
  'Your project space is set up. Complete the agreement and payment when you are ready — this is sample data for preview.',
  now() - interval '1 hour'
)
on conflict do nothing;
