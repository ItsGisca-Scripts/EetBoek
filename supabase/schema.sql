create table if not exists public.diary_users (
    id uuid primary key default gen_random_uuid(),
    name text not null check (char_length(name) between 1 and 80),
    code_hash text not null unique,
    active boolean not null default true,
    token_version integer not null default 1,
    created_at timestamptz not null default now()
);

create table if not exists public.diary_entries (
    user_id uuid not null references public.diary_users(id) on delete cascade,
    entry_date date not null,
    data jsonb not null,
    primary key (user_id, entry_date)
);

create table if not exists public.app_changes (
    id uuid primary key default gen_random_uuid(),
    title text not null check (char_length(title) between 1 and 120),
    message text not null check (char_length(message) between 1 and 4000),
    created_at timestamptz not null default now(),
    revision integer not null default 1 check (revision > 0)
);

create table if not exists public.diary_change_reads (
    user_id uuid not null references public.diary_users(id) on delete cascade,
    change_id uuid not null references public.app_changes(id) on delete cascade,
    read_at timestamptz not null default now(),
    seen_revision integer not null default 0,
    primary key (user_id, change_id)
);

alter table public.app_changes
    add column if not exists revision integer not null default 1;
alter table public.diary_change_reads
    add column if not exists seen_revision integer not null default 0;
update public.diary_change_reads as reads
set seen_revision = changes.revision
from public.app_changes as changes
where reads.change_id = changes.id
  and reads.seen_revision = 0;

alter table public.diary_users enable row level security;
alter table public.diary_entries enable row level security;
alter table public.app_changes enable row level security;
alter table public.diary_change_reads enable row level security;

revoke all on public.diary_users from anon, authenticated;
revoke all on public.diary_entries from anon, authenticated;
revoke all on public.app_changes from anon, authenticated;
revoke all on public.diary_change_reads from anon, authenticated;
grant all on public.diary_users to service_role;
grant all on public.diary_entries to service_role;
grant all on public.app_changes to service_role;
grant all on public.diary_change_reads to service_role;
