-- =============================================================================
-- BeanTrust · Migración 016 · Endurecimiento de funciones (advisors)
--
--   1. `public.set_actualizado_en()`: fija `search_path = ''` (lint
--      `function_search_path_mutable`). El cuerpo solo usa `now()`
--      (pg_catalog), así que un search_path vacío es seguro.
--   2. `public.rls_auto_enable()`: revoca EXECUTE a `public`, `anon` y
--      `authenticated` (lints `anon/authenticated_security_definer_function_executable`).
--      Es una función `security definer` de Supabase que no debe quedar
--      expuesta por PostgREST; solo `service_role`/`postgres` la ejecutan.
--
-- Idempotente. No depende del estado de datos.
-- =============================================================================

begin;

alter function public.set_actualizado_en() set search_path = '';

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
grant execute on function public.rls_auto_enable() to service_role;

commit;
