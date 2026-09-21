# Base de datos (Supabase / PostgreSQL)

Esquema del backend de BeanTrust. Las migraciones se ejecutan en orden y son
idempotentes de proyecto (se aplican una vez por entorno).

## Estructura

```
db/
├── migrations/
│   ├── 001_esquema_inicial.sql   # tablas + enums + RLS habilitado
│   ├── 002_rls.sql               # políticas RLS por rol de negocio (§10)
│   ├── 003_integridad.sql        # append-only de eventos + triggers
│   ├── 004_cadena_completa_propina.sql  # sub-etapas + propinas
│   ├── 005_sync_auth_usuarios.sql       # espejo auth.users -> usuarios
│   ├── 006_hardening_storage_rls_rate_limit.sql  # app_private.bean_rol + RLS efectiva + evidencias + rate limit
│   ├── 007_evidencias_storage_cron.sql           # bucket privado + cron de purga
│   ├── 008_integridad_evidencias.sql             # double precision + bitácora + RPC atómica de cosecha
│   ├── 009_fix_rpc_replay.sql                    # idempotencia de la RPC por datos estables
│   ├── 010_integridad_rpc_reparacion.sql         # timestamp canónico del evento + RPC privada/wrapper
│   ├── 011_blockchain_anchors.sql                # cola de anclaje + trigger de encolado + backfill
│   ├── 012_blockchain_anchor_hardening.sql       # unicidad QR/lote, ENVIANDO, nonce, lease
│   ├── 013_blockchain_worker_fencing.sql         # fencing del worker + formato tx_hash
│   ├── 014_registro_productor_y_finca.sql        # alta pública siempre productor + alta de finca con cooperativa del piloto
│   ├── 015_comercio_justo_comprador.sql          # el comprador lee solo el lote que compró y su finca (panel/propina)
│   └── 016_endurecer_funciones_advisors.sql      # search_path de set_actualizado_en + revoca EXECUTE de rls_auto_enable
└── seed/
    ├── seed.sql                  # usuarios/fincas de desarrollo (ids fijos)
    └── seed_supabase.sql         # seed de un proyecto Supabase real
```

El CLI de Supabase lee estas migraciones por el symlink `supabase/migrations -> ../Backend/db/migrations`. Las pruebas pgTAP viven en `supabase/tests/` (RLS, Storage, rate limit, integridad).

### Integridad de la cadena (008–010)

- Los campos físicos que entran al hash por etapa (`peso_kg`, `merma_pct`,
  `humedad_*`, `densidad`, …) son `double precision`, no `real`: así el float64
  que serializa FastAPI coincide de forma estable con lo que devuelve Postgres y
  la cadena es reproducible.
- `app_private.reparacion_cadena_evento` es la bitácora permanente de la
  reparación histórica (hash/raíz anterior y nueva, motivo, versión, operador,
  checksum). Sin grants de usuario.
- `public.registrar_cosecha_con_evidencia(...)` es un wrapper `security invoker`
  (solo `authenticated`) que delega en
  `app_private.registrar_cosecha_con_evidencia(...)` (`security definer`,
  `search_path = ''`). Crea lote + evento génesis + evidencia `ADJUNTA` en una
  transacción. La 009 corrige su idempotencia: compara datos estables, no el
  hash. La 010 añade `p_registrado_en` y lo persiste tal cual, para que el
  `registrado_en` almacenado sea exactamente el que entró al `hash_etapa`
  (sin depender del `default now()`); también endurece los triggers de 003 para
  que funcionen con `search_path = ''`.
- La reparación se audita y se genera con
  `python -m scripts.auditar_integridad_historica` (solo lectura por defecto;
  `--generar-reparacion plan.sql` escribe el SQL transaccional con backup lógico,
  locks y bitácora, pero **no lo ejecuta**).

## Convenciones

- Nombres en `snake_case`; `id uuid primary key` en cada tabla (compatibilidad
  móvil offline, §7.5).
- Timestamps `timestamptz` en UTC (nunca naive).
- FK `on delete restrict`: la trazabilidad es inmutable, nada se borra.
- `lote_eventos` es **append-only** (§6): solo `insert`/`select`, bloqueado por
  trigger (003) y por las interfaces del repositorio.
- `lote_eventos.id` = `Idempotency-Key` del cliente → deduplicación natural.
- `pago.idempotency_key` es `unique` (desviación documentada del ERD, §9).
- El disparo de `VENTA` exige un `pago` registrado (PENDIENTE).

## RLS efectiva (§10)

Desde la migración **006**, la RLS se evalúa de verdad: los endpoints
autenticados del backend adjuntan el JWT del usuario (cliente `anon` + Bearer) y
Postgres aplica las políticas. La migración recrea todas las políticas sobre
`app_private.bean_rol()` (security definer, `search_path` fijo) —ya no existe el
helper `public.bean_rol()`—, revoca los grants directos de `anon`/`authenticated`
y concede solo lo necesario; `service_role` (FastAPI) administra el backend.

Cada usuario ve/escribe solo lo suyo:

| Rol        | Fincas                      | Lotes                       | Pagos                  |
| ---------- | --------------------------- | --------------------------- | ---------------------- |
| productor  | propias (lectura + alta inicial) | de sus fincas          | de sus lotes (lectura) |
| cooperativa| propias + de productores    | de sus fincas               | propias (escritura)    |
| comprador  | de fincas de lotes comprados (lectura) | de lotes comprados (lectura) | propios (lectura)      |
| admin      | todas                       | todos                       | todos                  |

`public.evidencias` y `storage.objects` **no tienen acceso de usuarios**: la
tabla de evidencias no recibe grants y `storage.objects` queda con RLS habilitado
y sin políticas para `anon`/`authenticated`, así que toda lectura devuelve 0
filas y toda escritura falla. Solo el backend (`service_role`) sube, firma lectura
y borra objetos.

La migración **014** endurece el alta: toda alta en `auth.users` crea un
`productor` (ignora el rol de la metadata), `finca_insert` exige el productor
autenticado y la cooperativa del piloto (`app_private.bean_cooperativa_piloto()`),
y un trigger `before update` impide cambiar `productor_id`/`cooperativa_id` de una
finca existente (salvo admin).

La migración **015** da al **comprador** lectura de solo el lote que compró y su
finca (panel de comercio justo y propina), que en producción fallaba con 404 por
la RLS. Usa `app_private.bean_comprador_de_lote`/`bean_comprador_de_finca`
(`security definer`, `search_path` fijo) para evitar la recursión de políticas
`lotes` ↔ `pago`. No amplía escritura: la propina se inserta en `propina`.

La migración **016** cierra los advisors de funciones: fija `search_path = ''`
en `public.set_actualizado_en()` (solo usa `now()`, de `pg_catalog`) y revoca
`EXECUTE` de `public.rls_auto_enable()` para `public`/`anon`/`authenticated`,
dejándola solo para `service_role`/`postgres`. Quedan pendientes los advisors de
Auth (`auth_leaked_password_protection`, `auth_insufficient_mfa_options`), que
se activan desde la configuración de Supabase y no con SQL.

## Evidencias: bucket privado, cron y secretos de Vault

- La migración **007** crea el bucket privado `evidencias-lotes` (5 MB, JPEG/PNG/WebP)
  y programa el cron diario `purge-staged-evidence-daily` (03:00 UTC) que invoca la
  Edge Function `purge-staged-evidence` (`supabase/functions/`) para borrar objetos
  `PENDIENTE` huérfanos (fotos que nunca se adjuntaron a un lote).
- La URL de la función y el secreto interno se leen de **Vault** en cada
  ejecución del cron (`purge_evidence_url`, `purge_evidence_secret`). Si no
  existen, el job se crea pero falla en ejecución; no rompe la migración. Para
  darlos de alta:

  ```sql
  select vault.create_secret('https://<ref>.supabase.co/functions/v1/purge-staged-evidence', 'purge_evidence_url');
  select vault.create_secret('<secreto-largo-aleatorio>', 'purge_evidence_secret');
  ```

  El secreto debe coincidir con el de la Edge Function
  (`supabase secrets set PURGE_EVIDENCE_SECRET=...`). **La consulta a Vault
  ocurre al ejecutar el cron**, así que rotar el secreto NO requiere reaplicar
  la migración 007; se actualiza en su lugar:

  ```sql
  select vault.update_secret(id, '<secreto-nuevo>')
    from vault.secrets where name = 'purge_evidence_secret';
  ```

  No crees un segundo secreto con el mismo nombre: la consulta del cron espera
  una sola fila.

## Cómo aplicar

En un proyecto Supabase, ejecutar los archivos de `migrations/` en orden desde
el SQL editor o con `psql`/`supabase db push`. Aplicar `seed/seed.sql` solo en
desarrollo.

Sin la contraseña de la base (que `db push` pide) sirve la Management API, con
la sesión que el CLI ya tiene. **La ruta debe ser absoluta**: `-f` la resuelve
contra `$HOME`, no contra el directorio actual.

```sh
supabase db query --linked --project-ref <ref> -f "$PWD/db/migrations/001_esquema_inicial.sql"
```

Para un proyecto real, después de las migraciones: crear los usuarios en
Supabase Auth (Admin API, con `email_confirm` y `user_metadata.rol`) y aplicar
`seed/seed_supabase.sql`, que resuelve los uuid por email en vez de fijarlos.

## Verificación local (lo que corre el CI)

El job `supabase` de `.github/workflows/ci.yml` arranca un Supabase local,
aplica las migraciones desde cero, corre pgTAP y falla ante cualquier *advisor*
de tipo error:

```sh
supabase start          # levanta el stack local
supabase db reset       # aplica 001–016 + seed desde cero
supabase test db        # pgTAP: RLS, Storage y rate limit (supabase/tests/)
supabase db advisors --local --fail-on error
```

Las pruebas pgTAP (`supabase/tests/rls_roles.test.sql`,
`storage_evidencias.test.sql`, `rate_limit.test.sql`) cubren la matriz RLS, el
acceso denegado a `storage.objects`/`evidencias` y la función
`bean_consume_rate_limit`.

## Notas de implementación

- El endpoint público `GET /v1/verificar/{codigo}` usa service key (la
  verificación es por diseño sin autenticación, §8); la RLS queda como
  salvaguarda si se expone PostgREST directamente.
- Los usuarios se crean en Supabase Auth y se sincronizan a `usuarios` con el
  **trigger de la migración 005** (no por webhook: no hacía falta un servicio
  externo). El trigger degrada a `productor` cualquier rol ausente o desconocido
  y nunca concede `admin` desde la metadata del cliente.
- En el seed local (y en el store en memoria del backend) las contraseñas son de
  desarrollo: `Admin123!`, `Coop123!`, `Prod123!`, `Comp123!`.
- **`finca.cooperativa_id` guarda el id del *usuario* cooperativa**, no una fila
  cualquiera de `cooperativa`: el código lo compara contra `usuario.id`
  (`lote_service.py`, `pagos_service.py`) mientras el FK apunta a `cooperativa`.
  Por eso el seed inserta la cooperativa reusando el id de su usuario.
- **`verificacion.id` no tiene default**: lo genera el cliente, como el resto de
  tablas (§7.5).