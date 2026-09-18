-- =============================================================================
-- BeanTrust · Migración 011 · Anclaje on-chain del Pasaporte (ADR-11)
--
--   1. Tabla `blockchain_anclas`: un trabajo por certificado QR, con estados
--      PENDIENTE / ENVIADA / CONFIRMADA / FALLIDA, lock de reconciliación y
--      backoff exponencial.
--   2. Trigger que encola el anclaje al emitir un QR (misma transacción).
--   3. Backfill de todos los certificados existentes.
--   4. RPC atómica `bean_claim_ancla` (FOR UPDATE SKIP LOCKED) para que dos
--      workers concurrentes nunca procesen el mismo trabajo.
--   5. RLS sin acceso directo desde móvil/cliente: solo `service_role`.
--
-- Una falla de RPC jamás impide emitir, verificar o escanear el QR: el anclaje
-- es una cola aparte que se reconcilia con el cron.
-- =============================================================================

begin;

-- ------------------------------------------------------------------ enum

do $$
begin
  if not exists (select 1 from pg_type where typname = 'estado_ancla') then
    create type public.estado_ancla as enum (
      'PENDIENTE', 'ENVIADA', 'CONFIRMADA', 'FALLIDA'
    );
  end if;
end
$$;

-- ------------------------------------------------------------------ tabla

create table if not exists public.blockchain_anclas (
  id                uuid primary key default gen_random_uuid(),
  qr_certificado_id uuid not null unique
                    references public.qr_certificado (id) on delete cascade,
  lote_id           uuid not null references public.lotes (id) on delete restrict,
  -- UUID de `lotes.id` -> 16 bytes hex rellenados a la derecha hasta bytes32.
  lote_id_bytes32   text not null check (lote_id_bytes32 ~ '^0x[0-9a-f]{64}$'),
  -- 64 caracteres hex del SHA-256 canónico, con prefijo 0x.
  hash_raiz         text not null check (hash_raiz ~ '^0x[0-9a-f]{64}$'),
  chain_id          integer not null default 84532,
  contrato          text,
  estado            public.estado_ancla not null default 'PENDIENTE',
  tx_hash           text unique,
  bloque            bigint,
  intentos          integer not null default 0 check (intentos >= 0),
  error             text,
  lock_por          text,
  lock_hasta        timestamptz,
  proximo_intento   timestamptz not null default now(),
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now()
);

create index if not exists blockchain_anclas_cola_idx
  on public.blockchain_anclas (estado, proximo_intento, creado_en);

-- `actualizado_en` automático (reusa `set_actualizado_en` de la migración 004).
drop trigger if exists trg_anclas_actualizado_en on public.blockchain_anclas;
create trigger trg_anclas_actualizado_en
  before update on public.blockchain_anclas
  for each row execute function public.set_actualizado_en();

-- ------------------------------------------------------- trigger de encolado

create or replace function public.bean_encolar_ancla_qr() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.blockchain_anclas (
    qr_certificado_id, lote_id, lote_id_bytes32, hash_raiz
  ) values (
    new.id,
    new.lote_id,
    '0x' || replace(new.lote_id::text, '-', '') || repeat('0', 32),
    -- `qr_certificado.hash_sha256` es el hexdigest de 64 chars SIN prefijo
    -- (igual que `hash_a_bytes32` lo añade al leer). El check exige 0x.
    '0x' || lower(new.hash_sha256)
  )
  on conflict (qr_certificado_id) do nothing;
  return new;
end;
$$;

revoke all on function public.bean_encolar_ancla_qr() from public, anon, authenticated;

drop trigger if exists trg_qr_encolar_ancla on public.qr_certificado;
create trigger trg_qr_encolar_ancla
  after insert on public.qr_certificado
  for each row execute function public.bean_encolar_ancla_qr();

-- ------------------------------------------------------------ backfill

insert into public.blockchain_anclas (
  qr_certificado_id, lote_id, lote_id_bytes32, hash_raiz
)
select
  q.id,
  q.lote_id,
  '0x' || replace(q.lote_id::text, '-', '') || repeat('0', 32),
  '0x' || lower(q.hash_sha256)
from public.qr_certificado q
on conflict (qr_certificado_id) do nothing;

-- ------------------------------------------------- RPC de reclamo con lock

create or replace function public.bean_claim_ancla(
  p_lock_por text,
  p_lease_segundos integer
) returns setof public.blockchain_anclas
language sql
security definer
set search_path = ''
as $$
  with candidata as (
    select id
    from public.blockchain_anclas
    where estado in ('PENDIENTE', 'ENVIADA')
      and proximo_intento <= now()
      and (lock_hasta is null or lock_hasta <= now())
    order by creado_en
    for update skip locked
    limit 1
  )
  update public.blockchain_anclas a
    set lock_por = p_lock_por,
        lock_hasta = now() + make_interval(secs => p_lease_segundos),
        actualizado_en = now()
    from candidata c
    where a.id = c.id
    returning a.*;
$$;

revoke all on function public.bean_claim_ancla(text, integer) from public, anon, authenticated;
grant execute on function public.bean_claim_ancla(text, integer) to service_role;

-- ------------------------------------------------------------------ RLS

alter table public.blockchain_anclas enable row level security;
-- Sin políticas: `anon`/`authenticated` no ven nada. El backend (`service_role`)
-- tiene BYPASSRLS y el grant explícito.
revoke all on public.blockchain_anclas from anon, authenticated;
grant all on public.blockchain_anclas to service_role;

commit;
