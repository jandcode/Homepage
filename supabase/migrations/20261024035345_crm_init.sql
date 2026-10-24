-- Private CRM for JDCODE. Apply with `supabase db push` or the Supabase SQL editor.
-- Do not add the `private` schema to the Data API exposed schemas.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create type public.deal_stage as enum (
  'lead',
  'contacted',
  'audit_call_booked',
  'audit_paid',
  'fix_project',
  'retainer',
  'won',
  'lost'
);

create type public.activity_type as enum ('note', 'email', 'call', 'meeting');

-- Mirror of the CRM_ADMIN_EMAILS env allowlist. The API syncs this on login.
-- No policies: anon and authenticated cannot read it. service_role bypasses RLS.
create table public.crm_admin_emails (
  email text primary key,
  created_at timestamptz not null default now(),
  constraint crm_admin_emails_lowercase check (email = lower(email))
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_name_len check (char_length(name) between 1 and 200)
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete set null,
  name text not null,
  email text,
  phone text,
  role text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_name_len check (char_length(name) between 1 and 200)
);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  company_id uuid references public.companies (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete set null,
  stage public.deal_stage not null default 'lead',
  value numeric(12, 2) not null default 0,
  currency text not null default 'USD',
  source text,
  next_step text,
  next_step_date date,
  won_at timestamptz,
  lost_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deals_title_len check (char_length(title) between 1 and 200),
  constraint deals_value_nonnegative check (value >= 0),
  constraint deals_currency_code check (currency ~ '^[A-Z]{3}$')
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references public.deals (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete cascade,
  type public.activity_type not null default 'note',
  body text not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activities_has_parent check (deal_id is not null or contact_id is not null),
  constraint activities_body_len check (char_length(body) between 1 and 20000)
);

create table public.deal_stage_history (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  from_stage public.deal_stage,
  to_stage public.deal_stage not null,
  changed_at timestamptz not null default now()
);

create index companies_name_idx on public.companies (name);
create index contacts_company_id_idx on public.contacts (company_id);
create index contacts_name_idx on public.contacts (name);
create index contacts_email_idx on public.contacts (email);
create index deals_company_id_idx on public.deals (company_id);
create index deals_contact_id_idx on public.deals (contact_id);
create index deals_stage_idx on public.deals (stage);
create index deals_updated_at_idx on public.deals (updated_at desc);
create index deals_open_followup_idx on public.deals (next_step_date)
  where next_step_date is not null and stage not in ('won', 'lost');
create index deals_won_at_idx on public.deals (won_at) where stage = 'won';
create index activities_deal_id_idx on public.activities (deal_id, occurred_at desc);
create index activities_contact_id_idx on public.activities (contact_id, occurred_at desc);
create index deal_stage_history_deal_idx on public.deal_stage_history (deal_id, changed_at);

create or replace function private.is_crm_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.crm_admin_emails as allowlist
    where allowlist.email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  );
$$;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- won_at / lost_at are derived from stage changes. History is written after the row exists
-- so the foreign key is valid.
create or replace function private.prepare_deal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  if tg_op = 'INSERT' then
    if new.stage = 'won' then
      new.won_at = coalesce(new.won_at, now());
    elsif new.stage = 'lost' then
      new.lost_at = coalesce(new.lost_at, now());
    end if;
  elsif new.stage is distinct from old.stage then
    if new.stage = 'won' then
      new.won_at = now();
      new.lost_at = null;
    elsif new.stage = 'lost' then
      new.lost_at = now();
      new.won_at = null;
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.log_deal_stage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.deal_stage_history (deal_id, from_stage, to_stage)
    values (new.id, null, new.stage);
  elsif new.stage is distinct from old.stage then
    insert into public.deal_stage_history (deal_id, from_stage, to_stage)
    values (new.id, old.stage, new.stage);
  end if;
  return null;
end;
$$;

revoke all on function private.is_crm_admin() from public, anon;
revoke all on function private.touch_updated_at() from public, anon;
revoke all on function private.prepare_deal() from public, anon;
revoke all on function private.log_deal_stage() from public, anon;
grant execute on function private.is_crm_admin() to authenticated;
grant execute on function private.touch_updated_at() to authenticated, service_role;
grant execute on function private.prepare_deal() to authenticated, service_role;
grant execute on function private.log_deal_stage() to authenticated, service_role;

create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function private.touch_updated_at();

create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function private.touch_updated_at();

create trigger activities_set_updated_at
  before update on public.activities
  for each row execute function private.touch_updated_at();

create trigger deals_prepare
  before insert or update on public.deals
  for each row execute function private.prepare_deal();

create trigger deals_log_stage
  after insert or update on public.deals
  for each row execute function private.log_deal_stage();

alter table public.crm_admin_emails enable row level security;
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.deals enable row level security;
alter table public.activities enable row level security;
alter table public.deal_stage_history enable row level security;

alter table public.companies force row level security;
alter table public.contacts force row level security;
alter table public.deals force row level security;
alter table public.activities force row level security;
alter table public.deal_stage_history force row level security;

-- Email claim comes from auth.users. Do not authorize from editable profile claims.
create policy companies_admin_all on public.companies
  for all to authenticated
  using ((select private.is_crm_admin()))
  with check ((select private.is_crm_admin()));

create policy contacts_admin_all on public.contacts
  for all to authenticated
  using ((select private.is_crm_admin()))
  with check ((select private.is_crm_admin()));

create policy deals_admin_all on public.deals
  for all to authenticated
  using ((select private.is_crm_admin()))
  with check ((select private.is_crm_admin()));

create policy activities_admin_all on public.activities
  for all to authenticated
  using ((select private.is_crm_admin()))
  with check ((select private.is_crm_admin()));

create policy deal_stage_history_admin_select on public.deal_stage_history
  for select to authenticated
  using ((select private.is_crm_admin()));

create policy deal_stage_history_admin_insert on public.deal_stage_history
  for insert to authenticated
  with check ((select private.is_crm_admin()));

revoke all on table public.crm_admin_emails from anon, authenticated, public;
grant select, insert, update, delete on table public.crm_admin_emails to service_role;

revoke all on table public.companies from anon, public;
revoke all on table public.contacts from anon, public;
revoke all on table public.deals from anon, public;
revoke all on table public.activities from anon, public;
revoke all on table public.deal_stage_history from anon, public;

grant select, insert, update, delete on table public.companies to authenticated, service_role;
grant select, insert, update, delete on table public.contacts to authenticated, service_role;
grant select, insert, update, delete on table public.deals to authenticated, service_role;
grant select, insert, update, delete on table public.activities to authenticated, service_role;
grant select, insert on table public.deal_stage_history to authenticated;
grant select, insert, update, delete on table public.deal_stage_history to service_role;

comment on table public.companies is 'CRM account a deal is with.';
comment on table public.contacts is 'Person at a company.';
comment on table public.deals is 'Sales conversation from lead through retainer.';
comment on table public.activities is 'Note, email, call, or meeting linked to a deal and/or contact.';
comment on table public.deal_stage_history is 'Append-only stage changes for lifecycle reporting.';
comment on table public.crm_admin_emails is 'Server-synced copy of CRM_ADMIN_EMAILS. Not readable by the Data API anon/authenticated roles.';
