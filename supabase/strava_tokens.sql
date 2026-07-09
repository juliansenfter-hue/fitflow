-- FitFlow — Strava OAuth token store
-- Run this ONCE in the Supabase dashboard → SQL Editor.
--
-- Holds each user's Strava access/refresh tokens. These are SECRET and must
-- never reach the browser, so the table has RLS enabled with NO policies:
-- only the Edge Function (which uses the service-role key) can read or write it.
-- The client learns its connection status only through the Edge Function
-- (the /status and /sync routes return { connected, athlete, lastSync }).

create table if not exists public.strava_tokens (
  user_id       uuid primary key
                references auth.users (id) on delete cascade,
  athlete_id    bigint,
  athlete_name  text,
  access_token  text not null,
  refresh_token text not null,
  expires_at    bigint not null,        -- epoch seconds (Strava token expiry)
  scope         text,
  last_sync     bigint,                 -- epoch seconds of the last successful sync
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.strava_tokens enable row level security;

-- Intentionally NO policies and NO grants to `authenticated`/`anon`:
-- the browser must never be able to read these tokens. Only the Edge Function
-- (service role, which bypasses RLS) touches this table.
