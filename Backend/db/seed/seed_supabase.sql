-- =============================================================================
-- BeanTrust · Seed para un proyecto Supabase real
--
-- A diferencia de `seed.sql` (ids fijos, para el store en memoria), aquí los
-- usuarios ya existen: los crea Supabase Auth y la migración 005 los espeja en
-- `usuarios` con el uuid que asignó Auth. Por eso todo se resuelve por email en
-- vez de hardcodear uuids.
--
-- Detalle que importa: el código trata `finca.cooperativa_id` como el **id de
-- usuario** de la cooperativa (`lote_service.py:45`, `pagos_service.py:41`),
-- mientras que el FK apunta a `cooperativa(id)`. Para que ambas cosas sean
-- ciertas a la vez, la fila de `cooperativa` reusa el id del usuario cooperativa.
-- =============================================================================

begin;

-- El trigger 005 nunca concede `admin` desde metadata; se asigna aquí.
update usuarios set rol = 'admin' where email = 'admin@beantrust.dev';

insert into cooperativa (id, nombre, municipio)
select id, 'Café Veracruz', 'Coatepec'
from usuarios where email = 'cooperativa@beantrust.dev'
on conflict (id) do nothing;

insert into finca (id, productor_id, cooperativa_id, nombre, municipio, organica, altitud_min, altitud_max)
select
  '11111111-1111-1111-1111-111111111111',
  (select id from usuarios where email = 'productor@beantrust.dev'),
  (select id from usuarios where email = 'cooperativa@beantrust.dev'),
  'Finca La Esperanza', 'Coatepec', true, 1100, 1400
on conflict (id) do nothing;

insert into finca (id, productor_id, cooperativa_id, nombre, municipio, organica, altitud_min, altitud_max)
select
  '22222222-2222-2222-2222-222222222222',
  (select id from usuarios where email = 'productor@beantrust.dev'),
  (select id from usuarios where email = 'cooperativa@beantrust.dev'),
  'Finca El Encanto', 'Xico', true, 1200, 1500
on conflict (id) do nothing;

commit;
