-- =============================================================================
-- BeanTrust · Migración 014 · Registro público y alta inicial de finca
--
-- Dos endurecimientos para abrir el alta pública de productores:
--
-- 1. El trigger `bean_sync_usuario_auth` (005) honraba el rol de
--    `raw_user_meta_data`, así que un `sign_up` directo contra Supabase con
--    `{"rol":"cooperativa"}` escalaba privilegios. Ahora **toda** alta en
--    `auth.users` crea un `productor`: el rol privilegiado se asigna por
--    procedimiento administrativo, nunca desde metadata del cliente
--    (defensa en profundidad; el backend también fuerza `productor`).
--
-- 2. La política `finca_insert` (006) permitía a un productor asociar su finca
--    a **cualquier** cooperativa existente (`cooperativa_id = auth.uid()` era
--    suficiente). El onboarding asigna la cooperativa del piloto en el
--    servidor, así que la política exige ahora el productor autenticado y la
--    cooperativa permitida. Un trigger `before update` impide que un cliente
--    directo cambie `productor_id`/`cooperativa_id` de una finca existente.
--
-- La cooperativa permitida se resuelve por su email estable
-- (`cooperativa@beantrust.dev`), que en el piloto reusa el mismo UUID para el
-- usuario operativo y para la fila de `cooperativa`. El backend mantiene el
-- mismo valor en `BEAN_PILOT_COOPERATIVA_ID` (9d652468-418b-443c-b4be-a652124927c2).
--
-- No se reescriben migraciones previas.
-- =============================================================================

begin;

-- ---------------------------------------------------------------- 1. auth
create or replace function public.bean_sync_usuario_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Alta pública => siempre productor (nunca un rol privilegiado desde metadata).
  insert into public.usuarios (id, email, rol, nombre)
  values (
    new.id,
    new.email,
    'productor',
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.bean_sync_usuario_auth() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.bean_sync_usuario_auth();

-- --------------------------------------------- 2. cooperativa permitida
create or replace function app_private.bean_cooperativa_piloto()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select u.id
  from public.usuarios u
  where u.rol = 'cooperativa'
    and u.email = 'cooperativa@beantrust.dev'
  order by u.created_at, u.id
  limit 1;
$$;

revoke all on function app_private.bean_cooperativa_piloto() from public, anon;
grant execute on function app_private.bean_cooperativa_piloto() to authenticated;

-- --------------------------------------------- 3. política de alta de finca
drop policy if exists finca_insert on public.finca;
create policy finca_insert on public.finca
  for insert to authenticated
  with check (
    app_private.bean_rol() = 'admin'
    or (
      app_private.bean_rol() = 'productor'
      and productor_id = (select auth.uid())
      and cooperativa_id = app_private.bean_cooperativa_piloto()
    )
  );

-- --------------------------------------------- 4. tenencia inmutable
create or replace function app_private.bean_finca_proteger_tenencia()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.productor_id is distinct from old.productor_id
     or new.cooperativa_id is distinct from old.cooperativa_id then
    if app_private.bean_rol() is distinct from 'admin' then
      raise exception 'No se puede cambiar el propietario ni la cooperativa de una finca'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function app_private.bean_finca_proteger_tenencia() from public, anon, authenticated;

drop trigger if exists bean_finca_proteger_tenencia on public.finca;
create trigger bean_finca_proteger_tenencia
  before update on public.finca
  for each row execute function app_private.bean_finca_proteger_tenencia();

commit;
