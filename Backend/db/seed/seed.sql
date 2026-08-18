-- =============================================================================
-- BeanTrust · Seed (desarrollo local)
--
-- Usuarios de prueba (id fijos para que coincidan con el seed en memoria del
-- backend y con las políticas RLS). En producción los usuarios vienen de
-- Supabase Auth; la tabla `usuarios` se alimenta por webhook (B11).
-- =============================================================================

insert into usuarios (id, email, rol, nombre) values
  ('00000000-0000-0000-0000-000000000001', 'admin@beantrust.dev', 'admin', 'Administrador'),
  ('00000000-0000-0000-0000-000000000002', 'cooperativa@beantrust.dev', 'cooperativa', 'Café Veracruz'),
  ('00000000-0000-0000-0000-000000000003', 'productor@beantrust.dev', 'productor', 'Juan Pérez'),
  ('00000000-0000-0000-0000-000000000004', 'comprador@beantrust.dev', 'comprador', 'Comercializadora de Altura')
on conflict (id) do nothing;

insert into cooperativa (id, nombre, municipio) values
  ('00000000-0000-0000-0000-000000000010', 'Café Veracruz', 'Coatepec')
on conflict (id) do nothing;

insert into finca (id, productor_id, cooperativa_id, nombre, municipio, organica, altitud_min, altitud_max) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000010', 'Finca La Esperanza', 'Coatepec', true, 1100, 1400),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000010', 'Finca El Encanto', 'Xico', true, 1200, 1500)
on conflict (id) do nothing;