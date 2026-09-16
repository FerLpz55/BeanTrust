-- =============================================================================
-- BeanTrust · Pruebas de la migración 008 (pgTAP)
--
-- Cubre: ensanchado a double precision de los campos físicos hasheados,
-- bitácora privada de reparación, índice único de evidencia ADJUNTA y la RPC
-- atómica `registrar_cosecha_con_evidencia` (tenencia, idempotencia, reuso).
-- =============================================================================

begin;

select plan(21);

-- ------------------------------------------------------------------ esquema
select is(
  (select data_type from information_schema.columns
    where table_schema = 'public' and table_name = 'lote_eventos' and column_name = 'peso_kg'),
  'double precision',
  'lote_eventos.peso_kg es double precision');

select is(
  (select data_type from information_schema.columns
    where table_schema = 'public' and table_name = 'lote_eventos' and column_name = 'densidad'),
  'double precision',
  'lote_eventos.densidad es double precision');

select is(
  (select data_type from information_schema.columns
    where table_schema = 'public' and table_name = 'lotes' and column_name = 'peso_actual_kg'),
  'double precision',
  'lotes.peso_actual_kg es double precision');

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'evidencias'
      and indexname = 'evidencias_lote_adjunta_uidx'
  ),
  'existe el índice único parcial de evidencia ADJUNTA');

select ok(
  (select to_regclass('app_private.reparacion_cadena_evento')) is not null,
  'existe la bitácora app_private.reparacion_cadena_evento');

select ok(
  not has_table_privilege('authenticated', 'app_private.reparacion_cadena_evento', 'SELECT'),
  'authenticated no lee la bitácora');

select ok(
  not has_table_privilege('anon', 'app_private.reparacion_cadena_evento', 'SELECT'),
  'anon no lee la bitácora');

select ok(
  has_function_privilege(
    'authenticated',
    'public.registrar_cosecha_con_evidencia(uuid,uuid,uuid,text,date,double precision,text,text,uuid,text)',
    'EXECUTE'),
  'authenticated puede ejecutar la RPC');

select ok(
  not has_function_privilege(
    'anon',
    'public.registrar_cosecha_con_evidencia(uuid,uuid,uuid,text,date,double precision,text,text,uuid,text)',
    'EXECUTE'),
  'anon no puede ejecutar la RPC');

-- ------------------------------------------------------------------ fixtures
insert into public.usuarios (id, email, rol, nombre) values
  ('00000000-0000-0000-0000-000000000001', 'p1@test.dev', 'productor',  'Productor 1'),
  ('00000000-0000-0000-0000-000000000002', 'p2@test.dev', 'productor',  'Productor 2'),
  ('00000000-0000-0000-0000-000000000003', 'c1@test.dev', 'cooperativa','Cooperativa 1'),
  ('00000000-0000-0000-0000-000000000005', 'b1@test.dev', 'comprador',  'Comprador 1');

insert into public.cooperativa (id, nombre, municipio) values
  ('00000000-0000-0000-0000-000000000003', 'Cooperativa 1', 'Coatepec');

insert into public.finca (id, productor_id, cooperativa_id, nombre, municipio) values
  ('00000000-0000-0000-0000-000000000011',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000003',
   'Finca 1', 'Coatepec'),
  ('00000000-0000-0000-0000-000000000012',
   '00000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000003',
   'Finca 2', 'Xico');

insert into public.evidencias (
  id, lote_id, finca_id, uploader_id, storage_key, sha256, content_type, size_bytes, estado
) values
  ('00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000000011',
   '00000000-0000-0000-0000-000000000001',
   'p1/lote-a1/e1.jpg', repeat('a', 64), 'image/jpeg', 1024, 'PENDIENTE'),
  ('00000000-0000-0000-0000-0000000000e2',
   '00000000-0000-0000-0000-0000000000a2',
   '00000000-0000-0000-0000-000000000011',
   '00000000-0000-0000-0000-000000000005',
   'b1/lote-a2/e2.jpg', repeat('b', 64), 'image/jpeg', 1024, 'PENDIENTE'),
  ('00000000-0000-0000-0000-0000000000e3',
   '00000000-0000-0000-0000-0000000000a3',
   '00000000-0000-0000-0000-000000000011',
   '00000000-0000-0000-0000-000000000001',
   'p1/lote-a3/e3.jpg', repeat('c', 64), 'image/jpeg', 1024, 'ADJUNTA');

-- ------------------------------------------------------------------ RPC: alta
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;

select is(
  (select reintento from public.registrar_cosecha_con_evidencia(
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-0000000000b1',
    '00000000-0000-0000-0000-000000000011',
    'LT-TEST0001', '2026-09-15', 87.6, 'Typica', 'lavado',
    '00000000-0000-0000-0000-0000000000e1', repeat('1', 64))),
  false,
  'RPC crea el lote (reintento = false)');

-- `evidencias` no tiene SELECT para authenticated (a propósito): se comprueba
-- el efecto como owner.
reset role;

select is(
  (select count(*)::int from public.lotes where id = '00000000-0000-0000-0000-0000000000a1'),
  1, 'el lote quedó creado');

select is(
  (select count(*)::int from public.lote_eventos
    where lote_id = '00000000-0000-0000-0000-0000000000a1' and tipo = 'COSECHA'),
  1, 'el evento génesis quedó creado');

select is(
  (select estado from public.evidencias where id = '00000000-0000-0000-0000-0000000000e1'),
  'ADJUNTA', 'la evidencia quedó ADJUNTA');

-- ------------------------------------------------------------------ RPC: idempotencia
set local role authenticated;

select is(
  (select reintento from public.registrar_cosecha_con_evidencia(
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-0000000000b1',
    '00000000-0000-0000-0000-000000000011',
    'LT-TEST0001', '2026-09-15', 87.6, 'Typica', 'lavado',
    '00000000-0000-0000-0000-0000000000e1', repeat('1', 64))),
  true,
  'reintento idéntico devuelve el lote existente (reintento = true)');

select is(
  (select count(*)::int from public.lote_eventos
    where lote_id = '00000000-0000-0000-0000-0000000000a1'),
  1, 'el reintento no duplica el evento génesis');

select throws_ok($$
  select * from public.registrar_cosecha_con_evidencia(
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-0000000000b1',
    '00000000-0000-0000-0000-000000000011',
    'LT-TEST0001', '2026-09-15', 87.6, 'Typica', 'lavado',
    '00000000-0000-0000-0000-0000000000e1', repeat('9', 64))
$$, '23505', null::text, 'reintento con hash distinto se rechaza');

-- ------------------------------------------------------------------ RPC: tenencia
reset role;

set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;

select throws_ok($$
  select * from public.registrar_cosecha_con_evidencia(
    '00000000-0000-0000-0000-0000000000a2',
    '00000000-0000-0000-0000-0000000000b2',
    '00000000-0000-0000-0000-000000000011',
    'LT-TEST0002', '2026-09-15', 10.0, null, null,
    '00000000-0000-0000-0000-0000000000e2', repeat('2', 64))
$$, '42501', null::text, 'productor ajeno no puede crear lote en la finca');

reset role;

set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;

select throws_ok($$
  select * from public.registrar_cosecha_con_evidencia(
    '00000000-0000-0000-0000-0000000000a2',
    '00000000-0000-0000-0000-0000000000b2',
    '00000000-0000-0000-0000-000000000011',
    'LT-TEST0002', '2026-09-15', 10.0, null, null,
    '00000000-0000-0000-0000-0000000000e2', repeat('2', 64))
$$, '42501', null::text, 'no se puede usar evidencia de otro uploader');

select throws_ok($$
  select * from public.registrar_cosecha_con_evidencia(
    '00000000-0000-0000-0000-0000000000a3',
    '00000000-0000-0000-0000-0000000000b3',
    '00000000-0000-0000-0000-000000000011',
    'LT-TEST0003', '2026-09-15', 10.0, null, null,
    '00000000-0000-0000-0000-0000000000e3', repeat('3', 64))
$$, '23505', null::text, 'una evidencia ya ADJUNTA no se puede reusar');

reset role;

-- ------------------------------------------------------------------ índice único
select throws_ok($$
  insert into public.evidencias (
    id, lote_id, finca_id, uploader_id, storage_key, sha256, content_type, size_bytes, estado
  ) values (
    '00000000-0000-0000-0000-0000000000e4',
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000001',
    'p1/lote-a1/e4.jpg', repeat('d', 64), 'image/jpeg', 1024, 'ADJUNTA'
  )
$$, '23505', null::text, 'no puede haber dos evidencias ADJUNTA por lote');

-- ------------------------------------------------------------------ sin auth
set local "request.jwt.claims" = '{}';

select throws_ok($$
  select * from public.registrar_cosecha_con_evidencia(
    '00000000-0000-0000-0000-0000000000a9',
    '00000000-0000-0000-0000-0000000000b9',
    '00000000-0000-0000-0000-000000000011',
    'LT-TEST0009', '2026-09-15', 10.0, null, null,
    '00000000-0000-0000-0000-0000000000e1', repeat('4', 64))
$$, '28000', null::text, 'sin auth.uid() la RPC rechaza');

select * from finish();

rollback;
