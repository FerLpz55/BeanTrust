-- =============================================================================
-- BeanTrust · Pruebas RLS del comercio justo (migración 015)
--
-- El comprador debe poder leer SOLO el lote que compró y su finca (para el panel
-- de comercio justo y la propina), y nada ajeno.
-- =============================================================================

begin;

select plan(4);

insert into public.usuarios (id, email, rol, nombre) values
  ('00000000-0000-0000-0000-0000000000a1', 'prod@test.dev', 'productor',   'Productor'),
  ('00000000-0000-0000-0000-0000000000a2', 'coop@test.dev', 'cooperativa', 'Coop'),
  ('00000000-0000-0000-0000-0000000000a3', 'compra@test.dev', 'comprador', 'Comprador'),
  ('00000000-0000-0000-0000-0000000000a4', 'otro@test.dev', 'comprador',   'Otro');

insert into public.cooperativa (id, nombre, municipio) values
  ('00000000-0000-0000-0000-0000000000a2', 'Coop', 'Coatepec');

insert into public.finca (id, productor_id, cooperativa_id, nombre, municipio) values
  ('00000000-0000-0000-0000-0000000000a5',
   '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000a2',
   'Finca', 'Coatepec');

insert into public.lotes (id, finca_id, codigo_publico, peso_actual_kg, fecha_cosecha) values
  ('00000000-0000-0000-0000-0000000000a6',
   '00000000-0000-0000-0000-0000000000a5', 'LOTE-CJ', 100, '2026-01-01');

insert into public.pago (
  id, lote_id, cooperativa_id, comprador_id,
  monto_total, comision_pct, monto_productor, idempotency_key
) values (
  '00000000-0000-0000-0000-0000000000a7',
  '00000000-0000-0000-0000-0000000000a6',
  '00000000-0000-0000-0000-0000000000a2',
  '00000000-0000-0000-0000-0000000000a3',
  100, 3, 97, '00000000-0000-0000-0000-0000000000a7'
);

-- Comprador de la venta: sí lee su lote y su finca.
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
set local role authenticated;

select is(
  (select count(*)::int from public.lotes where id = '00000000-0000-0000-0000-0000000000a6'),
  1, 'comprador: lee el lote que compró');
select is(
  (select count(*)::int from public.finca where id = '00000000-0000-0000-0000-0000000000a5'),
  1, 'comprador: lee la finca de su lote');

reset role;

-- Otro comprador: no lee nada de esa venta.
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}';
set local role authenticated;

select is(
  (select count(*)::int from public.lotes where id = '00000000-0000-0000-0000-0000000000a6'),
  0, 'comprador ajeno: no lee el lote');
select is(
  (select count(*)::int from public.finca where id = '00000000-0000-0000-0000-0000000000a5'),
  0, 'comprador ajeno: no lee la finca');

reset role;

select * from finish();

rollback;
