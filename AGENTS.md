# BeanTrust · Memoria persistente para agentes

Este archivo es la memoria de contexto para agentes que trabajan en BeanTrust.
Antes de tocar código, lee `docs/ARCHITECTURE.md` (fuente de verdad del diseño) y
la tabla de endpoints de `Backend/README.md` (fuente de verdad de la superficie API).

## Qué es BeanTrust

Ecosistema de trazabilidad y comercio justo del café, B2B2C: identidad digital del
grano (lotes → eventos inmutables con hash por etapa), Pasaporte de Café verificable
por QR (consumidor final, sin cuenta) y comercio justo (pago 97/3 + propinas 100%
directas del comprador al productor).

## Monorepo

- `Backend/` — FastAPI (Python ≥3.12), capas: endpoints → services → repositories (interfaz + in_memory + supabase). BD Supabase/PostgreSQL, migraciones en `Backend/db/`.
- `mobile/` — React Native / Expo Router (pnpm). Tokens de diseño "Copa de cata" en `src/theme/tokens.ts`.
- `docs/` — `ARCHITECTURE.md` (diseño), `06-contratos.md` (web3).
- `contracts/` — Foundry: `CoffeeTraceability.sol` desplegado en Base Sepolia.

No existe `db/` en la raíz.

## Regla de oro: docs ↔ código nunca divergen

1. Todo router/endpoint del backend se monta en `Backend/app/api/v1/router.py`
   (o se justifica su ausencia). Un router definido pero **no montado** es un bug
   de contrato (fue el caso de `router_propinas`).
2. La superficie de la API está **blindada** por `Backend/tests/integration/test_contrato_api.py`,
   que compara el OpenAPI real contra la lista documentada. Si tocas routers, mantén
   sincronizados en el mismo cambio: (a) `test_contrato_api.py`, (b) la tabla de
   `Backend/README.md`, (c) `docs/ARCHITECTURE.md` §6. Si el test falla, hay divergencia.
3. Cualquier cambio de acceso/rol actualiza también `docs/ARCHITECTURE.md` §10
   (matriz RLS) y `Backend/README.md`.
4. Al terminar cualquier tarea corre la verificación completa (abajo). Si rompes
   algo, arréglalo en el mismo cambio.

## Verificación (obligatoria al terminar)

```bash
# Backend (convención del repo: ruff check + pytest; NO correr `ruff format --check`
# global — hay archivos preexistentes sin formatear y el target py314 reformatea a
# sintaxis `except A, B` que rompería Python 3.12. Formatea solo los archivos que toques)
cd Backend && .venv/bin/ruff check app tests
cd Backend && .venv/bin/pytest

# Mobile
cd mobile && pnpm exec tsc --noEmit && pnpm exec expo lint
```

- Credenciales dev (backend local, almacén en memoria): `admin@beantrust.dev/Admin123!`,
  `cooperativa@beantrust.dev/Coop123!`, `productor@beantrust.dev/Prod123!`,
  `comprador@beantrust.dev/Comp123!`.
- Stack: FastAPI `crear_app()` (testeable), JWT HS256 + argon2 (LocalAuthProvider) o
  Supabase (B11), idempotencia vía header `Idempotency-Key` (solo POST), RLS Supabase
  **efectiva por usuario** (cliente por request con el JWT; `service_role` solo para
  auth interna, verificación pública y Storage), gateway de pagos fake.

## Estado real (MVP) — no asumir más

- Backend: propinas montadas y probadas (tenancy en `PropinaService.listar_propinas_lote`).
  **B13 cerrado**: `GET /v1/pagos` (historial de la cooperativa, cursor) y `GET /v1/pagos/saldo`
  (productor/admin) son reales; `repo_pago` ya se inyecta en `PropinaService` y la agregación
  vive en los repos. La confirmación del pago/propina corre en `BackgroundTasks` (poller
  simulado, web3 en pausa B7). **B15 cerrado**: `GET /v1/fincas` resuelve el `finca_id`. **B14 cerrado**: recover/confirm con
  token de un solo uso. **B16 cerrado**: `GET /v1/mercado/{lote_id}` (Panel Comercio Justo, ADR-9).
  **Hardening B11**: clientes Supabase **por request** (RLS efectiva con el JWT del usuario;
  `service_role` solo para auth interna/verificación pública/Storage), **rate limit compartido**
  (`bean_consume_rate_limit`, HMAC de `ip|ruta` en login/register/refresh/recover) y **refresh
  rotativo** local (`jti`+`family`; reuso revoca la familia). **Evidencia privada (ADR-14)**
  real: `POST /v1/evidencias` + `GET /v1/lotes/{lote_id}/evidencia` (bucket privado, migraciones
  006/007, Edge Function de purga). **Integridad (008–010)**: los campos hasheados son
  `double precision` (hash reproducible), el alta con foto es atómica vía RPC
  `registrar_cosecha_con_evidencia` (wrapper `public` + función `app_private` con
  `search_path = ''`), el evento persiste el mismo `registrado_en` que entró al hash
  (`p_registrado_en`), y la reparación histórica queda auditada en
  `app_private.reparacion_cadena_evento` (`scripts/auditar_integridad_historica.py`,
  solo lectura por defecto).
- Mobile: **todos los flujos consumen el backend real** (no quedan stores mock).
  `src/api/` cubre auth, fincas, lotes, verificar, pagos, propinas, mercado y evidencias;
  `client.ts` renueva el token ante un 401 y manda `Idempotency-Key`. El adaptador
  contrato→UI vive en `src/domain/lote.ts`. Escaner QR real con `expo-camera`.
  Tests con vitest en `src/api/client.test.ts` (`pnpm test`). **F11 cerrado**: la
  UI de registro de eventos vive en `src/components/registrar-evento-modal.tsx`
  y se usa desde `app/(app)/lotes/[id].tsx`. **Modo campo offline-first (§7.5)
  cerrado**: `src/offline/` es la única capa con SQLite (`expo-sqlite`) y NetInfo
  (`cached_resource` + `sync_queue` + `attachments`), con motor FIFO single-flight,
  encolado optimista y UI de pendientes/conflictos; `POST /v1/sync` es la única ruta.
  **Evidencia (ADR-14)** capturada con `expo-image-picker`/`expo-image-manipulator`
  (JPEG + SHA-256) y encolada antes del lote; **FlashList** en trazabilidad, detalle,
  mercado y propinas.
- Producción (piloto Android): Supabase real conectado (proyecto
  `yvczofwzfljuubxnmakj`; endpoints autenticados con JWT por request y RLS
  efectiva; `service_role` solo para auth interna, verificación pública y
  Storage) y **registro público cerrado** (`enable_signup=false`); las cuentas
  piloto se crean por Auth Admin, no desde la app. Smoke test operativo en
  `Backend/scripts/smoke_production.py`.
- Blockchain (ADR-11): `CoffeeTraceability` está desplegado en Base Sepolia
  (`0x083475298d32724d85E17Dd48f9a9Bd2550035C9`, bloque `46926492`) y las
  migraciones `011/012/013` están aplicadas. Producción quedó estabilizada en
  Vercel con `BEAN_WEB3_MODE=disabled` y `/health` 200 tras un intento fallido
  de activar `anchor`: se había cargado una address pública como
  `BEAN_WEB3_BACKEND_PRIVATE_KEY`, y además apareció una frase de 12 palabras.
  No reutilizar esa wallet caliente vieja (`0x42cC...d656`) para Vercel. Para
  retomar: crear hot wallet nueva, fondearla, otorgar `ANCHOR_ROLE`, revocar la
  vieja, cargar la private key nueva en Vercel, rotar `CRON_SECRET`, activar
  `anchor`, correr canario y auditar `CONFIRMADA >= 1`, `FALLIDA = 0`.
- Deudas clave: pagos on-chain reales siguen en pausa; resta cerrar el canario
  de anclaje con hot wallet nueva y el smoke de producción/EAS. El rate limit en
  memoria queda solo para dev/CI.

## Skills útiles

- `~/.agents/skills/fastapi/SKILL.md`, `python-expert`, `code-review`, `frontend-design`,
  `mobile-ios-design`, `mobile-android-design`, `solidity` (cuando se retome web3).
- En `mobile/`: consultar https://docs.expo.dev/versions/v54.0.0/ antes de escribir
  código de Expo (regla del `mobile/AGENTS.md`).
