-- =============================================================================
-- BeanTrust · Migración 010 · Timestamp canónico del evento génesis
--
-- Cierra el defecto de reproducibilidad del hash introducido por 008/009: el
-- dominio calcula `hash_etapa` incluyendo `evento.registrado_en` (dominio.py),
-- pero la RPC insertaba el evento sin esa columna y Postgres aplicaba su
-- `default now()`. El timestamp persistido no coincidía con el hasheado y la
-- cadena dejaba de ser reproducible.
--
-- Aquí:
--   1. Se elimina la firma pública de 10 argumentos de la 008/009.
--   2. La lógica privilegiada se mueve a `app_private` con
--      `security definer` y `search_path = ''` (todos los objetos calificados),
--      añadiendo `p_registrado_en timestamptz`.
--   3. Se inserta `lote_eventos.registrado_en = p_registrado_en`; nunca el
--      `default now()`.
--   4. En `public` queda solo un wrapper `security invoker` que delega.
--   5. Se corrige la rama de carrera de la 009 para comparar también la
--      evidencia adjunta antes de devolver replay.
--
-- `adjuntada_en` sigue siendo el reloj propio de la evidencia (no entra al
-- hash): no se toca su semántica.
-- =============================================================================

begin;

-- ------------------------------------------------------------------ limpieza
-- La firma antigua se elimina antes de crear la nueva de 11 argumentos.
drop function if exists public.registrar_cosecha_con_evidencia(
  uuid, uuid, uuid, text, date, double precision, text, text, uuid, text
);

-- ------------------------------------------------------------------ triggers
-- Endurecer los triggers de 003: nuestra RPC corre con `search_path = ''` y
-- ellos referencian `lotes`/`pago` sin calificar, así que fallaban al dispararse
-- dentro de la función. Se califican y fijan su propio `search_path` (no se
-- edita 003). `evitar_mutacion_eventos` no referencia objetos, pero se alinea.
create or replace function public.evitar_mutacion_eventos() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'lote_eventos es append-only: no se permite %', tg_op;
end;
$$;

create or replace function public.tocar_lote() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.lotes set actualizado_en = pg_catalog.now() where id = new.lote_id;
  return new;
end;
$$;

create or replace function public.validar_venta() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tipo = 'VENTA'
     and not exists (
       select 1 from public.pago p where p.lote_id = new.lote_id
     ) then
    raise exception 'Un lote solo puede venderse con un pago registrado (PENDIENTE).';
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------------ privada
create or replace function app_private.registrar_cosecha_con_evidencia(
  p_lote_id            uuid,
  p_evento_id          uuid,
  p_finca_id           uuid,
  p_codigo_publico     text,
  p_fecha_cosecha      date,
  p_peso_kg            double precision,
  p_variedad           text,
  p_metodo_beneficiado text,
  p_evidencia_id       uuid,
  p_hash_etapa         text,
  p_registrado_en      timestamptz
) returns table (lote_id uuid, reintento boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor              uuid := auth.uid();
  v_finca              public.finca%rowtype;
  v_evidencia          public.evidencias%rowtype;
  v_lote               public.lotes%rowtype;
  v_evento_peso        double precision;
  v_evento_actor       uuid;
  v_evidencia_adjunta  uuid;
  v_insertado          uuid;
begin
  if v_actor is null then
    raise exception 'No autenticado.' using errcode = '28000';
  end if;

  -- Tenencia de la finca (la RLS no aplica dentro de security definer).
  select * into v_finca from public.finca where id = p_finca_id;
  if not found then
    raise exception 'La finca no existe o no tiene acceso a ella.' using errcode = '42501';
  end if;
  if not (
    v_finca.productor_id = v_actor
    or v_finca.cooperativa_id = v_actor
    or exists (select 1 from public.usuarios u where u.id = v_actor and u.rol = 'admin')
  ) then
    raise exception 'La finca no existe o no tiene acceso a ella.' using errcode = '42501';
  end if;

  -- Bloquea la evidencia y valida que sea de este usuario/finca/lote. El estado
  -- se revisa por rama: en el reintento ya estará ADJUNTA.
  select * into v_evidencia from public.evidencias where id = p_evidencia_id for update;
  if not found then
    raise exception 'La evidencia no existe.' using errcode = 'P0002';
  end if;
  if v_evidencia.uploader_id <> v_actor
     or v_evidencia.finca_id <> p_finca_id
     or v_evidencia.lote_id <> p_lote_id then
    raise exception 'La evidencia no corresponde a este lote.' using errcode = '42501';
  end if;

  -- Reintento: el lote ya existe. Idempotente si coinciden los datos estables.
  -- (El hash no sirve: incluye `registrado_en`, que cambia en cada intento.)
  select * into v_lote from public.lotes where id = p_lote_id;
  if found then
    select e.peso_kg, e.actor_id into v_evento_peso, v_evento_actor
      from public.lote_eventos e
     where e.lote_id = p_lote_id and e.tipo = 'COSECHA'
     order by e.registrado_en, e.id
     limit 1;
    select e.id into v_evidencia_adjunta
      from public.evidencias e
     where e.lote_id = p_lote_id and e.estado = 'ADJUNTA'
     limit 1;
    if v_lote.finca_id = p_finca_id
       and v_lote.fecha_cosecha = p_fecha_cosecha
       and v_lote.variedad is not distinct from p_variedad
       and v_lote.metodo_beneficiado is not distinct from p_metodo_beneficiado
       and v_evento_peso = p_peso_kg
       and v_evento_actor = v_actor
       and (v_evidencia_adjunta is null or v_evidencia_adjunta = p_evidencia_id) then
      update public.evidencias
         set estado = 'ADJUNTA', adjuntada_en = pg_catalog.now()
       where id = p_evidencia_id and estado = 'PENDIENTE';
      return query select p_lote_id, true;
      return;
    end if;
    raise exception 'El lote ya existe con datos distintos.' using errcode = '23505';
  end if;

  -- Alta nueva: la evidencia debe seguir PENDIENTE.
  if v_evidencia.estado <> 'PENDIENTE' then
    raise exception 'La evidencia ya está adjunta a un lote.' using errcode = '23505';
  end if;

  insert into public.lotes (
    id, finca_id, codigo_publico, estado, peso_actual_kg, fecha_cosecha,
    variedad, metodo_beneficiado, evidencia_url, evidencia_sha256
  ) values (
    p_lote_id, p_finca_id, p_codigo_publico, 'CEREZA', p_peso_kg, p_fecha_cosecha,
    p_variedad, p_metodo_beneficiado, v_evidencia.storage_key, v_evidencia.sha256
  )
  on conflict (id) do nothing
  returning id into v_insertado;

  -- Carrera con otro alta del mismo lote: releer, comparar datos estables Y la
  -- evidencia ya adjunta (no depender del índice único como control de flujo).
  if v_insertado is null then
    select * into v_lote from public.lotes where id = p_lote_id;
    select e.peso_kg, e.actor_id into v_evento_peso, v_evento_actor
      from public.lote_eventos e
     where e.lote_id = p_lote_id and e.tipo = 'COSECHA'
     order by e.registrado_en, e.id
     limit 1;
    select e.id into v_evidencia_adjunta
      from public.evidencias e
     where e.lote_id = p_lote_id and e.estado = 'ADJUNTA'
     limit 1;
    if v_lote.finca_id = p_finca_id
       and v_lote.fecha_cosecha = p_fecha_cosecha
       and v_lote.variedad is not distinct from p_variedad
       and v_lote.metodo_beneficiado is not distinct from p_metodo_beneficiado
       and v_evento_peso = p_peso_kg
       and v_evento_actor = v_actor
       and (v_evidencia_adjunta is null or v_evidencia_adjunta = p_evidencia_id) then
      update public.evidencias
         set estado = 'ADJUNTA', adjuntada_en = pg_catalog.now()
       where id = p_evidencia_id and estado = 'PENDIENTE';
      return query select p_lote_id, true;
      return;
    end if;
    raise exception 'El lote ya existe con datos distintos.' using errcode = '23505';
  end if;

  -- Timestamp canónico: el mismo que entró al `hash_etapa`.
  insert into public.lote_eventos (
    id, lote_id, tipo, de_estado, a_estado, actor_id, peso_kg, hash_etapa,
    registrado_en
  ) values (
    p_evento_id, p_lote_id, 'COSECHA', null, 'CEREZA', v_actor, p_peso_kg,
    p_hash_etapa, p_registrado_en
  );

  update public.evidencias
     set estado = 'ADJUNTA', adjuntada_en = pg_catalog.now()
   where id = p_evidencia_id;

  return query select p_lote_id, false;
end;
$$;

-- ------------------------------------------------------------------ wrapper
-- Mínimo y `security invoker`: delega en la privada. La Data API solo expone
-- `public`; `app_private` queda fuera del alcance de PostgREST.
create or replace function public.registrar_cosecha_con_evidencia(
  p_lote_id            uuid,
  p_evento_id          uuid,
  p_finca_id           uuid,
  p_codigo_publico     text,
  p_fecha_cosecha      date,
  p_peso_kg            double precision,
  p_variedad           text,
  p_metodo_beneficiado text,
  p_evidencia_id       uuid,
  p_hash_etapa         text,
  p_registrado_en      timestamptz
) returns table (lote_id uuid, reintento boolean)
language sql
security invoker
set search_path = ''
as $$
  select * from app_private.registrar_cosecha_con_evidencia(
    p_lote_id, p_evento_id, p_finca_id, p_codigo_publico, p_fecha_cosecha,
    p_peso_kg, p_variedad, p_metodo_beneficiado, p_evidencia_id, p_hash_etapa,
    p_registrado_en
  );
$$;

-- ------------------------------------------------------------------ permisos
revoke all on function app_private.registrar_cosecha_con_evidencia(
  uuid, uuid, uuid, text, date, double precision, text, text, uuid, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.registrar_cosecha_con_evidencia(
  uuid, uuid, uuid, text, date, double precision, text, text, uuid, text, timestamptz
) from public, anon, authenticated;

-- El wrapper es `security invoker`: necesita `USAGE` del esquema privado y
-- `EXECUTE` de la función privada para que el rol `authenticated` la alcance.
grant usage on schema app_private to authenticated;
grant execute on function app_private.registrar_cosecha_con_evidencia(
  uuid, uuid, uuid, text, date, double precision, text, text, uuid, text, timestamptz
) to authenticated;
grant execute on function public.registrar_cosecha_con_evidencia(
  uuid, uuid, uuid, text, date, double precision, text, text, uuid, text, timestamptz
) to authenticated;

notify pgrst, 'reload schema';

commit;
