-- =============================================================================
-- BeanTrust · Pruebas RLS por rol (pgTAP)
--
-- Verifica que las políticas de la migración 006 aíslan de verdad a cada rol de
-- negocio (no basta con que `service_role` haga bypass: el punto es que un JWT
-- de usuario no pueda leer ni escribir datos ajenos).
--
-- Se simula cada usuario con `set local role authenticated` +
-- `request.jwt.claims`, que es lo que lee `auth.uid()`. Las escrituras válidas
-- se dejan para el final para que no alteren los conteos de lectura.
-- =============================================================================

begin;

select plan(38);

-- ------------------------------------------------------------------ fixtures
-- Como `postgres` la RLS no aplica (BYPASSRLS): se siembra el escenario.

insert into public.usuarios (id, email, rol, nombre) values
  ('00000000-0000-0000-0000-000000000001', 'p1@test.dev', 'productor',  'Productor 1'),
  ('00000000-0000-0000-0000-000000000002', 'p2@test.dev', 'productor',  'Productor 2'),
  ('00000000-0000-0000-0000-000000000003', 'c1@test.dev', 'cooperativa','Cooperativa 1'),
  ('00000000-0000-0000-0000-000000000004', 'c2@test.dev', 'cooperativa','Cooperativa 2'),
  ('00000000-0000-0000-0000-000000000005', 'b1@test.dev', 'comprador',  'Comprador 1'),
  ('00000000-0000-0000-0000-000000000006', 'b2@test.dev', 'comprador',  'Comprador 2'),
  ('00000000-0000-0000-0000-000000000007', 'a1@test.dev', 'admin',      'Admin');

insert into public.cooperativa (id, nombre, municipio) values
  ('00000000-0000-0000-0000-000000000003', 'Cooperativa 1', 'Coatepec'),
  ('00000000-0000-0000-0000-000000000004', 'Cooperativa 2', 'Xico');

insert into public.finca (id, productor_id, cooperativa_id, nombre, municipio) values
  ('00000000-0000-0000-0000-000000000011',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000003',
   'Finca 1', 'Coatepec'),
  ('00000000-0000-0000-0000-000000000012',
   '00000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000004',
   'Finca 2', 'Xico');

insert into public.lotes (id, finca_id, codigo_publico, peso_actual_kg, fecha_cosecha) values
  ('00000000-0000-0000-0000-000000000021',
   '00000000-0000-0000-0000-000000000011', 'LOTE-1', 100, '2026-01-01'),
  ('00000000-0000-0000-0000-000000000022',
   '00000000-0000-0000-0000-000000000012', 'LOTE-2', 100, '2026-01-01');

insert into public.lote_eventos (id, lote_id, tipo, a_estado, actor_id, peso_kg) values
  ('00000000-0000-0000-0000-000000000031',
   '00000000-0000-0000-0000-000000000021', 'COSECHA', 'CEREZA',
   '00000000-0000-0000-0000-000000000001', 100);

insert into public.pago (
  id, lote_id, cooperativa_id, comprador_id,
  monto_total, comision_pct, monto_productor, idempotency_key
) values (
  '00000000-0000-0000-0000-000000000041',
  '00000000-0000-0000-0000-000000000021',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000005',
  1000, 3, 970, '00000000-0000-0000-0000-000000000041'
);

insert into public.propina (
  id, lote_id, comprador_id, productor_id, monto, clave_idempotencia
) values (
  '00000000-0000-0000-0000-000000000051',
  '00000000-0000-0000-0000-000000000021',
  '00000000-0000-0000-0000-000000000005',
  '00000000-0000-0000-0000-000000000001',
  50, 'propina-1'
);

-- ================================================================== productor
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;

select is(
  (select count(*)::int from public.finca where id = '00000000-0000-0000-0000-000000000011'),
  1, 'productor: lee su finca');
select is(
  (select count(*)::int from public.finca where id = '00000000-0000-0000-0000-000000000012'),
  0, 'productor: no lee finca ajena');
select is(
  (select count(*)::int from public.lotes where id = '00000000-0000-0000-0000-000000000021'),
  1, 'productor: lee lote de su finca');
select is(
  (select count(*)::int from public.lotes where id = '00000000-0000-0000-0000-000000000022'),
  0, 'productor: no lee lote ajeno');

select throws_ok($$
  insert into public.lotes (id, finca_id, codigo_publico, peso_actual_kg, fecha_cosecha)
  values ('00000000-0000-0000-0000-0000000000a2',
          '00000000-0000-0000-0000-000000000012', 'LOTE-X', 10, '2026-02-01')
$$, '42501', null::text, 'productor: no inserta lote en finca ajena');

select throws_ok($$
  insert into public.lote_eventos (id, lote_id, tipo, a_estado, actor_id)
  values ('00000000-0000-0000-0000-0000000000a4',
          '00000000-0000-0000-0000-000000000021', 'LIMPIEZA', 'CEREZA',
          '00000000-0000-0000-0000-000000000002')
$$, '42501', null::text, 'productor: no inserta evento con actor ajeno');

select throws_ok($$
  insert into public.lote_eventos (id, lote_id, tipo, a_estado, actor_id)
  values ('00000000-0000-0000-0000-0000000000a5',
          '00000000-0000-0000-0000-000000000022', 'LIMPIEZA', 'CEREZA',
          '00000000-0000-0000-0000-000000000001')
$$, '42501', null::text, 'productor: no inserta evento en lote ajeno');

select throws_ok($$
  update public.lote_eventos set peso_kg = 1
   where id = '00000000-0000-0000-0000-000000000031'
$$, '42501', null::text, 'productor: no actualiza lote_eventos');

select throws_ok($$
  delete from public.lote_eventos
   where id = '00000000-0000-0000-0000-000000000031'
$$, '42501', null::text, 'productor: no borra lote_eventos');

reset role;

-- ================================================================== comprador
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000005","role":"authenticated"}';
set local role authenticated;

select is((select count(*)::int from public.lotes), 0,
  'comprador: no lee lotes');
select is((select count(*)::int from public.finca), 0,
  'comprador: no lee fincas');
select is(
  (select count(*)::int from public.usuarios where id = '00000000-0000-0000-0000-000000000005'),
  1, 'comprador: lee su propio usuario');
select is(
  (select count(*)::int from public.usuarios where id = '00000000-0000-0000-0000-000000000006'),
  0, 'comprador: no lee usuario ajeno');

reset role;

-- ================================================================== cooperativa
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;

select is(
  (select count(*)::int from public.usuarios where rol = 'comprador'),
  2, 'cooperativa: lee el directorio de compradores');
select is(
  (select count(*)::int from public.usuarios where rol = 'productor'),
  0, 'cooperativa: no lee productores');
select is(
  (select count(*)::int from public.finca),
  1, 'cooperativa: lee su finca');
select is(
  (select count(*)::int from public.lotes),
  1, 'cooperativa: lee el lote de su finca');

with upd as (
  update public.finca set nombre = 'Hack'
   where id = '00000000-0000-0000-0000-000000000012'
  returning 1
)
select is((select count(*)::int from upd), 0,
  'cooperativa: no actualiza finca ajena');

select lives_ok($$
  update public.finca set nombre = 'Finca 1 renombrada'
   where id = '00000000-0000-0000-0000-000000000011'
$$, 'cooperativa: actualiza su finca');

reset role;

-- ================================================================== pago
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.pago), 1,
  'cooperativa: lee su pago');
with upd as (
  update public.pago set estado_pago = 'CONFIRMADO'
   where id = '00000000-0000-0000-0000-000000000041'
  returning 1
)
select is((select count(*)::int from upd), 1,
  'cooperativa: actualiza su pago');
reset role;

set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.pago), 0,
  'cooperativa ajena: no lee el pago');
reset role;

set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.pago), 1,
  'productor: lee el pago de su lote');
with upd as (
  update public.pago set estado_pago = 'FALLIDO'
   where id = '00000000-0000-0000-0000-000000000041'
  returning 1
)
select is((select count(*)::int from upd), 0,
  'productor: no actualiza el pago');
reset role;

set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000005","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.pago), 1,
  'comprador: lee su pago');
reset role;

set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000006","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.pago), 0,
  'comprador ajeno: no lee el pago');
reset role;

set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000007","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.pago), 1,
  'admin: lee todos los pagos');
reset role;

-- ================================================================== propina (lectura)
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.propina), 1,
  'productor: lee la propina de su lote');
reset role;

set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.propina), 0,
  'productor ajeno: no lee la propina');
reset role;

set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.propina), 1,
  'cooperativa: lee la propina de su lote');
reset role;

set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000005","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.propina), 1,
  'comprador: lee su propina');
reset role;

-- ================================================================== admin (lectura)
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000007","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.finca), 2,
  'admin: lee todas las fincas');
select is((select count(*)::int from public.lotes), 2,
  'admin: lee todos los lotes');
reset role;

-- ================================================================== anon
set local "request.jwt.claims" = '{"role":"anon"}';
set local role anon;
select throws_ok(
  'select count(*) from public.usuarios',
  '42501', null::text, 'anon: no tiene acceso directo a usuarios');
reset role;

-- ================================================================== escrituras válidas
-- Al final, para no contaminar los conteos de lectura anteriores.

set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select lives_ok($$
  insert into public.lotes (id, finca_id, codigo_publico, peso_actual_kg, fecha_cosecha)
  values ('00000000-0000-0000-0000-0000000000a1',
          '00000000-0000-0000-0000-000000000011', 'LOTE-P1', 10, '2026-02-01')
$$, 'productor: inserta lote en su finca');
select lives_ok($$
  insert into public.lote_eventos (id, lote_id, tipo, a_estado, actor_id)
  values ('00000000-0000-0000-0000-0000000000a3',
          '00000000-0000-0000-0000-000000000021', 'LIMPIEZA', 'CEREZA',
          '00000000-0000-0000-0000-000000000001')
$$, 'productor: inserta evento en su lote con actor propio');
reset role;

set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000005","role":"authenticated"}';
set local role authenticated;
select lives_ok($$
  insert into public.propina (id, lote_id, comprador_id, productor_id, monto, clave_idempotencia)
  values ('00000000-0000-0000-0000-0000000000b1',
          '00000000-0000-0000-0000-000000000021',
          '00000000-0000-0000-0000-000000000005',
          '00000000-0000-0000-0000-000000000001',
          10, 'propina-2')
$$, 'comprador: inserta su propia propina');
reset role;

set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000007","role":"authenticated"}';
set local role authenticated;
select lives_ok($$
  insert into public.lote_eventos (id, lote_id, tipo, a_estado, actor_id)
  values ('00000000-0000-0000-0000-0000000000b3',
          '00000000-0000-0000-0000-000000000022', 'LIMPIEZA', 'CEREZA',
          '00000000-0000-0000-0000-000000000001')
$$, 'admin: inserta evento con actor ajeno');
reset role;

select * from finish();

rollback;
