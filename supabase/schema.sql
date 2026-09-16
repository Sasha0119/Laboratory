-- =============================================================================
--  Laboratory — database schema
-- =============================================================================
--
--  Run this once against a new Supabase project:
--    Dashboard → SQL Editor → New query → paste → Run
--
--  It is written to be safe to re-run: everything is IF NOT EXISTS or
--  CREATE OR REPLACE.
--
--  What it sets up:
--    * a `profiles` row for every auth user, holding the display name and the
--      subscription status
--    * Row Level Security so a user can only ever read and write their own row
--    * a trigger that creates the profile automatically on sign-up, so the app
--      never has to insert one (and never has to be trusted to)
--
-- =============================================================================


-- ---------------------------------------------------------------- enum ------
-- Kept as an enum rather than free text so a typo can never silently grant or
-- revoke access.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'subscription_status') then
    create type public.subscription_status as enum ('free', 'pro');
  end if;
end
$$;


-- -------------------------------------------------------------- table -------

create table if not exists public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  display_name        text not null default '',
  -- Every account starts free. Upgrading is a manual edit in the table editor
  -- for now; a payment webhook will write this same column later.
  subscription_status public.subscription_status not null default 'free',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.profiles is
  'One row per auth user. Holds the display name and what content they may open.';
comment on column public.profiles.subscription_status is
  'free = Beginner content only. pro = everything. Set by hand until payments ship.';


-- ---------------------------------------------------------------- RLS -------
-- Without this, the anon key would let anyone read every profile. With it, the
-- only rows a request can touch are the ones belonging to its own JWT.

alter table public.profiles enable row level security;

drop policy if exists "Profiles are readable by their owner" on public.profiles;
create policy "Profiles are readable by their owner"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Profiles are updatable by their owner" on public.profiles;
create policy "Profiles are updatable by their owner"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Deliberately NO insert policy and NO update policy on subscription_status
-- beyond the column grant below: profiles are created by the trigger, and the
-- client must never be able to promote itself to `pro`.

revoke update on public.profiles from anon, authenticated;
grant  update (display_name, updated_at) on public.profiles to authenticated;


-- ------------------------------------------------------------- trigger ------
-- Creates the profile as the sign-up completes. `display_name` is read from
-- the metadata the app passes to signUp(); it falls back to the part of the
-- email before the @ so a row always has something readable in it.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ------------------------------------------------------- updated_at ---------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();


-- ---------------------------------------------------- backfill --------------
-- Only matters if you already had users before running this file.

insert into public.profiles (id, display_name)
select u.id,
       coalesce(
         nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''),
         split_part(u.email, '@', 1)
       )
from auth.users u
on conflict (id) do nothing;


-- =============================================================================
--  Granting Pro to a user (manual, until payments ship)
-- =============================================================================
--
--    update public.profiles
--       set subscription_status = 'pro'
--     where id = (select id from auth.users where email = 'someone@example.com');
--
--  The app picks the change up the next time that user opens it, or straight
--  away if they pull down on the Settings screen.
-- =============================================================================
