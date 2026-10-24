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

`npm run preview` serves the site with an in-memory CRM at `http://127.0.0.1:4173`. It prints a local login. It does not talk to Supabase and must not be deployed.

There is no compile step for the public HTML. `npm test` checks the CRM, and Vercel serves the repository root plus the functions in `/api`.
