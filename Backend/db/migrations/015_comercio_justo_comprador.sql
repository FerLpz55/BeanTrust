-- =============================================================================
-- BeanTrust · Migración 015 · Comercio justo: lectura del lote por el comprador
--
-- El Panel Comercio Justo (`GET /v1/mercado/{lote_id}`) y la propina
-- (`POST /v1/propinas`) los usa el **comprador** de la venta. Los servicios
-- validan la tenencia, pero la RLS de `lotes`/`finca` no daba lectura al
-- comprador, así que en producción recibía 404 aunque el pago estuviera
-- `CONFIRMADO` (la capa de memoria de los tests no aplica RLS y no lo detectó).
--
-- Esta migración permite al comprador leer **solo** el lote que compró y su
-- finca. Para evitar la recursión de políticas (`lotes` → `pago` → `lotes`), la
-- comprobación vive en funciones `security definer` que leen `pago` sin RLS.
--
-- No se amplía la escritura: la propina se inserta en su tabla (el comprador ya
-- tiene `propina_insert`) y el lote no se modifica desde el comprador.
-- =============================================================================

begin;

create or replace function app_private.bean_comprador_de_lote(p_lote_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.pago p
    where p.lote_id = p_lote_id
      and p.comprador_id = (select auth.uid())
  );
$$;

revoke all on function app_private.bean_comprador_de_lote(uuid) from public, anon;
grant execute on function app_private.bean_comprador_de_lote(uuid) to authenticated;

create or replace function app_private.bean_comprador_de_finca(p_finca_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.pago p
    join public.lotes l on l.id = p.lote_id
    where l.finca_id = p_finca_id
      and p.comprador_id = (select auth.uid())
  );
$$;

revoke all on function app_private.bean_comprador_de_finca(uuid) from public, anon;
grant execute on function app_private.bean_comprador_de_finca(uuid) to authenticated;

drop policy if exists finca_select on public.finca;
create policy finca_select on public.finca
  for select to authenticated
  using (
    app_private.bean_rol() = 'admin'
    or productor_id = (select auth.uid())
    or cooperativa_id = (select auth.uid())
    or app_private.bean_comprador_de_finca(public.finca.id)
  );

drop policy if exists lotes_select on public.lotes;
create policy lotes_select on public.lotes
  for select to authenticated
  using (
    app_private.bean_rol() = 'admin'
    or exists (
      select 1 from public.finca f
      where f.id = public.lotes.finca_id
        and (f.productor_id = (select auth.uid()) or f.cooperativa_id = (select auth.uid()))
    )
    or app_private.bean_comprador_de_lote(public.lotes.id)
  );

commit;
