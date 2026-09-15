# BeanTrust · Backend (API)

API de trazabilidad y comercio justo del café: gestión de lotes, Pasaporte de
Café con hash por etapa, sincronización offline, pagos con división 97/3 y
propinas directas al productor. FastAPI + Supabase (PostgreSQL). El front
(móvil Expo) consume este contrato (§6 de `docs/ARCHITECTURE.md`).

## Requisitos

- Python ≥ 3.12 (desarrollado con 3.14)
- `.env` a partir de `.env.example` (o variables de entorno `BEAN_*`)

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

## Ejecutar

```bash
uvicorn app.main:app --reload
```

- API: http://127.0.0.1:8000
- Docs (OpenAPI/Swagger): http://127.0.0.1:8000/docs
- Health: http://127.0.0.1:8000/health

Con `BEAN_REPO_BACKEND=memory` y `BEAN_AUTH_BACKEND=local` (valores por defecto)
todo corre en memoria para desarrollo y CI; con `supabase` se conecta al
proyecto real (B11). En `production` la config **obliga** a Supabase (ver
`app/core/config.py`).

## Pruebas y lint

```bash
ruff check app tests
pytest
```

## Credenciales de desarrollo (solo local)

| Rol         | email                  | password   |
| ----------- | ---------------------- | ---------- |
| admin       | admin@beantrust.dev    | Admin123!  |
| cooperativa | cooperativa@beantrust.dev | Coop123! |
| productor   | productor@beantrust.dev  | Prod123!  |
| comprador   | comprador@beantrust.dev  | Comp123!  |

## Despliegue (Vercel + Supabase)

Producción: **https://beantrust-api.vercel.app** (proyecto Vercel
`beantrust-api`, Root Directory `Backend`, framework FastAPI autodetectado) sobre
el proyecto Supabase `yvczofwzfljuubxnmakj`.

```sh
cd Backend && vercel deploy --prod
```

Notas que no son obvias:

- `requirements.txt` es obligatorio: el builder de Python de Vercel **no** lee
  `[project].dependencies` de `pyproject.toml`. Hay que mantener los dos en sync.
- `.vercelignore` deja fuera `.venv/`, `tests/` y `db/`.
- Las variables `BEAN_*` viven en el proyecto de Vercel (`vercel env ls`), no en
  un `.env`. En `production` la config **exige** Supabase para auth y datos, y
  además `BEAN_SUPABASE_ANON_KEY` y `BEAN_RATE_LIMIT_HMAC_SECRET` (ver abajo).
- `BEAN_CORS_ORIGINS` admite lista separada por comas (`a,b`) o JSON.
- Las mismas cuatro credenciales de la tabla de arriba son las únicas válidas en
  producción: el alta pública está cerrada en Supabase, así que
  `POST /v1/auth/register` responde 401.
- **Secretos de Vault** (no son variables de entorno): la migración 007 programa
  el cron `purge-staged-evidence-daily`, que lee de Vault `purge_evidence_url`
  (URL de la Edge Function `purge-staged-evidence`) y `purge_evidence_secret`
  (secreto interno). Si faltan, el job se crea pero falla en ejecución. Alta y
  operación en `db/README.md`.

## Variables de entorno

Todas llevan prefijo `BEAN_` (ver `.env.example`). Las nuevas del hardening:

| Variable | Default | Para qué |
| -------- | ------- | -------- |
| `BEAN_SUPABASE_ANON_KEY` | — | Cliente Supabase **por request** que adjunta el JWT del usuario (RLS efectiva). **Obligatoria en `production`.** |
| `BEAN_EVIDENCE_BUCKET` | `evidencias-lotes` | Bucket privado de evidencias. |
| `BEAN_EVIDENCE_MAX_BYTES` | `5242880` | Tamaño máximo por foto (5 MB). |
| `BEAN_EVIDENCE_TTL_HOURS` | `24` | TTL de objetos `PENDIENTE` sin adjuntar. |
| `BEAN_RATE_LIMIT_HMAC_SECRET` | — | Secreto HMAC-SHA256 de la clave `ip|ruta` del rate limit (no guarda la IP en claro). **Obligatorio en `production`.** |
| `BEAN_RATE_LIMIT_WINDOW_SECONDS` | `60` | Ventana del rate limit. |

## Seguridad: RLS, rate limit y refresh

- **RLS efectiva por usuario.** Los endpoints autenticados usan un cliente
  Supabase con `anon key` + `Authorization: Bearer <jwt>` (`get_supabase_user_client`),
  así Postgres evalúa las políticas (`app_private.bean_rol()`). `service_role`
  queda para auth interna, verificación pública y Storage de evidencias.
- **Rate limit compartido.** `limitar_login` aplica en `/login`, `/register`,
  `/refresh`, `/recover` y `/recover/confirm`; en Supabase el contador vive en
  Postgres (`app_private.rate_limit_bucket` vía RPC `bean_consume_rate_limit`),
  de modo que es consistente entre réplicas. En dev/CI es en memoria.
- **Refresh rotativo (proveedor local).** Cada refresh lleva `jti` + `family`;
  reusar un `jti` consumido revoca la familia y `restablecer_password` revoca las
  sesiones del usuario. En producción Supabase Auth es el que rota.
- **Storage.** Las fotos viven en el bucket **privado** `evidencias-lotes`; el
  backend sube/firma/borra con `service_role` y la tabla `public.evidencias` no
  tiene grants para `anon`/`authenticated`. El móvil nunca habla con Storage.

## Endpoints (`/v1`)

La superficie exacta de la API está blindada por `tests/integration/test_contrato_api.py`:
si una ruta de esta tabla no existe en el código (o existe una ruta no documentada),
el test falla. Mantén la tabla, `docs/ARCHITECTURE.md` §6 y el test sincronizados en
el mismo cambio.

| Método | Ruta                          | Acceso                       | Descripción                              |
| ------ | ----------------------------- | ---------------------------- | ---------------------------------------- |
| POST   | `/auth/login`                 | público                      | Emite token JWT                          |
| POST   | `/auth/register`              | público                      | Registra usuario                         |
| POST   | `/auth/refresh`               | público                      | Renueva access token con refresh token   |
| POST   | `/auth/recover`               | público                      | Solicita recuperación (respuesta uniforme) |
| POST   | `/auth/recover/confirm`       | público                      | Fija nueva contraseña con token de un solo uso |
| GET    | `/auth/me`                    | autenticado                  | Perfil del usuario autenticado           |
| GET    | `/cooperativas`               | admin                        | Directorio de cooperativas               |
| GET    | `/compradores`                | cooperativa/admin            | Directorio de compradores (elegir `comprador_id` al vender) |
| GET    | `/fincas`                     | productor/cooperativa/admin  | Fincas del usuario (resuelve `finca_id` para crear lotes) |
| POST   | `/evidencias`                 | productor/cooperativa/admin  | Sube foto privada al bucket (multipart, 201, idempotente por `Idempotency-Key`) |
| POST   | `/lotes`                      | productor/cooperativa/admin  | Registra cosecha (crea lote: variedad, método, peso, `evidencia_id`) |
| GET    | `/lotes`                      | productor/cooperativa/admin  | Lista paginada por cursor                |
| GET    | `/lotes/{lote_id}`            | productor/cooperativa/admin  | Detalle con historial (timeline hash por etapa) |
| GET    | `/lotes/{lote_id}/evidencia`  | productor/cooperativa/admin  | URL firmada temporal de la evidencia adjunta (404 si no hay) |
| POST   | `/lotes/{lote_id}/eventos`    | productor/cooperativa/admin  | Avanza estado/sub-etapa (idempotente, 11 tipos) |
| GET    | `/verificar/{codigo}`         | público                      | Pasaporte de Café (200/404/409)          |
| GET    | `/mercado/{lote_id}`          | dueños del lote + admin      | Panel Comercio Justo: desglose 97/3 + propinas (ADR-9) |
| POST   | `/pagos`                      | cooperativa                  | Venta + pago on-chain 3%/97% (202, idempotente) |
| GET    | `/pagos`                      | cooperativa                  | Historial de pagos de la cooperativa (paginado por cursor) |
| GET    | `/pagos/saldo`                | productor/admin              | Saldo del productor (97% ventas confirmadas + propinas) |
| POST   | `/propinas`                   | comprador                    | Propina al productor (201, idempotente, bivalente) |
| GET    | `/propinas/lote/{lote_id}`    | dueños del lote: productor/cooperativa/comprador de la venta/admin | Lista propinas del lote (tenancy) |
| POST   | `/sync`                       | productor/cooperativa/admin  | Batch offline (202/207)                  |
| GET    | `/health`                     | público                      | Health check                             |

## Estructura

```
app/
├── main.py            # crear_app + handler de errores de dominio
├── dependencies.py    # DI: repos, auth, servicios (Annotated + Depends)
├── api/v1/endpoints/  # routers (lotes, eventos, verificacion, pagos, sync, auth, cooperativas)
├── core/              # config, logger, seguridad (JWT HS256/JWKS, argon2)
├── models/dominio.py  # reglas de negocio (máquina de estados) — sin I/O
├── schemas/           # Pydantic de entrada/salida (fronteras)
├── services/          # casos de uso (lote, qr, pagos, propinas)
├── repositories/      # interfaces + in_memory + supabase + gateway pagos
└── utils/cursor.py    # paginación por cursor base64url
db/                    # migraciones SQL + seed (Supabase/PostgreSQL)
```

## Decisiones de arquitectura

Resumen rápido; el detalle está en `docs/ARCHITECTURE.md`:

- El dominio NO conoce FastAPI/Supabase/web3 (inversión de dependencias).
- `lote_eventos` es append-only: eventos inmutables, deduplicados por el
  `Idempotency-Key` (que es su PK) y anclados por el hash por etapa (cadena lineal).
- Los pagos se disparan on-chain (Polygon) con retención 3%/97%; la
  implementación web3 real está documentada en `docs/06-contratos.md` y en
  pausa (gateway fake en desarrollo). Las propinas son bivalentes off-chain/on-chain.
- RLS por rol de negocio resuelto desde `usuarios` (no del claim JWT).
- Hash por etapa: cada evento lleva `hash_etapa`; la raíz vive en `qr_certificado.hash_sha256`.
- Pasaporte de Café: verificación pública con datos enriquecidos (variedad, método, humedad, SCA) + timeline con hash por etapa.