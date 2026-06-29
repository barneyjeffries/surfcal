-- 0006: admin-only spot management.
--
-- Adding and editing shared spots becomes an admin privilege. Everyone else can
-- still read the catalogue, follow existing spots, and set their own per-spot
-- preferences (user_spots is unchanged). This replaces the open insert/update
-- policies on `spots` introduced in earlier migrations.

alter table public.profiles
  add column is_admin boolean not null default false;

-- Role check as a SECURITY DEFINER function: it reads profiles regardless of the
-- caller's own RLS, and keeps policies from depending on profiles' policies (no
-- recursion). STABLE — constant within a statement.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

-- Swap the "any authenticated user" write policies for admin-gated ones.
-- IF EXISTS so this applies cleanly regardless of which prior migrations ran.
drop policy if exists "spots_insert_authenticated" on public.spots;
drop policy if exists "spots_update_authenticated" on public.spots;

create policy "spots_insert_admin" on public.spots
  for insert with check (public.is_admin());
create policy "spots_update_admin" on public.spots
  for update using (public.is_admin()) with check (public.is_admin());

-- spots_select_authenticated is left in place: everyone reads the catalogue.

-- ---------------------------------------------------------------------------
-- Make the existing account the admin. If this id is wrong (or for any future
-- admin), set it by hand:
--   update public.profiles set is_admin = true where id = '<user-uuid>';
-- ---------------------------------------------------------------------------
update public.profiles set is_admin = true
 where id = '0fe11325-3097-4a73-9e4f-f42faa3fcdbe';
