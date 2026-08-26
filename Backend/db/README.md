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
│   └── 005_sync_auth_usuarios.sql       # espejo auth.users -> usuarios
└── seed/
    ├── seed.sql                  # usuarios/fincas de desarrollo (ids fijos)
    └── seed_supabase.sql         # seed de un proyecto Supabase real
```

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

## RLS (defensa en profundidad, §10)

Cada usuario ve/escribe solo lo suyo:

| Rol        | Fincas                      | Lotes                       | Pagos                  |
| ---------- | --------------------------- | --------------------------- | ---------------------- |
| productor  | propias                     | de sus fincas               | de sus lotes (lectura) |
| cooperativa| propias + de productores    | de sus fincas               | propias (escritura)    |
| comprador  | — (verificación pública)   | — (verificación pública)    | —                      |
| admin      | todas                       | todos                       | todos                  |

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