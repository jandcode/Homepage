# jdcode.dev

Static site for Jan Dorbath / JDCODE. The public pages are plain HTML, CSS, and JavaScript. A private CRM lives under `/admin` and does not change those pages.

## Private CRM

`/admin` is a small pipeline for the audit → fix → retainer work: companies, contacts, deals, notes, and stage history. It is not indexed. Jan signs in with Supabase email and password. An assistant can use the HTTP API with a bearer key. Details and curl examples: [docs/crm-api.md](docs/crm-api.md).

### 1. Create the Supabase project

Create a project in the Supabase dashboard. In **Project Settings → API**, copy:

- Project URL → `SUPABASE_URL`
- `anon` / public key → `SUPABASE_ANON_KEY`
- `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

If the dashboard shows publishable and secret keys first, the JWT keys are under the legacy anon and service_role section. The anon key stays on the server in this app. The service role key is server-only. Never put either key in browser code.

### 2. Turn off public sign-up and create the admin user

In **Authentication → Providers → Email** (and the project-wide sign-up setting), disable new user sign-ups. Under **Authentication → Users → Add user**, create Jan’s email and a password and mark the email confirmed. Password sign-in has to be enabled. The email must be listed in `CRM_ADMIN_EMAILS`.

### 3. Run the migration

The schema is `supabase/migrations/20261024035345_crm_init.sql`.

With the Supabase CLI, from this repo:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Or open the SQL editor in the dashboard and run that file once.

Do not add the `private` schema to the Data API exposed schemas.

### 4. Set the Vercel environment variables

Add these for Production (and Preview, if the preview deployment should have a CRM). Redeploy after saving.

| Name | Where |
| --- | --- |
| `SUPABASE_URL` | Server |
| `SUPABASE_ANON_KEY` | Server |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only |
| `CRM_ADMIN_EMAILS` | Server. Comma-separated, e.g. `jan@jdcode.dev` |
| `CRM_API_KEY` | Server only. `openssl rand -hex 32` |

Optional:

| Name | Purpose |
| --- | --- |
| `CRM_TIMEZONE` | IANA zone for “today” and won-this-month. Default `Europe/Berlin`. |
| `CRM_CONTACT_TO_LEAD` | `true` turns on `POST /api/crm/inbound/contact`. Leave unset. |

See `.env.example`. Do not commit `.env`.

### 5. Sign in

Open `https://jdcode.dev/admin` and sign in with the Supabase user. The first login copies `CRM_ADMIN_EMAILS` into `crm_admin_emails` so Row Level Security matches the env allowlist. Removing an address from the env var takes effect on the next login or token refresh.

## Checks

```bash
npm test
npm run preview
```

`npm run preview` serves the site with an in-memory CRM and client portal at `http://127.0.0.1:4173`. It prints local login hints. It does not talk to Supabase and must not be deployed.

There is no compile step for the public HTML. `npm test` checks the CRM and portal, and Vercel serves the repository root plus the functions in `/api`.

## Client portal (`/portal`)

Logged-in area for clients after they say yes to a project: onboarding timeline, agreement clickwrap, payment link, welcome doc, access checklist, kickoff booking, documents, and status updates. Jan manages projects at `/portal/admin`. Routes are `noindex` and do not affect the public marketing site.

### Supabase setup (portal)

1. Apply migrations in order under `supabase/migrations/` (CRM, then `20261025120000_portal_init.sql`). Do not apply to production until you are ready.

2. **Auth — clients (magic link)**  
   - Keep **Email** provider enabled.  
   - You can leave sign-up disabled for random visitors; invited clients are created on first magic link (`should_create_user`).  
   - Under **Authentication → URL configuration**, add redirect URLs:
     - `https://jdcode.dev/api/portal/auth/callback`
     - `https://<your-preview-host>/api/portal/auth/callback` (for Vercel previews)
     - `http://127.0.0.1:4173/api/portal/auth/callback` (local preview with Supabase, if used)

3. **Auth — Jan (portal admin)**  
   Same Supabase user as the CRM (`CRM_ADMIN_EMAILS`). Password sign-in at `/portal/admin/login`.

4. **Optional demo rows**  
   Run `supabase/seed_portal.sql` in a dev project only (clearly labeled DEMO data).

5. **Storage**  
   Migration creates a private `portal-documents` bucket. Admin document links can be external URLs; storage uploads can be wired later.

### Environment variables (portal)

Uses the same server-side Supabase vars as the CRM (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRM_ADMIN_EMAILS`). No keys in the browser.

| Name | Purpose |
| --- | --- |
| `PORTAL_PREVIEW` | Optional. Set `true` on Vercel **Preview** to allow `preview-login` for demos. Never set on production. |

### Local mock mode

`npm run preview` includes in-memory portal data (Acme Recruiting DEMO). Use **Preview as demo client** on `/portal/login` or **Preview admin** on `/portal/admin/login`.

### App UI (portal + CRM)

Logged-in surfaces load `app/assets/mission.css`, which imports `assets/cine.css` from the public site and adds mission-control layout (tables, pipeline, portal stepper). Light Terrafab patterns live in `assets/tf.css` on the marketing pages only.
