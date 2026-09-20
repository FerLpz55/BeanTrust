-- =============================================================================
-- BeanTrust · Pruebas RLS del alta pública y de la finca inicial (migración 014)
--
-- Comprueba, contra Postgres real, que:
--  - el trigger de Auth fuerza `productor` aunque la metadata pida otro rol;
--  - un productor solo puede crear su finca con la cooperativa del piloto;
--  - ni el productor ni la cooperativa pueden cambiar la tenencia de una finca.
-- =============================================================================

begin;

select plan(8);

-- ------------------------------------------------------------------ fixtures
-- La cooperativa del piloto se resuelve por su email estable; aquí se siembra
-- con ese email (el resto del escenario es local a la prueba).
insert into public.usuarios (id, email, rol, nombre) values
  ('00000000-0000-0000-0000-0000000000c1', 'cooperativa@beantrust.dev', 'cooperativa', 'Café Piloto'),
  ('00000000-0000-0000-0000-0000000000c2', 'otra-coop@test.dev', 'cooperativa', 'Otra Coop'),
  ('00000000-0000-0000-0000-0000000000f1', 'productor@test.dev', 'productor', 'Productor');

insert into public.cooperativa (id, nombre, municipio) values
  ('00000000-0000-0000-0000-0000000000c1', 'Café Piloto', 'Coatepec'),
  ('00000000-0000-0000-0000-0000000000c2', 'Otra Coop', 'Xico');

-- ================================================================== productor
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
set local role authenticated;

select lives_ok($$
  insert into public.finca (id, productor_id, cooperativa_id, nombre, municipio)
  values ('00000000-0000-0000-0000-0000000000a1',
          '00000000-0000-0000-0000-0000000000f1',
          '00000000-0000-0000-0000-0000000000c1',
          'Mi Finca', 'Coatepec')
$$, 'productor: crea su finca con la cooperativa del piloto');

select throws_ok($$
  insert into public.finca (id, productor_id, cooperativa_id, nombre, municipio)
  values ('00000000-0000-0000-0000-0000000000a2',
          '00000000-0000-0000-0000-0000000000f1',
          '00000000-0000-0000-0000-0000000000c2',
          'Finca Ajena', 'Xico')
$$, '42501', null::text, 'productor: no se asocia a otra cooperativa');

select throws_ok($$
  insert into public.finca (id, productor_id, cooperativa_id, nombre, municipio)
  values ('00000000-0000-0000-0000-0000000000a3',
          '00000000-0000-0000-0000-0000000000c1',
          '00000000-0000-0000-0000-0000000000c1',
          'Finca De Otro', 'Coatepec')
$$, '42501', null::text, 'productor: no crea finca a nombre de otro');

select throws_ok($$
  update public.finca set cooperativa_id = '00000000-0000-0000-0000-0000000000c2'
   where id = '00000000-0000-0000-0000-0000000000a1'
$$, '42501', null::text, 'productor: no cambia la cooperativa de su finca');

select throws_ok($$
  update public.finca set productor_id = '00000000-0000-0000-0000-0000000000c1'
   where id = '00000000-0000-0000-0000-0000000000a1'
$$, '42501', null::text, 'productor: no cambia el propietario de su finca');

select lives_ok($$
  update public.finca set nombre = 'Mi Finca Renombrada'
   where id = '00000000-0000-0000-0000-0000000000a1'
$$, 'productor: sí puede editar datos no sensibles de su finca');

-- ================================================================== cooperativa
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';

select throws_ok($$
  update public.finca set productor_id = '00000000-0000-0000-0000-0000000000c2'
   where id = '00000000-0000-0000-0000-0000000000a1'
$$, '42501', null::text, 'cooperativa: no cambia el propietario de la finca');

reset role;

-- ================================================= alta directa contra Auth
-- Metadata manipulada: el trigger debe degradar el rol a `productor`.
insert into auth.users (id, email, raw_user_meta_data) values (
  '00000000-0000-0000-0000-0000000000e1',
  'intruso@test.dev',
  '{"rol":"cooperativa","nombre":"Intruso"}'::jsonb
);

select is(
  (select rol::text from public.usuarios where id = '00000000-0000-0000-0000-0000000000e1'),
  'productor',
  'auth: una alta con metadata privilegiada queda como productor');

select * from finish();

rollback;
