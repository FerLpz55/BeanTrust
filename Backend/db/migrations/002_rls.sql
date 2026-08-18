-- =============================================================================
-- BeanTrust · Migración 002 · Políticas RLS (§10)
--
-- Defensa en profundidad: aunque la API use service key en producción (B11),
-- las políticas garantizan aislamiento por finca incluso si se filtra una key
-- de menor privilegio. Cada usuario ve/escribe solo lo suyo:
--   * productor  -> sus fincas y sus lotes
--   * cooperativa-> sus fincas (y las de sus productores) y sus lotes
--   * comprador  -> solo lectura pública vía /verificar (sin auth)
--   * admin      -> todo
-- =============================================================================

begin;

-- helper: rol de negocio del usuario autenticado
create or replace function bean_rol() returns rol_usuario
language sql stable security definer set search_path = public as $$
  select rol from usuarios where id = auth.uid();
$$;

-- ---------------------------------------------------------------- usuarios
create policy usuarios_own_read on usuarios
  for select using (auth.uid() = id or bean_rol() = 'admin');

-- ---------------------------------------------------------------- cooperativa
create policy cooperativa_admin_read on cooperativa
  for select using (bean_rol() = 'admin');

-- ---------------------------------------------------------------- finca
create policy finca_select on finca
  for select using (
    bean_rol() = 'admin'
    or productor_id = auth.uid()
    or cooperativa_id = auth.uid()
  );

create policy finca_insert on finca
  for insert with check (
    bean_rol() = 'admin'
    or (bean_rol() = 'productor' and productor_id = auth.uid())
    or (bean_rol() = 'cooperativa' and cooperativa_id = auth.uid())
  );

create policy finca_update on finca
  for update using (bean_rol() = 'admin')
  with check (bean_rol() = 'admin');

-- ---------------------------------------------------------------- lotes
create policy lotes_select on lotes
  for select using (
    bean_rol() = 'admin'
    or exists (
      select 1 from finca f
      where f.id = finca_id
        and (f.productor_id = auth.uid() or f.cooperativa_id = auth.uid())
    )
  );

create policy lotes_insert on lotes
  for insert with check (
    bean_rol() = 'admin'
    or exists (
      select 1 from finca f
      where f.id = finca_id
        and (f.productor_id = auth.uid() or f.cooperativa_id = auth.uid())
    )
  );

create policy lotes_update on lotes
  for update using (
    bean_rol() = 'admin'
    or exists (
      select 1 from finca f
      where f.id = finca_id
        and (f.productor_id = auth.uid() or f.cooperativa_id = auth.uid())
    )
  )
  with check (
    bean_rol() = 'admin'
    or exists (
      select 1 from finca f
      where f.id = finca_id
        and (f.productor_id = auth.uid() or f.cooperativa_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------- lote_eventos
-- append-only: solo insert/select. El trigger (003) bloquea update/delete.
create policy lote_eventos_select on lote_eventos
  for select using (
    exists (
      select 1 from lotes l join finca f on f.id = l.finca_id
      where l.id = lote_id
        and (f.productor_id = auth.uid() or f.cooperativa_id = auth.uid())
    )
    or bean_rol() = 'admin'
  );

create policy lote_eventos_insert on lote_eventos
  for insert with check (
    exists (
      select 1 from lotes l join finca f on f.id = l.finca_id
      where l.id = lote_id
        and (f.productor_id = auth.uid() or f.cooperativa_id = auth.uid())
    )
    or bean_rol() = 'admin'
  );

-- ---------------------------------------------------------------- qr_certificado
-- La verificación pública usa service key (sin RLS en el endpoint /verificar).
create policy qr_select on qr_certificado
  for select using (
    bean_rol() = 'admin'
    or exists (
      select 1 from lotes l join finca f on f.id = l.finca_id
      where l.id = lote_id
        and (f.productor_id = auth.uid() or f.cooperativa_id = auth.uid())
    )
  );

create policy qr_insert on qr_certificado
  for insert with check (
    bean_rol() = 'admin'
    or exists (
      select 1 from lotes l join finca f on f.id = l.finca_id
      where l.id = lote_id
        and (f.productor_id = auth.uid() or f.cooperativa_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------- pago
create policy pago_select on pago
  for select using (
    bean_rol() = 'admin'
    or cooperativa_id = auth.uid()
    or exists (
      select 1 from lotes l join finca f on f.id = l.finca_id
      where l.id = lote_id and f.productor_id = auth.uid()
    )
  );

create policy pago_insert on pago
  for insert with check (
    bean_rol() = 'admin'
    or cooperativa_id = auth.uid()
  );

-- ---------------------------------------------------------------- verificacion
create policy verificacion_select on verificacion
  for select using (
    exists (
      select 1 from lotes l join finca f on f.id = l.finca_id
      where l.id = lote_id
        and (f.productor_id = auth.uid() or f.cooperativa_id = auth.uid())
    )
    or bean_rol() = 'admin'
  );

create policy verificacion_insert on verificacion
  for insert with check (
    exists (
      select 1 from lotes l join finca f on f.id = l.finca_id
      where l.id = lote_id
        and (f.productor_id = auth.uid() or f.cooperativa_id = auth.uid())
    )
    or bean_rol() = 'admin'
  );

commit;