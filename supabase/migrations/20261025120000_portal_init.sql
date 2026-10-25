-- Client portal for JDCODE delivery projects. Apply with `supabase db push` or the SQL editor.
-- Reuses private.is_crm_admin() from the CRM migration for Jan-only admin access.

create extension if not exists pgcrypto with schema extensions;

create type public.portal_package as enum ('audit', 'implementation', 'retainer');

create type public.portal_payment_status as enum ('pending', 'paid', 'waived');

create type public.portal_work_phase as enum (
  'onboarding',
  'in_progress',
  'delivered',
  'retainer_active'
);

create table public.portal_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portal_clients_name_len check (char_length(name) between 1 and 200)
);

create table public.portal_projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.portal_clients (id) on delete cascade,
  title text not null,
  package public.portal_package not null default 'audit',
  work_phase public.portal_work_phase not null default 'onboarding',
  agreement_markdown text not null default '',
  agreement_content_hash text not null default '',
  welcome_markdown text,
  payment_url text,
  payment_status public.portal_payment_status not null default 'pending',
  booking_url text,
  kickoff_at timestamptz,
  demo_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portal_projects_title_len check (char_length(title) between 1 and 200)
);

create table public.portal_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.portal_projects (id) on delete cascade,
  email text not null,
  user_id uuid references auth.users (id) on delete set null,
  invited_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint portal_members_email_lower check (email = lower(email)),
  constraint portal_members_email_len check (char_length(email) between 3 and 320),
  unique (project_id, email)
);

create table public.portal_agreement_acceptances (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.portal_projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  full_name text not null,
  company_name text not null,
  job_title text not null,
  agreement_content_hash text not null,
  accepted_at timestamptz not null default now(),
  ip_address inet,
  user_agent text,
  constraint portal_accept_name_len check (char_length(full_name) between 1 and 200),
  constraint portal_accept_company_len check (char_length(company_name) between 1 and 200),
  constraint portal_accept_title_len check (char_length(job_title) between 1 and 200),
  unique (project_id, user_id)
);

create table public.portal_checklist_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.portal_projects (id) on delete cascade,
  slug text not null,
  title text not null,
  instructions_markdown text not null default '',
  sort_order int not null default 0,
  completed_at timestamptz,
  completed_by_user_id uuid references auth.users (id) on delete set null,
  client_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portal_checklist_slug_len check (char_length(slug) between 1 and 80),
  constraint portal_checklist_title_len check (char_length(title) between 1 and 200),
  unique (project_id, slug)
);

create table public.portal_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.portal_projects (id) on delete cascade,
  title text not null,
  description text,
  url text,
  storage_path text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint portal_documents_title_len check (char_length(title) between 1 and 200),
  constraint portal_documents_has_location check (url is not null or storage_path is not null)
);

create table public.portal_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.portal_projects (id) on delete cascade,
  title text not null,
  body_markdown text not null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint portal_updates_title_len check (char_length(title) between 1 and 200),
  constraint portal_updates_body_len check (char_length(body_markdown) between 1 and 50000)
);

create index portal_projects_client_id_idx on public.portal_projects (client_id);
create index portal_projects_updated_at_idx on public.portal_projects (updated_at desc);
create index portal_members_project_id_idx on public.portal_members (project_id);
create index portal_members_email_idx on public.portal_members (email);
create index portal_members_user_id_idx on public.portal_members (user_id);
create index portal_checklist_project_sort_idx on public.portal_checklist_items (project_id, sort_order);
create index portal_documents_project_sort_idx on public.portal_documents (project_id, sort_order);
create index portal_updates_project_published_idx on public.portal_updates (project_id, published_at desc);

create or replace function private.portal_user_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(coalesce((select auth.jwt() ->> 'email'), ''));
$$;

create or replace function private.portal_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid());
$$;

create or replace function private.portal_is_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.portal_members m
    where m.project_id = p_project_id
      and (
        m.user_id = (select auth.uid())
        or m.email = (select private.portal_user_email())
      )
  );
$$;

create or replace function private.portal_can_read_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_crm_admin()) or (select private.portal_is_member(p_project_id));
$$;

create or replace function private.portal_can_write_client_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.portal_is_member(p_project_id));
$$;

revoke all on function private.portal_user_email() from public, anon;
revoke all on function private.portal_user_id() from public, anon;
revoke all on function private.portal_is_member(uuid) from public, anon;
revoke all on function private.portal_can_read_project(uuid) from public, anon;
revoke all on function private.portal_can_write_client_project(uuid) from public, anon;

grant execute on function private.portal_user_email() to authenticated;
grant execute on function private.portal_user_id() to authenticated;
grant execute on function private.portal_is_member(uuid) to authenticated;
grant execute on function private.portal_can_read_project(uuid) to authenticated;
grant execute on function private.portal_can_write_client_project(uuid) to authenticated;

create or replace function private.portal_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.portal_touch_updated_at() from public, anon;
grant execute on function private.portal_touch_updated_at() to authenticated, service_role;

create trigger portal_clients_set_updated_at
  before update on public.portal_clients
  for each row execute function private.portal_touch_updated_at();

create trigger portal_projects_set_updated_at
  before update on public.portal_projects
  for each row execute function private.portal_touch_updated_at();

create trigger portal_checklist_set_updated_at
  before update on public.portal_checklist_items
  for each row execute function private.portal_touch_updated_at();

-- Link portal_members.user_id when a member signs in (email match).
create or replace function private.portal_link_member_on_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.portal_members
  set user_id = new.id
  where user_id is null
    and email = lower(new.email);
  return new;
end;
$$;

-- Optional: run from API instead of trigger on auth.users (trigger may need superuser).
-- Members are linked from the portal API on session.

alter table public.portal_clients enable row level security;
alter table public.portal_projects enable row level security;
alter table public.portal_members enable row level security;
alter table public.portal_agreement_acceptances enable row level security;
alter table public.portal_checklist_items enable row level security;
alter table public.portal_documents enable row level security;
alter table public.portal_updates enable row level security;

alter table public.portal_clients force row level security;
alter table public.portal_projects force row level security;
alter table public.portal_members force row level security;
alter table public.portal_agreement_acceptances force row level security;
alter table public.portal_checklist_items force row level security;
alter table public.portal_documents force row level security;
alter table public.portal_updates force row level security;

-- Admin: full access
create policy portal_clients_admin on public.portal_clients
  for all to authenticated
  using ((select private.is_crm_admin()))
  with check ((select private.is_crm_admin()));

create policy portal_projects_admin on public.portal_projects
  for all to authenticated
  using ((select private.is_crm_admin()))
  with check ((select private.is_crm_admin()));

create policy portal_members_admin on public.portal_members
  for all to authenticated
  using ((select private.is_crm_admin()))
  with check ((select private.is_crm_admin()));

create policy portal_accept_admin on public.portal_agreement_acceptances
  for all to authenticated
  using ((select private.is_crm_admin()))
  with check ((select private.is_crm_admin()));

create policy portal_checklist_admin on public.portal_checklist_items
  for all to authenticated
  using ((select private.is_crm_admin()))
  with check ((select private.is_crm_admin()));

create policy portal_documents_admin on public.portal_documents
  for all to authenticated
  using ((select private.is_crm_admin()))
  with check ((select private.is_crm_admin()));

create policy portal_updates_admin on public.portal_updates
  for all to authenticated
  using ((select private.is_crm_admin()))
  with check ((select private.is_crm_admin()));

-- Clients: read own client row via project membership
create policy portal_clients_member_select on public.portal_clients
  for select to authenticated
  using (
    exists (
      select 1
      from public.portal_projects p
      join public.portal_members m on m.project_id = p.id
      where p.client_id = portal_clients.id
        and (
          m.user_id = (select auth.uid())
          or m.email = (select private.portal_user_email())
        )
    )
  );

create policy portal_projects_member_select on public.portal_projects
  for select to authenticated
  using ((select private.portal_can_read_project(id)));

create policy portal_members_self_select on public.portal_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or email = (select private.portal_user_email())
  );

create policy portal_accept_member_select on public.portal_agreement_acceptances
  for select to authenticated
  using ((select private.portal_can_read_project(project_id)));

create policy portal_accept_member_insert on public.portal_agreement_acceptances
  for insert to authenticated
  with check (
    (select private.portal_can_write_client_project(project_id))
    and user_id = (select auth.uid())
  );

create policy portal_checklist_member_select on public.portal_checklist_items
  for select to authenticated
  using ((select private.portal_can_read_project(project_id)));

create policy portal_checklist_member_update on public.portal_checklist_items
  for update to authenticated
  using ((select private.portal_can_write_client_project(project_id)))
  with check ((select private.portal_can_write_client_project(project_id)));

create policy portal_documents_member_select on public.portal_documents
  for select to authenticated
  using ((select private.portal_can_read_project(project_id)));

create policy portal_updates_member_select on public.portal_updates
  for select to authenticated
  using ((select private.portal_can_read_project(project_id)));

revoke all on table public.portal_clients from anon, public;
revoke all on table public.portal_projects from anon, public;
revoke all on table public.portal_members from anon, public;
revoke all on table public.portal_agreement_acceptances from anon, public;
revoke all on table public.portal_checklist_items from anon, public;
revoke all on table public.portal_documents from anon, public;
revoke all on table public.portal_updates from anon, public;

grant select, insert, update, delete on table public.portal_clients to authenticated, service_role;
grant select, insert, update, delete on table public.portal_projects to authenticated, service_role;
grant select, insert, update, delete on table public.portal_members to authenticated, service_role;
grant select, insert, update, delete on table public.portal_agreement_acceptances to authenticated, service_role;
grant select, insert, update, delete on table public.portal_checklist_items to authenticated, service_role;
grant select, insert, update, delete on table public.portal_documents to authenticated, service_role;
grant select, insert, update, delete on table public.portal_updates to authenticated, service_role;

-- Storage bucket for project documents (private; signed URLs via service role or future policy).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'portal-documents',
  'portal-documents',
  false,
  52428800,
  array['application/pdf', 'text/plain', 'text/markdown', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do nothing;

comment on table public.portal_clients is 'Client company with one or more delivery projects.';
comment on table public.portal_projects is 'Audit, implementation, or retainer engagement visible in the client portal.';
comment on table public.portal_members is 'Invited client users (magic-link auth) with access to a project.';
comment on table public.portal_agreement_acceptances is 'Clickwrap acceptance record with content hash.';
comment on table public.portal_checklist_items is 'Access checklist with per-item instructions.';
comment on table public.portal_documents is 'Deliverables and links for the client.';
comment on table public.portal_updates is 'Milestone/status feed posts from Jan.';
