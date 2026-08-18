-- =============================================================================
-- BeanTrust · Migración 003 · Integridad y append-only (§4, §6)
--
--   1. Bloquea update/delete sobre lote_eventos (registro inmutable).
--   2. Actualiza lotes.actualizado_en en cada mutación.
--   3. La venta (lote -> VENDIDO) exige tener pago registrado (PENDIENTE);
--      así el estado no puede "saltarse" la compensación (§9).
-- =============================================================================

begin;

-- ---------------------------------------------------------------- append-only

create or replace function evitar_mutacion_eventos() returns trigger
language plpgsql as $$
begin
  raise exception 'lote_eventos es append-only: no se permite %', tg_op;
end;
$$;

create trigger lote_eventos_no_update
  before update on lote_eventos
  for each row execute function evitar_mutacion_eventos();

create trigger lote_eventos_no_delete
  before delete on lote_eventos
  for each row execute function evitar_mutacion_eventos();

-- ---------------------------------------------------------------- actualizado_en

create or replace function tocar_lote() returns trigger
language plpgsql as $$
begin
  update lotes set actualizado_en = now() where id = new.lote_id;
  return new;
end;
$$;

create trigger lote_eventos_tocar_lote
  after insert on lote_eventos
  for each row execute function tocar_lote();

-- ---------------------------------------------------------------- venta exige pago

create or replace function validar_venta() returns trigger
language plpgsql as $$
begin
  if new.tipo = 'VENTA'
     and not exists (
       select 1 from pago p where p.lote_id = new.lote_id
     ) then
    raise exception 'Un lote solo puede venderse con un pago registrado (PENDIENTE).';
  end if;
  return new;
end;
$$;

create trigger lote_eventos_validar_venta
  before insert on lote_eventos
  for each row execute function validar_venta();

commit;