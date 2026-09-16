-- =============================================================================
-- BeanTrust · Migración 009 · Corrige la idempotencia de la RPC de cosecha
--
-- La RPC de la 008 comparaba el `hash_etapa` para decidir si un reintento era
-- idéntico. Pero el hash génesis incluye `registrado_en`, que cambia en cada
-- intento: cualquier replay legítimo (mismo lote, misma evidencia) acababa en
-- 409. Aquí se compara por los datos ESTABLES del alta (finca, fecha, variedad,
-- método, peso y actor del evento génesis) y por la evidencia adjunta.
--
-- `create or replace` conserva los grants de la 008; se reafirman por claridad.
-- =============================================================================

begin;

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

  -- Carrera con otro alta del mismo lote: releer y comparar datos estables.
  if v_insertado is null then
    select * into v_lote from public.lotes where id = p_lote_id;
    select e.peso_kg, e.actor_id into v_evento_peso, v_evento_actor
      from public.lote_eventos e
     where e.lote_id = p_lote_id and e.tipo = 'COSECHA'
     order by e.registrado_en, e.id
     limit 1;
    if v_lote.finca_id = p_finca_id
       and v_lote.fecha_cosecha = p_fecha_cosecha
       and v_lote.variedad is not distinct from p_variedad
       and v_lote.metodo_beneficiado is not distinct from p_metodo_beneficiado
       and v_evento_peso = p_peso_kg
       and v_evento_actor = v_actor then
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
