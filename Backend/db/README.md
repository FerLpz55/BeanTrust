# Base de datos (Supabase / PostgreSQL)

Esquema del backend de BeanTrust. Las migraciones se ejecutan en orden y son
idempotentes de proyecto (se aplican una vez por entorno).

## Estructura

```
db/
├── migrations/
│   ├── 001_esquema_inicial.sql   # tablas + enums + RLS habilitado
│   ├── 002_rls.sql               # políticas RLS por rol de negocio (§10)
│   └── 003_integridad.sql        # append-only de eventos + triggers
└── seed/
    └── seed.sql                  # usuarios/fincas de desarrollo
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

## Notas de implementación

- El endpoint público `GET /v1/verificar/{codigo}` usa service key (la
  verificación es por diseño sin autenticación, §8); la RLS queda como
  salvaguarda si se expone PostgREST directamente.
- Los usuarios se crean en Supabase Auth y se sincronizan a `usuarios` por
  webhook (B11). En el seed local (y en el store en memoria del backend) las
  contraseñas son de desarrollo: `Admin123!`, `Coop123!`, `Prod123!`, `Comp123!`.