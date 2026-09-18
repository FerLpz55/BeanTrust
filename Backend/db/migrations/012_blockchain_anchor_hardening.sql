-- =============================================================================
-- BeanTrust · Migración 012 · Endurecimiento del anclaje (ADR-11)
--
--   1. Nuevo estado `ENVIANDO` (nonce reservado, transmisión incierta).
--   2. Unicidad de `qr_certificado.lote_id`: un Pasaporte anclable por lote.
--      Si hay duplicados, la migración ABORTA y reporta los IDs (no borra nada).
--   3. Columnas de hardening: nonce, enviada_en, confirmada_en, ultimo_chequeo_en,
--      runtime_code_hash, codigo_error y lock_token (fencing).
--   4. Lease global del worker (`app_private.blockchain_worker_locks`) y RPCs
--      security definer de adquirir/renovar/liberar/reclamar.
--   5. `CONFIRMADA` exige tx_hash y bloque real (> 0).
--
-- Requiere la migración 011 aplicada. No se reescribe 011.
-- =============================================================================

-- `ALTER TYPE ... ADD VALUE` no puede usarse en la misma transacción que lo
-- referencia, así que se confirma antes del resto de la migración.
alter type public.estado_ancla add value if not exists 'ENVIANDO' before 'ENVIADA';

begin;

-- --------------------------------------------------- unicidad QR por lote

do $$
declare
  v_duplicados text;
begin
  select string_agg(lote_id::text, ', ' order by lote_id::text)
    into v_duplicados
  from (
    select lote_id
    from public.qr_certificado
    group by lote_id
    having count(*) > 1
  ) d;

  if v_duplicados is not null then
    raise exception
      'Hay múltiples QR para los lotes: %. Se aborta sin borrar trazabilidad; '
      'resuelve los duplicados manualmente.', v_duplicados;
  end if;
end
$$;

alter table public.qr_certificado
  drop constraint if exists qr_certificado_lote_id_unique;
alter table public.qr_certificado
  add constraint qr_certificado_lote_id_unique unique (lote_id);

-- ------------------------------------------------- columnas de hardening

alter table public.blockchain_anclas
  add column if not exists runtime_code_hash text,
  add column if not exists nonce             bigint,
  add column if not exists enviada_en        timestamptz,
  add column if not exists confirmada_en     timestamptz,
  add column if not exists ultimo_chequeo_en timestamptz,
  add column if not exists codigo_error      text,
  add column if not exists lock_token        uuid;

-- El lock por fila de 011 (`lock_por`) se reemplaza por el token de fencing.
alter table public.blockchain_anclas drop column if exists lock_por;

create index if not exists blockchain_anclas_worker_idx
  on public.blockchain_anclas (estado, proximo_intento, creado_en);

-- Una ancla CONFIRMADA siempre tiene tx_hash y bloque real.
alter table public.blockchain_anclas
  drop constraint if exists blockchain_anclas_confirmada_completa;
alter table public.blockchain_anclas
  add constraint blockchain_anclas_confirmada_completa
  check (
    estado <> 'CONFIRMADA'
    or (tx_hash is not null and bloque is not null and bloque > 0)
  );

-- --------------------------------------------------- lock global del worker

create table if not exists app_private.blockchain_worker_locks (
  nombre         text primary key,
  lock_token     uuid,
  lock_hasta     timestamptz,
  actualizado_en timestamptz not null default now()
);

revoke all on app_private.blockchain_worker_locks from public, anon, authenticated;

create or replace function public.bean_adquirir_lock_anclaje(
  p_nombre text,
  p_lease_segundos integer
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token uuid;
begin
  insert into app_private.blockchain_worker_locks as l
    (nombre, lock_token, lock_hasta, actualizado_en)
  values
    (p_nombre, gen_random_uuid(), now() + make_interval(secs => p_lease_segundos), now())
  on conflict (nombre) do update
    set lock_token = gen_random_uuid(),
        lock_hasta = now() + make_interval(secs => p_lease_segundos),
        actualizado_en = now()
    where l.lock_hasta is null or l.lock_hasta <= now()
  returning lock_token into v_token;
  return v_token;
end;
$$;

create or replace function public.bean_renovar_lock_anclaje(
  p_nombre text,
  p_lock_token uuid,
  p_lease_segundos integer
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update app_private.blockchain_worker_locks
     set lock_hasta = now() + make_interval(secs => p_lease_segundos),
         actualizado_en = now()
   where nombre = p_nombre and lock_token = p_lock_token;
  return found;
end;
$$;

create or replace function public.bean_liberar_lock_anclaje(
  p_nombre text,
  p_lock_token uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update app_private.blockchain_worker_locks
     set lock_token = null, lock_hasta = null, actualizado_en = now()
   where nombre = p_nombre and lock_token = p_lock_token;
  return found;
end;
$$;

create or replace function public.bean_reclamar_ancla(
  p_lock_token uuid,
  p_lease_segundos integer
) returns setof public.blockchain_anclas
language sql
security definer
set search_path = ''
as $$
  with candidata as (
    select id
    from public.blockchain_anclas
    where estado in ('PENDIENTE', 'ENVIANDO', 'ENVIADA')
      and proximo_intento <= now()
      and (lock_hasta is null or lock_hasta <= now())
    order by creado_en
    for update skip locked
    limit 1
  )
  update public.blockchain_anclas a
     set lock_token = p_lock_token,
         lock_hasta = now() + make_interval(secs => p_lease_segundos),
         actualizado_en = now()
    from candidata c
   where a.id = c.id
  returning a.*;
$$;

-- ------------------------------------------------------------------ grants

revoke all on function public.bean_adquirir_lock_anclaje(text, integer)
  from public, anon, authenticated;
revoke all on function public.bean_renovar_lock_anclaje(text, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.bean_liberar_lock_anclaje(text, uuid)
  from public, anon, authenticated;
revoke all on function public.bean_reclamar_ancla(uuid, integer)
  from public, anon, authenticated;

grant execute on function public.bean_adquirir_lock_anclaje(text, integer) to service_role;
grant execute on function public.bean_renovar_lock_anclaje(text, uuid, integer) to service_role;
grant execute on function public.bean_liberar_lock_anclaje(text, uuid) to service_role;
grant execute on function public.bean_reclamar_ancla(uuid, integer) to service_role;

-- El RPC de lock por fila de 011 ya no se usa.
drop function if exists public.bean_claim_ancla(text, integer);

commit;
