-- =============================================================================
-- BeanTrust · Migración 013 · Fencing del worker de anclaje (ADR-11)
--
--   1. `bean_reclamar_ancla` pasa a exigir el lease global vigente:
--      `(p_lock_nombre, p_lock_token, p_lease_segundos)`. Un worker vencido o
--      con token ajeno no puede reclamar trabajo (fencing real).
--   2. Formato de `tx_hash`: `null` o `^0x[0-9a-f]{64}$`. El gateway normaliza
--      con `Web3.to_hex`; este constraint impide persistir un hash sin `0x`.
--   3. Un solo índice de cola: se elimina el duplicado de 012 solo si su
--      definición coincide con el de 011.
--
-- NO toca las filas existentes (las nueve anclas PENDIENTE se conservan).
-- Requiere 011 y 012 aplicadas. No se reescriben.
-- =============================================================================

begin;

-- --------------------------------------------------- reclamar con fencing

drop function if exists public.bean_reclamar_ancla(uuid, integer);

create function public.bean_reclamar_ancla(
  p_lock_nombre text,
  p_lock_token uuid,
  p_lease_segundos integer
) returns setof public.blockchain_anclas
language sql
security definer
set search_path = ''
as $$
  with lock_vigente as (
    select 1
    from app_private.blockchain_worker_locks
    where nombre = p_lock_nombre
      and lock_token = p_lock_token
      and lock_hasta > now()
  ),
  candidata as (
    select id
    from public.blockchain_anclas
    where estado in ('PENDIENTE', 'ENVIANDO', 'ENVIADA')
      and proximo_intento <= now()
      and (lock_hasta is null or lock_hasta <= now())
      and exists (select 1 from lock_vigente)
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

revoke all on function public.bean_reclamar_ancla(text, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.bean_reclamar_ancla(text, uuid, integer) to service_role;

-- --------------------------------------------------- formato de tx_hash

alter table public.blockchain_anclas
  drop constraint if exists blockchain_anclas_tx_hash_formato;
alter table public.blockchain_anclas
  add constraint blockchain_anclas_tx_hash_formato
  check (tx_hash is null or tx_hash ~ '^0x[0-9a-f]{64}$');

-- --------------------------------------------------- un solo índice de cola

do $$
declare
  v_cola   text;
  v_worker text;
begin
  select pg_get_indexdef(c.oid)
    into v_cola
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'blockchain_anclas_cola_idx';

  select pg_get_indexdef(c.oid)
    into v_worker
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'blockchain_anclas_worker_idx';

  if v_cola is not null
     and v_worker is not null
     and replace(v_cola, 'blockchain_anclas_cola_idx', 'X')
       = replace(v_worker, 'blockchain_anclas_worker_idx', 'X') then
    drop index public.blockchain_anclas_worker_idx;
  end if;
end
$$;

commit;
