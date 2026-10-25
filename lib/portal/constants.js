export const TIMELINE_STEPS = [
  { id: 'agreement', label: 'Agreement signed' },
  { id: 'payment', label: 'Payment' },
  { id: 'access', label: 'Access checklist' },
  { id: 'kickoff', label: 'Kickoff call booked' },
  { id: 'in_progress', label: 'Audit / implementation in progress' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'retainer', label: 'Retainer active' },
];

export const KICKOFF_AGENDA = [
  'Goals, channels, and what “a conversion” means for your business',
  'Walkthrough of current tracking (tags, pixels, offline imports if any)',
  'Access gaps and timeline for the audit or implementation',
  'Communication rhythm and what to expect in the portal',
  'Q&A and next steps',
];

export const DEFAULT_WELCOME_MARKDOWN = `# Welcome to your JDCODE project

Thanks for working with JDCODE. This portal keeps onboarding and delivery in one place.

## What happens next
1. Review and accept the agreement
2. Complete payment using the link we shared
3. Grant access using the checklist
4. Book your 45-minute kickoff call
5. We deliver your audit or implementation and post updates here

## How we communicate
- **Portal updates** for milestones
- **Email** for urgent items
- Typical response time: **1 business day**

## Kickoff
Your kickoff is **45 minutes**. Please invite anyone responsible for ads, analytics, and the website.
`;

export const DEFAULT_CHECKLIST_TEMPLATES = [
  {
    slug: 'ga4',
    title: 'Google Analytics 4',
    instructions_markdown: 'Invite **jan@jdcode.dev** as Viewer on the GA4 property used for ads reporting.',
    sort_order: 10,
  },
  {
    slug: 'gtm',
    title: 'Google Tag Manager',
    instructions_markdown: 'Add Jan as **Read** user on the web container.',
    sort_order: 20,
  },
  {
    slug: 'meta',
    title: 'Meta Business / Events Manager',
    instructions_markdown: 'Partner or read access to the pixel/dataset used for lead ads.',
    sort_order: 30,
  },
  {
    slug: 'google_ads',
    title: 'Google Ads',
    instructions_markdown: 'Read-only access to the account running conversion campaigns.',
    sort_order: 40,
  },
  {
    slug: 'cmp',
    title: 'Consent Management Platform',
    instructions_markdown: 'Share admin or documentation access for your CMP.',
    sort_order: 50,
  },
  {
    slug: 'cms',
    title: 'Website / CMS',
    instructions_markdown: 'Staging or read access if we need to verify tag placement.',
    sort_order: 60,
  },
  {
    slug: 'sgtm',
    title: 'Server-side GTM hosting',
    instructions_markdown: 'If you use sGTM, share the hosting project or note **N/A**.',
    sort_order: 70,
  },
];

export const DEMO_PROJECT_ID = 'b0000000-0000-4000-8000-000000000001';
export const DEMO_CLIENT_EMAIL = 'demo.client@example.com';
