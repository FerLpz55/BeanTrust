-- =============================================================================
-- BeanTrust · Pruebas de Storage privado y tabla `evidencias` (pgTAP)
--
-- La evidencia fotográfica se sube/lee SIEMPRE a través de FastAPI con
-- `service_role`. Ni `anon` ni `authenticated` deben poder acceder al bucket ni
-- a la tabla `evidencias` (el móvil no habla con Postgres/Storage).
--
-- Sobre `storage.objects` los grants los administra el propio servicio de
-- Storage, así que el control efectivo es RLS: está habilitado y sin políticas
-- para usuarios. Por eso se comprueba el comportamiento (0 filas / 42501) y no
-- `has_table_privilege`.
-- =============================================================================

begin;

select plan(17);

-- ------------------------------------------------------------ storage.objects
select is(
  (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass),
  true,
  'storage.objects: RLS habilitado');

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'storage' and tablename = 'objects'),
  0,
  'storage.objects: sin políticas para usuarios');

set local "request.jwt.claims" = '{"role":"anon"}';
set local role anon;
select is(
  (select count(*)::int from storage.objects),
  0, 'anon: no lista storage.objects');
select throws_ok(
  $$insert into storage.objects (id, bucket_id, name)
    values (gen_random_uuid(), 'evidencias-lotes', 'x.jpg')$$,
  '42501', null::text, 'anon: no inserta en storage.objects');
reset role;

set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select is(
  (select count(*)::int from storage.objects),
  0, 'authenticated: no lista storage.objects');
select throws_ok(
  $$insert into storage.objects (id, bucket_id, name)
    values (gen_random_uuid(), 'evidencias-lotes', 'x.jpg')$$,
  '42501', null::text, 'authenticated: no inserta en storage.objects');
reset role;

-- ------------------------------------------------------------ tabla evidencias
select ok(
  not has_table_privilege('anon', 'public.evidencias', 'SELECT'),
  'anon: sin acceso directo a evidencias');
select ok(
  not has_table_privilege('authenticated', 'public.evidencias', 'SELECT'),
  'authenticated: sin SELECT en evidencias');
select ok(
  not has_table_privilege('authenticated', 'public.evidencias', 'INSERT'),
  'authenticated: sin INSERT en evidencias');
select ok(
  not has_table_privilege('authenticated', 'public.evidencias', 'UPDATE'),
  'authenticated: sin UPDATE en evidencias');
select ok(
  has_table_privilege('service_role', 'public.evidencias', 'SELECT'),
  'service_role: administra evidencias');

select is(
  (select relrowsecurity from pg_class where oid = 'public.evidencias'::regclass),
  true,
  'evidencias: RLS habilitado');

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'evidencias'),
  0,
  'evidencias: sin políticas para usuarios');

-- ------------------------------------------------------------ bucket privado
select is(
  (select public from storage.buckets where id = 'evidencias-lotes'),
  false,
  'bucket evidencias-lotes: privado');
select is(
  (select file_size_limit from storage.buckets where id = 'evidencias-lotes'),
  5242880::bigint,
  'bucket evidencias-lotes: límite de 5 MB');

-- ------------------------------------------------------------ helper de rol
select ok(
  has_function_privilege('authenticated', 'app_private.bean_rol()', 'EXECUTE'),
  'authenticated: puede ejecutar app_private.bean_rol()');
select ok(
  not has_function_privilege('anon', 'app_private.bean_rol()', 'EXECUTE'),
  'anon: no puede ejecutar app_private.bean_rol()');

select * from finish();

rollback;
