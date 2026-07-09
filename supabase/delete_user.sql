-- FitFlow — self-service account deletion
-- Run this ONCE in the Supabase dashboard → SQL Editor.
--
-- Why a function: deleting a row from auth.users needs elevated privileges
-- that must never live in client code. This SECURITY DEFINER function runs
-- as its owner (postgres) but only ever deletes the *calling* user
-- (auth.uid()), so an authenticated user can delete their own account and
-- nobody else's. The client calls it via supabase.rpc('delete_user').

create or replace function public.delete_user()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  -- add deletes for any own-data tables here first, e.g.:
  --   delete from public.activities where user_id = auth.uid();
  delete from auth.users where id = auth.uid();
end;
$$;

-- Only logged-in users may call it (never anon / public).
revoke all on function public.delete_user() from public, anon;
grant execute on function public.delete_user() to authenticated;
