-- =============================================================================
-- BeanTrust · Migración 006 · Hardening: RLS efectivo, evidencias privadas y
-- rate limit compartido (B11 / B7)
--
-- Cierra tres huecos de la fase MVP:
--
--   1. RLS real por usuario. La migración 002 dejó las políticas apoyadas en
--      `public.bean_rol()`, un helper expuesto en `public`. Aquí se recrean
--      todas las políticas sobre `app_private.bean_rol()` (security definer,
--      search_path cerrado) y se revoca todo privilegio directo de `anon` y
--      `authenticated` sobre las tablas, concediendo solo lo necesario.
--   2. Evidencias fotográficas. Se crea `public.evidencias`, tabla que solo
--      administra FastAPI con `service_role`; el móvil nunca toca Postgres ni
--      Storage directamente. Los objetos viven en un bucket privado y su
--      metadata (ruta, hash, tamaño) queda auditada aquí.
--   3. Rate limit compartido. Se crea `app_private.rate_limit_bucket` y la
--      función `public.bean_consume_rate_limit(...)` para que el límite de
--      login/registro/refresh sea consistente entre instancias del backend
--      (en memoria no sobrevive a un restart ni a varias réplicas).
--
-- No se modifica ningún archivo histórico (001-005): todo cambio de políticas
-- vive aquí y se apoya en `drop policy if exists`.
-- =============================================================================

begin;

-- ------------------------------------------------------------------ app_private
-- Esquema de utilidades internas: fuera del alcance de PostgREST.

create schema if not exists app_private;
revoke all on schema app_private from public;

-- ------------------------------------------------------------------ evidencias
-- El `id` es el Idempotency-Key de la subida (lo genera el móvil), por lo que
-- reintentar la misma subida no duplica filas ni objetos.
-- `lote_id` no es FK a propósito: la evidencia se sube antes de crear el lote.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'estado_evidencia') then
    create type public.estado_evidencia as enum ('PENDIENTE', 'ADJUNTA', 'ELIMINADA');
  end if;
end
$$;

create table if not exists public.evidencias (
  id             uuid primary key,
  lote_id        uuid not null,
  finca_id       uuid not null references public.finca (id) on delete restrict,
  uploader_id    uuid not null references public.usuarios (id) on delete restrict,
  storage_key    text not null unique,
  sha256         char(64) not null,
  content_type   text not null check (
    content_type in ('image/jpeg', 'image/png', 'image/webp')
  ),
  size_bytes     integer not null check (
    size_bytes > 0 and size_bytes <= 5242880
  ),
  estado         public.estado_evidencia not null default 'PENDIENTE',
  creado_en      timestamptz not null default now(),
  adjuntada_en   timestamptz
);

create index if not exists evidencias_uploader_estado_idx
  on public.evidencias (uploader_id, estado, creado_en);

create index if not exists evidencias_lote_idx
  on public.evidencias (lote_id);

create index if not exists evidencias_pendientes_expiracion_idx
  on public.evidencias (creado_en)
  where estado = 'PENDIENTE';

alter table public.evidencias enable row level security;

-- Sin políticas y sin grants: solo `service_role` (FastAPI) administra la tabla.

-- ------------------------------------------------------------------ rate limit
-- Bucket por clave (hash HMAC de ip|endpoint), con ventana fija.

create table if not exists app_private.rate_limit_bucket (
  key_hash          text primary key,
  window_started_at timestamptz not null,
  request_count     integer not null default 0,
  updated_at        timestamptz not null default now()
);

revoke all on all tables in schema app_private from public, anon, authenticated;

-- Consumo atómico: bloquea la fila del bucket, reinicia la ventana si expiró y
-- solo incrementa si no se superó el límite. Devuelve true si permite.
create or replace function public.bean_consume_rate_limit(
  p_key_hash       text,
  p_limit          integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = app_private, pg_catalog
as $$
declare
  v_now             timestamptz := now();
  v_window_started  timestamptz;
  v_request_count   integer;
begin
  insert into rate_limit_bucket (key_hash, window_started_at, request_count, updated_at)
  values (p_key_hash, v_now, 0, v_now)
  on conflict (key_hash) do nothing;

  select window_started_at, request_count
    into v_window_started, v_request_count
    from rate_limit_bucket
   where key_hash = p_key_hash
     for update;

  if v_now >= v_window_started + make_interval(secs => p_window_seconds) then
    v_window_started := v_now;
    v_request_count := 0;
  end if;

  if v_request_count >= p_limit then
    update rate_limit_bucket
       set window_started_at = v_window_started,
           request_count = v_request_count,
           updated_at = v_now
     where key_hash = p_key_hash;
    return false;
  end if;

  update rate_limit_bucket
     set window_started_at = v_window_started,
         request_count = v_request_count + 1,
         updated_at = v_now
   where key_hash = p_key_hash;

  return true;
end;
$$;

revoke all on function public.bean_consume_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.bean_consume_rate_limit(text, integer, integer)
  to service_role;

-- ------------------------------------------------------------------ helper de rol
-- Único lugar donde se resuelve el rol de negocio. `security definer` para poder
-- leer `usuarios` aunque el llamante no tenga privilegio, con search_path fijo
-- para evitar secuestro de esquema. No usa metadata del JWT: solo `auth.uid()`.

create or replace function app_private.bean_rol()
returns public.rol_usuario
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select rol from public.usuarios where id = (select auth.uid());
$$;

revoke all on function app_private.bean_rol() from public, anon;
grant usage on schema app_private to authenticated;
grant execute on function app_private.bean_rol() to authenticated;

-- ------------------------------------------------------------------ drop políticas antiguas

-- 002_rls.sql
drop policy if exists usuarios_own_read on public.usuarios;
drop policy if exists cooperativa_admin_read on public.cooperativa;
drop policy if exists finca_select on public.finca;
drop policy if exists finca_insert on public.finca;
drop policy if exists finca_update on public.finca;
drop policy if exists lotes_select on public.lotes;
drop policy if exists lotes_insert on public.lotes;
drop policy if exists lotes_update on public.lotes;
drop policy if exists lote_eventos_select on public.lote_eventos;
drop policy if exists lote_eventos_insert on public.lote_eventos;
drop policy if exists qr_select on public.qr_certificado;
drop policy if exists qr_insert on public.qr_certificado;
drop policy if exists pago_select on public.pago;
drop policy if exists pago_insert on public.pago;
drop policy if exists verificacion_select on public.verificacion;
drop policy if exists verificacion_insert on public.verificacion;

-- 004_cadena_completa_propina.sql
drop policy if exists propina_select_productor on public.propina;
drop policy if exists propina_select_comprador on public.propina;
drop policy if exists propina_select_admin on public.propina;
drop policy if exists propina_insert_comprador on public.propina;
drop policy if exists propina_update_service on public.propina;

-- El helper antiguo vivía en `public` (expuesto a PostgREST). Ya no lo usa
-- ninguna política; se elimina para no dejar una puerta de lectura de roles.
drop function if exists public.bean_rol();

-- ------------------------------------------------------------------ nuevas políticas

-- usuarios: cada quien ve su fila; admin ve todas; cooperativa ve el
-- directorio de compradores (lo consume GET /v1/compradores).
create policy usuarios_select on public.usuarios
  for select to authenticated
  using (
    id = (select auth.uid())
    or app_private.bean_rol() = 'admin'
    or (app_private.bean_rol() = 'cooperativa' and rol = 'comprador')
  );

-- cooperativa: admin todas; la cooperativa su fila; el productor la suya.
create policy cooperativa_select on public.cooperativa
  for select to authenticated
  using (
    app_private.bean_rol() = 'admin'
    or id = (select auth.uid())
    or exists (
      select 1 from public.finca f
      where f.cooperativa_id = public.cooperativa.id
        and f.productor_id = (select auth.uid())
    )
  );

-- finca
create policy finca_select on public.finca
  for select to authenticated
  using (
    app_private.bean_rol() = 'admin'
    or productor_id = (select auth.uid())
    or cooperativa_id = (select auth.uid())
  );

create policy finca_insert on public.finca
  for insert to authenticated
  with check (
    app_private.bean_rol() = 'admin'
    or productor_id = (select auth.uid())
    or cooperativa_id = (select auth.uid())
  );

create policy finca_update on public.finca
  for update to authenticated
  using (
    app_private.bean_rol() = 'admin'
    or productor_id = (select auth.uid())
    or cooperativa_id = (select auth.uid())
  )
  with check (
    app_private.bean_rol() = 'admin'
    or productor_id = (select auth.uid())
    or cooperativa_id = (select auth.uid())
  );

-- lotes: acceso anclado a la finca del lote.
create policy lotes_select on public.lotes
  for select to authenticated
  using (
    app_private.bean_rol() = 'admin'
    or exists (
      select 1 from public.finca f
      where f.id = public.lotes.finca_id
        and (f.productor_id = (select auth.uid()) or f.cooperativa_id = (select auth.uid()))
    )
  );

create policy lotes_insert on public.lotes
  for insert to authenticated
  with check (
    app_private.bean_rol() = 'admin'
    or exists (
      select 1 from public.finca f
      where f.id = public.lotes.finca_id
        and (f.productor_id = (select auth.uid()) or f.cooperativa_id = (select auth.uid()))
    )
  );

create policy lotes_update on public.lotes
  for update to authenticated
  using (
    app_private.bean_rol() = 'admin'
    or exists (
      select 1 from public.finca f
      where f.id = public.lotes.finca_id
        and (f.productor_id = (select auth.uid()) or f.cooperativa_id = (select auth.uid()))
    )
  )
  with check (
    app_private.bean_rol() = 'admin'
    or exists (
      select 1 from public.finca f
      where f.id = public.lotes.finca_id
        and (f.productor_id = (select auth.uid()) or f.cooperativa_id = (select auth.uid()))
    )
  );

-- lote_eventos: append-only (sin UPDATE ni DELETE). El actor debe ser el propio
-- usuario autenticado salvo admin.
create policy lote_eventos_select on public.lote_eventos
  for select to authenticated
  using (
    app_private.bean_rol() = 'admin'
    or exists (
      select 1 from public.lotes l
      join public.finca f on f.id = l.finca_id
      where l.id = public.lote_eventos.lote_id
        and (f.productor_id = (select auth.uid()) or f.cooperativa_id = (select auth.uid()))
    )
  );

create policy lote_eventos_insert on public.lote_eventos
  for insert to authenticated
  with check (
    (
      app_private.bean_rol() = 'admin'
      or exists (
        select 1 from public.lotes l
        join public.finca f on f.id = l.finca_id
        where l.id = public.lote_eventos.lote_id
          and (f.productor_id = (select auth.uid()) or f.cooperativa_id = (select auth.uid()))
      )
    )
    and (
      app_private.bean_rol() = 'admin'
      or actor_id = (select auth.uid())
    )
  );

-- qr_certificado
create policy qr_select on public.qr_certificado
  for select to authenticated
  using (
    app_private.bean_rol() = 'admin'
    or exists (
      select 1 from public.lotes l
      join public.finca f on f.id = l.finca_id
      where l.id = public.qr_certificado.lote_id
        and (f.productor_id = (select auth.uid()) or f.cooperativa_id = (select auth.uid()))
    )
  );

create policy qr_insert on public.qr_certificado
  for insert to authenticated
  with check (
    app_private.bean_rol() = 'admin'
    or exists (
      select 1 from public.lotes l
      join public.finca f on f.id = l.finca_id
      where l.id = public.qr_certificado.lote_id
        and (f.productor_id = (select auth.uid()) or f.cooperativa_id = (select auth.uid()))
    )
  );

-- pago: la cooperativa ve/escribe los suyos; el productor lee los de sus fincas;
-- el comprador lee los propios; admin todo.
create policy pago_select on public.pago
  for select to authenticated
  using (
    app_private.bean_rol() = 'admin'
    or cooperativa_id = (select auth.uid())
    or comprador_id = (select auth.uid())
    or exists (
      select 1 from public.lotes l
      join public.finca f on f.id = l.finca_id
      where l.id = public.pago.lote_id and f.productor_id = (select auth.uid())
    )
  );

create policy pago_insert on public.pago
  for insert to authenticated
  with check (
    app_private.bean_rol() = 'admin'
    or cooperativa_id = (select auth.uid())
  );

create policy pago_update on public.pago
  for update to authenticated
  using (
    app_private.bean_rol() = 'admin'
    or cooperativa_id = (select auth.uid())
  )
  with check (
    app_private.bean_rol() = 'admin'
    or cooperativa_id = (select auth.uid())
  );

-- propina: el comprador solo inserta/lee las suyas; productor y cooperativa leen
-- las de sus lotes; admin todo.
create policy propina_select on public.propina
  for select to authenticated
  using (
    app_private.bean_rol() = 'admin'
    or comprador_id = (select auth.uid())
    or exists (
      select 1 from public.lotes l
      join public.finca f on f.id = l.finca_id
      where l.id = public.propina.lote_id
        and (f.productor_id = (select auth.uid()) or f.cooperativa_id = (select auth.uid()))
    )
  );

create policy propina_insert on public.propina
  for insert to authenticated
  with check (
    app_private.bean_rol() = 'admin'
    or comprador_id = (select auth.uid())
  );

create policy propina_update on public.propina
  for update to authenticated
  using (app_private.bean_rol() = 'admin')
  with check (app_private.bean_rol() = 'admin');

-- verificacion: solo lectura para el dueño del lote/admin. FastAPI público
-- escribe con service_role (sin RLS).
create policy verificacion_select on public.verificacion
  for select to authenticated
  using (
    app_private.bean_rol() = 'admin'
    or exists (
      select 1 from public.lotes l
      join public.finca f on f.id = l.finca_id
      where l.id = public.verificacion.lote_id
        and (f.productor_id = (select auth.uid()) or f.cooperativa_id = (select auth.uid()))
    )
  );

-- ------------------------------------------------------------------ grants

revoke all on all tables in schema public from anon, authenticated;

grant select on public.usuarios to authenticated;
grant select on public.cooperativa to authenticated;
grant select, insert, update on public.finca to authenticated;
grant select, insert, update on public.lotes to authenticated;
grant select, insert on public.lote_eventos to authenticated;
grant select, insert on public.qr_certificado to authenticated;
grant select, insert, update on public.pago to authenticated;
grant select, insert, update on public.propina to authenticated;
grant select on public.verificacion to authenticated;
-- `public.evidencias` no se concede a `anon`/`authenticated`: solo service_role
-- (FastAPI) la administra.

-- `service_role` es el rol del backend (FastAPI). Tiene BYPASSRLS, pero sigue
-- necesitando privilegios de tabla; se conceden explícitamente para no depender
-- de los default privileges del entorno.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- ------------------------------------------------------------------ Storage
-- El servicio de Storage administra sus propios grants sobre `storage.objects`
-- (el grantor es `supabase_storage_admin` y el rol que corre las migraciones no
-- es superusuario, así que no puede revocarlos de forma durable: el servicio los
-- re-otorga al arrancar). El control efectivo es RLS: `storage.objects` tiene
-- RLS habilitado y NO se crea ninguna política para `anon`/`authenticated`, por
-- lo que toda lectura devuelve 0 filas y toda escritura falla con 42501. Solo
-- FastAPI (`service_role`) sube, firma lectura y elimina objetos.

commit;
