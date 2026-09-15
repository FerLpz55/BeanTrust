-- =============================================================================
-- BeanTrust · Migración 007 · Bucket privado de evidencias + purga programada
--
--   1. Crea el bucket privado `evidencias-lotes` (límite 5 MB, solo imágenes
--      JPEG/PNG/WebP). El backend lo opera con `service_role`; ningún usuario
--      tiene acceso directo (ver migración 006).
--   2. Programa el cron diario `purge-staged-evidence-daily`, que invoca la Edge
--      Function `purge-staged-evidence` para borrar los objetos PENDIENTE que
--      nunca se adjuntaron a un lote (huérfanos por subidas fallidas).
--
-- La URL de la función y el secreto interno se leen de Vault
-- (`purge_evidence_url`, `purge_evidence_secret`). Si no existen, el job queda
-- creado pero fallará en tiempo de ejecución; no rompe la migración. Ver
-- `Backend/db/README.md` para el alta de esos secretos.
-- =============================================================================

begin;

-- ------------------------------------------------------------------ bucket privado
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidencias-lotes',
  'evidencias-lotes',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ------------------------------------------------------------------ extensiones
-- Ambas son extensiones "trusted" en Supabase: se pueden crear sin superusuario.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- ------------------------------------------------------------------ cron diario
-- Limpieza técnica: no valida lotes, usuarios, roles, hashes ni pagos.
select cron.schedule(
  'purge-staged-evidence-daily',
  '0 3 * * *',
  $cron$
  select net.http_post(
    url := (
      select decrypted_secret from vault.decrypted_secrets
      where name = 'purge_evidence_url'
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'purge_evidence_secret'
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);

commit;
