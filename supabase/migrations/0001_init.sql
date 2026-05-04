-- 0001_init.sql — base tables for Plan A (auth foundation + future-ready song/playlist tables added in Plan B/C).
-- Plan A only enables RLS on tables it actually uses, but tables get created together to keep migration count low.

create extension if not exists "citext";
create extension if not exists "pgcrypto";

-- Roles
create type user_role as enum ('admin', 'leader', 'musician');

-- profiles: 1:1 with auth.users
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role user_role not null default 'musician',
  created_at timestamptz not null default now()
);

-- invitations: admin-issued, single-use
create table invitations (
  id uuid primary key default gen_random_uuid(),
  email citext not null,
  role user_role not null,
  invited_by uuid not null references profiles(id),
  token_hash text not null,                  -- bcrypt hash; raw token only sent via email
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index invitations_email_pending_idx on invitations (email) where accepted_at is null;
create index invitations_token_hash_idx on invitations (token_hash);

-- audit log
create table audit_log (
  id bigserial primary key,
  actor_id uuid not null references profiles(id),
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_at_idx on audit_log (created_at desc);

-- auth attempts (rate-limit signin)
create table auth_attempts (
  id bigserial primary key,
  email citext,
  ip inet,
  succeeded boolean not null,
  created_at timestamptz not null default now()
);
create index auth_attempts_email_idx on auth_attempts (email, created_at desc);
create index auth_attempts_ip_idx on auth_attempts (ip, created_at desc);
