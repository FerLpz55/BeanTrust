-- =============================================================================
-- BeanTrust · Migración 008 · Integridad de la cadena + evidencia atómica
--
-- Cierra tres frentes:
--
--   1. Reproducibilidad del hash por etapa. Los campos físicos que entran al
--      hash estaban en `real` (float4); al releerlos desde Postgres el valor no
--      siempre coincide con el float64 que serializó FastAPI y la cadena no era
--      reproducible. Se ensanchan a `double precision` (el cast float4→float8 es
--      exacto: no cambia ningún valor almacenado). El dinero NO se toca.
--   2. Evidencia atómica. Se crea la RPC `registrar_cosecha_con_evidencia`, que
--      en una sola transacción bloquea la evidencia PENDIENTE, crea lote y
--      evento génesis y la marca ADJUNTA. Solo `authenticated`; `security
--      definer` con verificación explícita de tenencia (la RLS no aplica dentro).
--   3. Bitácora de reparación histórica (`app_private.reparacion_cadena_evento`)
--      para corregir los hashes corrompidos por el orden descendente sin ocultar
--      el cambio. La repara el script `scripts/auditar_integridad_historica.py`.
--
-- También se blinda la invariante "una sola evidencia ADJUNTA por lote" con un
-- índice único parcial.
-- =============================================================================

begin;

-- ------------------------------------------------------------------ tipos físicos
-- Solo campos físicos que entran al hash por etapa (ADR-11). Nada de dinero.
alter table public.lote_eventos
  alter column peso_kg type double precision,
  alter column merma_pct type double precision,
  alter column fermentacion_horas type double precision,
  alter column humedad_inicial_pct type double precision,
  alter column humedad_final_pct type double precision,
  alter column dias_reposo type double precision,
  alter column puntaje_sca type double precision,
  alter column densidad type double precision;

alter table public.lotes
  alter column peso_actual_kg type double precision;

-- ------------------------------------------------------------------ bitácora
create table if not exists app_private.reparacion_cadena_evento (
  id                 uuid primary key default gen_random_uuid(),
  lote_id            uuid not null,
  evento_id          uuid not null,
  hash_anterior      char(64),
  hash_nuevo         char(64) not null,
  raiz_anterior      char(64),
  raiz_nueva         char(64),
  certificado_id     uuid,
  motivo             text not null default 'historical_desc_order_repair',
  ejecutado_en       timestamptz not null default now(),
  version_migracion  text not null default '008_integridad_evidencias',
  operador           text not null default current_user,
  checksum_reporte   char(64)
);

create index if not exists reparacion_cadena_evento_lote_idx
  on app_private.reparacion_cadena_evento (lote_id, ejecutado_en);

revoke all on app_private.reparacion_cadena_evento from public, anon, authenticated;

-- ------------------------------------------------------------------ invariante ADJUNTA
do $$
declare
  v_duplicados integer;
begin
  select count(*) into v_duplicados
    from (
      select lote_id
        from public.evidencias
       where estado = 'ADJUNTA'
       group by lote_id
      having count(*) > 1
    ) t;
  if v_duplicados > 0 then
    raise exception
      'Hay % lote(s) con más de una evidencia ADJUNTA; corrige antes de crear el índice único.',
      v_duplicados;
  end if;
end
$$;

create unique index if not exists evidencias_lote_adjunta_uidx
  on public.evidencias (lote_id)
  where estado = 'ADJUNTA';

-- ------------------------------------------------------------------ RPC atómica
-- Persiste valores YA validados por `LoteService` (incluido el `hash_etapa`
-- calculado por el dominio). No recalcula la máquina de estados ni el hash.
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
  p_hash_etapa         text
) returns table (lote_id uuid, reintento boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor              uuid := auth.uid();
  v_finca              public.finca%rowtype;
  v_evidencia          public.evidencias%rowtype;
  v_lote               public.lotes%rowtype;
  v_hash_existente     text;
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

  -- Reintento: el lote ya existe. Solo se acepta si es idéntico.
  select * into v_lote from public.lotes where id = p_lote_id;
  if found then
    select e.hash_etapa into v_hash_existente
      from public.lote_eventos e
     where e.lote_id = p_lote_id and e.tipo = 'COSECHA'
     order by e.registrado_en, e.id
     limit 1;
    select e.id into v_evidencia_adjunta
      from public.evidencias e
     where e.lote_id = p_lote_id and e.estado = 'ADJUNTA'
     limit 1;
    if v_lote.finca_id = p_finca_id
       and v_hash_existente = p_hash_etapa
       and (v_evidencia_adjunta is null or v_evidencia_adjunta = p_evidencia_id) then
      update public.evidencias
         set estado = 'ADJUNTA', adjuntada_en = now()
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

  -- Carrera con otro alta del mismo lote: releer y comparar.
  if v_insertado is null then
    select * into v_lote from public.lotes where id = p_lote_id;
    select e.hash_etapa into v_hash_existente
      from public.lote_eventos e
     where e.lote_id = p_lote_id and e.tipo = 'COSECHA'
     order by e.registrado_en, e.id
     limit 1;
    if v_lote.finca_id = p_finca_id and v_hash_existente = p_hash_etapa then
      update public.evidencias
         set estado = 'ADJUNTA', adjuntada_en = now()
       where id = p_evidencia_id and estado = 'PENDIENTE';
      return query select p_lote_id, true;
      return;
    end if;
    raise exception 'El lote ya existe con datos distintos.' using errcode = '23505';
  end if;

  insert into public.lote_eventos (
    id, lote_id, tipo, de_estado, a_estado, actor_id, peso_kg, hash_etapa
  ) values (
    p_evento_id, p_lote_id, 'COSECHA', null, 'CEREZA', v_actor, p_peso_kg, p_hash_etapa
  );

  update public.evidencias
     set estado = 'ADJUNTA', adjuntada_en = now()
   where id = p_evidencia_id;

  return query select p_lote_id, false;
end;
$$;

revoke all on function public.registrar_cosecha_con_evidencia(
  uuid, uuid, uuid, text, date, double precision, text, text, uuid, text
) from public, anon;
grant execute on function public.registrar_cosecha_con_evidencia(
  uuid, uuid, uuid, text, date, double precision, text, text, uuid, text
) to authenticated;

commit;
