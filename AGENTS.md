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
  solo lectura por defecto). **Registro propio (014)**: el alta pública solo crea
  `productor` (el trigger de Auth lo fuerza aunque la metadata pida otro rol) y
  `POST /v1/fincas` (exclusivo de productor) crea la finca inicial con la
  cooperativa del piloto desde `BEAN_PILOT_COOPERATIVA_ID`
  (`9d652468-418b-443c-b4be-a652124927c2`), idempotente por el `id` del móvil; la
  RLS de `finca` valida la cooperativa permitida y un trigger bloquea cambiar
  `productor_id`/`cooperativa_id`.
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
  mercado y propinas. **Registro y onboarding**: `app/(auth)/register.tsx` crea la
  cuenta (sin selector de roles) y `app/(app)/onboarding-finca.tsx` configura la
  primera finca; el `logout` limpia el estado de todos los stores
  (`src/store/sesion.ts`) y pausa el motor offline conservando la cola del dueño.
- Producción (piloto Android): Supabase real conectado (proyecto
  `yvczofwzfljuubxnmakj`; endpoints autenticados con JWT por request y RLS
  efectiva; `service_role` solo para auth interna, verificación pública y
  Storage) y **registro público de productores habilitado** (`enable_signup=true`,
  endurecido por la migración 014; los roles privilegiados se crean por Auth
  Admin). Smoke test operativo en `Backend/scripts/smoke_production.py`.
- Blockchain (ADR-11): `CoffeeTraceability` está desplegado en Base Sepolia
  (`0x083475298d32724d85E17Dd48f9a9Bd2550035C9`, bloque `46926492`, runtime hash
  `0x07746f4c5c883f10bc2904690dd2a4969f1945f91e5be55689a5676e01def3d8`) y las
  migraciones `011/012/013` están aplicadas. Producción está activa con
  `BEAN_WEB3_MODE=anchor`, `/health` 200 y hot wallet final
  `0x44bA43a9CB64E75B3fb7fAcCf271052f4E6b347B` (tiene `ANCHOR_ROLE`, no admin,
  no pauser). Drenado real cerrado: `CONFIRMADA=9`, `ENVIADA=0`, `PENDIENTE=0`,
  `FALLIDA=0`. No reutilizar para Vercel la wallet vieja
  `0x42cC953Bd37cb100074ab9e20AD950D7c0add656` ni wallets cuyas frases/private
  keys hayan aparecido en chat.
- Deudas clave: pagos on-chain reales siguen en pausa; resta smoke/manual final
  de Expo Go/EAS si se quiere validar el piloto Android. El rate limit en memoria
  queda solo para dev/CI.

## Skills útiles

- `~/.agents/skills/fastapi/SKILL.md`, `python-expert`, `code-review`, `frontend-design`,
  `mobile-ios-design`, `mobile-android-design`, `solidity` (cuando se retome web3).
- En `mobile/`: consultar https://docs.expo.dev/versions/v54.0.0/ antes de escribir
  código de Expo (regla del `mobile/AGENTS.md`).
