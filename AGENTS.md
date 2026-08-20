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
- `.opencode/agent/login-flow.md` — agente de auth flow (lee este archivo antes de usar el agente).

No existe `contracts/` (web3 pausado — deuda B7) ni `db/` en la raíz.

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
  definido pero inerte (defensa real en la capa de servicio), gateway de pagos fake.

## Estado real (MVP) — no asumir más

- Backend: `POST /v1/propinas` y `GET /v1/propinas/lote/{lote_id}` montados y probados
  (tenancy por tenant en `PropinaService.listar_propinas_lote`). `GET /v1/pagos` y
  `GET /v1/pagos/saldo` son **STUBs** (ceros/vacío). `PropinaService.obtener_saldo_productor`
  tiene un bug latente (usa `self._repo_pago` que no se inyecta) y está sin cablear.
- Mobile: login/refresh **reales**; register/recover **demo**. F02 (wizard), F03
  (verificar), F04 (mercado/donut) y F05 (trazabilidad) son **stubs/placeholders**.
  Sin tests móviles. Colores hardcodeados fuera de tokens en varias pantallas (deuda).
- Deudas clave: B7 web3 en pausa, B11 Supabase real + RLS activo + wallet `public_address`,
  refresh sin rotación de tokens, rate limit en memoria.

## Skills útiles

- `~/.agents/skills/fastapi/SKILL.md`, `python-expert`, `code-review`, `frontend-design`,
  `mobile-ios-design`, `mobile-android-design`, `solidity` (cuando se retome web3).
- En `mobile/`: consultar https://docs.expo.dev/versions/v54.0.0/ antes de escribir
  código de Expo (regla del `mobile/AGENTS.md`).