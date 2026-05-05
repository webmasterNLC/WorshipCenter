-- 0010_profile_capabilities.sql — which rota roles each member can fill.
-- Used by the service-rota picker (Phase 4) to filter candidates per slot.
-- Admin-managed only; band members read for their own UI.

create table profile_capabilities (
  profile_id uuid not null references profiles(id) on delete cascade,
  capability text not null check (capability in (
    'worship_lead','vocal','drums','bass','guitar','keys',
    'sound','camera','projector'
  )),
  granted_at timestamptz not null default now(),
  primary key (profile_id, capability)
);

create index profile_capabilities_capability_idx
  on profile_capabilities (capability);

alter table profile_capabilities enable row level security;

-- Any band member may read capabilities so the rota picker can filter
-- candidates and "you're on duty"-style cards work.
create policy "profile_capabilities: any band member reads"
  on profile_capabilities for select
  using (public.role_of(auth.uid()) in ('admin','leader','musician'));

-- Only admins write. Self-declaration was explicitly rejected.
create policy "profile_capabilities: admin writes"
  on profile_capabilities for all
  using (public.role_of(auth.uid()) = 'admin')
  with check (public.role_of(auth.uid()) = 'admin');
