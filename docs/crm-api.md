# CRM API

Base URL: `https://jdcode.dev/api/crm`

The assistant authenticates with a bearer key:

```bash
export CRM_API_KEY="paste-from-vercel"
```

Send `Authorization: Bearer $CRM_API_KEY` and `Content-Type: application/json` on writes. The browser admin uses an httpOnly session cookie instead. Do not put the API key in frontend code.

Unknown JSON fields are ignored. Money is a number with up to two decimals. Currency is a 3-letter code and defaults to `USD`. Stages:

`lead`, `contacted`, `audit_call_booked`, `audit_paid`, `fix_project`, `retainer`, `won`, `lost`

There is no delete endpoint. Move a deal to `lost` to close it.

## Errors

```json
{ "error": { "code": "validation_error", "message": "Check the highlighted fields.", "fields": { "title": "Required." } } }
```

| Status | code | When |
| --- | --- | --- |
| 400 | `validation_error` or `invalid_json` | Bad input |
| 401 | `unauthorized` | Missing or wrong API key |
| 403 | `forbidden` | Signed-in user is not on `CRM_ADMIN_EMAILS`, or a cross-site cookie write |
| 404 | `not_found` | Unknown id or route |
| 405 | `method_not_allowed` | Wrong verb |
| 413 | `payload_too_large` | Body over 100 KB |
| 415 | `unsupported_media_type` | Write without JSON |
| 429 | `rate_limited` | Too many sign-ins or public inquiries |
| 503 | `not_configured` or `not_ready` | Env vars missing, or migrations not applied |

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://jdcode.dev/api/crm/deals
# 401
```

## Deals

List. Optional `q`, `stage`, `company_id`, `contact_id`, `limit` (max 200), `offset`.

```bash
curl -sS "https://jdcode.dev/api/crm/deals?stage=lead&limit=50" \
  -H "Authorization: Bearer $CRM_API_KEY"
```

Create. `company_name`, `contact_name`, and `contact_email` create linked records when you do not already have ids.

```bash
curl -sS https://jdcode.dev/api/crm/deals \
  -H "Authorization: Bearer $CRM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Northwind audit",
    "value": 990,
    "currency": "USD",
    "stage": "lead",
    "source": "referral",
    "next_step": "Send audit outline",
    "next_step_date": "2026-10-28",
    "company_name": "Northwind",
    "contact_name": "Ada Meier",
    "contact_email": "ada@northwind.example"
  }'
```

Read and update:

```bash
curl -sS "https://jdcode.dev/api/crm/deals/$DEAL_ID" \
  -H "Authorization: Bearer $CRM_API_KEY"

curl -sS -X PATCH "https://jdcode.dev/api/crm/deals/$DEAL_ID" \
  -H "Authorization: Bearer $CRM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"next_step":"Book the audit call","next_step_date":"2026-10-30","value":990}'
```

Move stage. This appends a row to `deal_stage_history`. Moving to `won` or `lost` sets `won_at` or `lost_at`. Sending the stage the deal is already in does not add history. `PATCH` with `stage` does the same thing.

```bash
curl -sS -X POST "https://jdcode.dev/api/crm/deals/$DEAL_ID/stage" \
  -H "Authorization: Bearer $CRM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"stage":"audit_call_booked"}'
```

Add a note on a deal. `type` is `note` (default), `email`, `call`, or `meeting`. If `contact_id` is omitted, the deal’s contact is copied onto the activity so it shows on that person’s timeline.

```bash
curl -sS -X POST "https://jdcode.dev/api/crm/deals/$DEAL_ID/activities" \
  -H "Authorization: Bearer $CRM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type":"call","body":"Intro call. They want the 990 USD audit."}'
```

## Contacts

```bash
curl -sS "https://jdcode.dev/api/crm/contacts?q=ada" \
  -H "Authorization: Bearer $CRM_API_KEY"

curl -sS https://jdcode.dev/api/crm/contacts \
  -H "Authorization: Bearer $CRM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Ada Meier","email":"ada@northwind.example","role":"Founder","company_id":"'"$COMPANY_ID"'"}'

curl -sS -X PATCH "https://jdcode.dev/api/crm/contacts/$CONTACT_ID" \
  -H "Authorization: Bearer $CRM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"phone":"+1 202 555 0142"}'
```

`GET /api/crm/contacts/:id` includes the company, related deals, and activities.

## Companies

```bash
curl -sS https://jdcode.dev/api/crm/companies \
  -H "Authorization: Bearer $CRM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Northwind","website":"https://northwind.example"}'

curl -sS -X PATCH "https://jdcode.dev/api/crm/companies/$COMPANY_ID" \
  -H "Authorization: Bearer $CRM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"notes":"Recruiting agency. US and EU campaigns."}'
```

`GET /api/crm/companies/:id` includes people, deals, and notes recorded on those records.

## Activities

```bash
curl -sS "https://jdcode.dev/api/crm/activities?deal_id=$DEAL_ID" \
  -H "Authorization: Bearer $CRM_API_KEY"

curl -sS https://jdcode.dev/api/crm/activities \
  -H "Authorization: Bearer $CRM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"contact_id":"'"$CONTACT_ID"'","type":"email","body":"Sent the audit recap."}'
```

An activity needs a `deal_id` or a `contact_id`.

## Search and dashboard

```bash
curl -sS "https://jdcode.dev/api/crm/search?q=northwind" \
  -H "Authorization: Bearer $CRM_API_KEY"

curl -sS https://jdcode.dev/api/crm/dashboard \
  -H "Authorization: Bearer $CRM_API_KEY"
```

Search returns up to 20 deals, contacts, and companies. Dashboard JSON:

- `open_pipeline` and `open_pipeline_by_stage` — open stages only (`lead` through `retainer`), totals split by currency
- `followups_due_today` and `followups_overdue` — open deals with `next_step_date`
- `won_this_month` — deals currently in `won` whose `won_at` falls in the current month
- `timezone` and `today` — `CRM_TIMEZONE`, or `Europe/Berlin` when unset

Won and lost deals are not part of the open pipeline. Values in different currencies are not converted.

## Website inquiries

The public homepage does not post a contact form. It embeds a booking calendar. `POST /api/crm/inbound/contact` responds `404` until `CRM_CONTACT_TO_LEAD=true`.

When the flag is on, a JSON post with `name` or `email`, plus optional `phone`, `company`, and `message`, creates a lead at stage `lead` with source `website`. `company_url` is a honeypot: if it is filled, nothing is stored. The route is public, so leave the flag off until you want that. It does not accept the admin API key as a substitute for the flag.

```bash
curl -sS https://jdcode.dev/api/crm/inbound/contact \
  -H "Content-Type: application/json" \
  -d '{"name":"Sam","email":"sam@example.com","company":"Sam Co","message":"Need an audit"}'
```
