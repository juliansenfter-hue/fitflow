-- FitFlow — cross-device storage for imported activities
-- Run this ONCE in the Supabase dashboard → SQL Editor.
--
-- Each imported FIT/CSV activity becomes one row, owned by the importing user.
-- Row-Level-Security guarantees a user can only ever read/write their own rows,
-- so the anon public key in the client is safe. The FK cascade means deleting
-- the account (delete_user RPC) also removes the person's activities.

create table if not exists public.activities (
  id         text primary key,                    -- client-generated (imp-...)
  user_id    uuid not null default auth.uid()
             references auth.users (id) on delete cascade,
  data       jsonb not null,                       -- { activity, meta }
  created_at timestamptz not null default now()
);

create index if not exists activities_user_created_idx
  on public.activities (user_id, created_at desc);

alter table public.activities enable row level security;

-- one policy per verb, all scoped to the calling user
drop policy if exists "activities own select" on public.activities;
drop policy if exists "activities own insert" on public.activities;
drop policy if exists "activities own update" on public.activities;
drop policy if exists "activities own delete" on public.activities;

create policy "activities own select" on public.activities
  for select using (auth.uid() = user_id);
create policy "activities own insert" on public.activities
  for insert with check (auth.uid() = user_id);
create policy "activities own update" on public.activities
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "activities own delete" on public.activities
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.activities to authenticated;
