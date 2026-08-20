# Plan: alinear docs ↔ código y construir memoria persistente (BeanTrust)

**Estado:** aprobado por el usuario (alcance completo: código + docs + memoria).
**Objetivo:** eliminar las desalineaciones actuales entre documentación y código,
establecer una guarda automática de contrato y dejar memoria persistente del proyecto
para que ningún agente vuelva a desincronizar docs y código.

---

## Diagnóstico (hecho — leído todo el repo)

Desalineaciones confirmadas:
1. `router_propinas` definido en `Backend/app/api/v1/endpoints/pagos.py:66-97` pero
   **no montado** en `Backend/app/api/v1/router.py:10-16` → `POST /v1/propinas` no existe
   en la API aunque `Backend/README.md:64` y `docs/ARCHITECTURE.md` lo documentan.
2. `POST /v1/auth/register` existe en `auth.py:18-20` pero falta en las tablas de
   endpoints de `Backend/README.md:52-67` y `docs/ARCHITECTURE.md:718-732`.
3. `GET /me` en `Backend/README.md:65` debería ser `GET /auth/me`.
4. Estructura del monorepo: `README.md:13-17` y `docs/ARCHITECTURE.md` §3 listan
   `contracts/` y `db/` en raíz; en realidad no existe `contracts/` y la BD vive en
   `Backend/db/`.
5. `mobile/README.md` es boilerplate de create-expo-app (sin valor).
6. Dos olores de código en `pagos.py`: `registrar_propina` lee `idempotencia` como
   **query param** (`idempotencia: uuid.UUID`) en vez de header `Idempotency-Key`
   (la DI correcta `IdempotenciaDep` ya existe en `dependencies.py:286`); y
   `listar_propinas_lote` accede a `servicio._repo_propina` (atributo privado, salta la
   capa de servicio).

---

## Parte A — Código backend

### A1. `Backend/app/api/v1/endpoints/pagos.py`
- `registrar_propina`: cambiar `idempotencia: uuid.UUID` → `idempotencia: IdempotenciaDep`
  (header `Idempotency-Key` con validación de UUID, buena práctica IETF).
- Mover `require_rol(Rol.COMPRADOR)` del nivel de router al endpoint `POST` (el router
  `router_propinas` también expone un `GET` de lectura que comparten productor/cooperativa).
- `listar_propinas_lote`: reemplazar el acceso a `servicio._repo_propina` por el método
  público del servicio `servicio.listar_propinas_lote(usuario, lote_id)`.

### A2. `Backend/app/services/propina_service.py`
- Nuevo método `listar_propinas_lote(usuario, lote_id)` con autorización por tenant
  (matriz RLS de `docs/ARCHITECTURE.md` §10): admin todo; productor solo de su finca;
  cooperativa solo de su finca; comprador solo si dio una propina o fue comprador de la
  venta del lote; si no → `NoAutorizado` (403). Usa `buscar_por_lote` del repo.

### A3. `Backend/app/api/v1/router.py`
- `api_router.include_router(pagos.router_propinas)`.

### A4. `Backend/tests/integration/test_contrato_api.py` (NUEVO — guarda de contrato)
- Declara el conjunto exacto `{(método, ruta)}` de endpoints documentados (misma lista que
  la tabla de `Backend/README.md` y `docs/ARCHITECTURE.md` §6).
- Compara con `crear_app().openapi()`: si hay una ruta expuesta no documentada o una
  documentada que no existe → **el test falla**. Esto evita el bug de `router_propinas`
  en el futuro.
- Lista esperada (16 endpoints):
  `GET /v1/health`, `POST|GET /v1/lotes`, `GET /v1/lotes/{lote_id}`,
  `POST /v1/lotes/{lote_id}/eventos`, `GET /v1/verificar/{codigo}`,
  `POST|GET /v1/pagos`, `GET /v1/pagos/saldo`, `POST /v1/propinas`,
  `GET /v1/propinas/lote/{lote_id}`, `POST /v1/sync`,
  `POST /v1/auth/login|register|refresh`, `GET /v1/auth/me`,
  `GET /v1/cooperativas`.

### A5. Verificación backend
- `ruff check app tests` y `pytest` (desde `Backend/`).

---

## Parte B — Documentación

### B1. `Backend/README.md`
- Añadir `POST /auth/register`, `POST /propinas` y `GET /propinas/lote/{id}`.
- Corregir `GET /me` → `GET /auth/me`.
- Marcar `GET /pagos` y `GET /pagos/saldo` como **stubs** (devuelven datos vacíos/ceros).

### B2. `docs/ARCHITECTURE.md`
- §6 (tabla de endpoints): añadir `POST /v1/auth/register`, `POST /v1/propinas`,
  `GET /v1/propinas/lote/{id}`; corregir `GET /me` → `GET /v1/auth/me`; marcar stubs.
- §3 (estructura del monorepo): corregir a `Backend/` (mayúscula real), `db/` en
  `Backend/db/`, `contracts/` como **planificado/pausado (web3 B7)**.
- §10: aclarar que el móvil consume login/refresh reales y que register/recover siguen demo.

### B3. `README.md` (raíz)
- Corregir estructura: `Backend/`, `mobile/`, `docs/`; `contracts/` y `db/` raíz → planificado.

### B4. `mobile/README.md`
- Reemplazar boilerplate por el **estado real del MVP**: qué está conectado (login/refresh),
  qué es demo (register/recover), stubs F01–F06, cómo correr (start/lint/typecheck).

---

## Parte C — Memoria persistente

### C1. `AGENTS.md` (raíz, NUEVO)
- `docs/ARCHITECTURE.md` = fuente de verdad del diseño; la tabla de `Backend/README.md` =
  fuente de verdad de la superficie de la API.
- Regla dura: todo cambio de router/endpoint debe actualizar las tablas y §6/§10 **en el
  mismo cambio**; el `test_contrato_api.py` valida la paridad.
- Comandos de verificación (`ruff`, `pytest`, `tsc --noEmit`, `expo lint`).

### C2. `mobile/package.json`
- Añadir script `"typecheck": "tsc --noEmit"` (hoy no existe).

### C3. `.opencode/agent/login-flow.md` (reescritura 360 → memoria persistente)
- Conserva frontmatter válido (`mode: subagent`, `description` actualizado).
- Cuerpo como memoria completa del proyecto + prompt del agente de auth flow:
  1. Rol del agente (auth flow + guardián de alineación).
  2. Memoria del proyecto (qué es BeanTrust, modelo B2B2C, Pasaporte de Café, stack, monorepo).
  3. Fuentes de verdad (tabla de documentos).
  4. Arquitectura resumida (backend por capas, BD, RLS, móvil, guards).
  5. Flujo de autenticación end-to-end (contrato API, store, SecureStore, JWT, providers,
     estado REAL: login/refresh conectados, register/recover demo, credenciales dev).
  6. Sistema de diseño "Copa de cata" (tokens + skills a cargar: frontend-design,
     mobile-ios-design, mobile-android-design).
  7. Estado real del código (F01–F06, stubs y desviaciones).
  8. Convenciones y verificación.
  9. Deuda técnica (B7 web3 pausado, B11 Supabase real/RLS inerte, refresh sin rotación,
     rate limit en memoria).
  10. Regla de alineación docs↔código embebida (checklist antes de terminar cualquier tarea).
  11. Cómo trabajar / entregable.

---

## Parte D — Debate con subagentes (revisión por pares)

Después de implementar A y B/C:
1. **Subagente 1 — revisión del backend**: evaluar A1–A4 con lente de code-review
   (seguridad, capas, idempotencia, autorización por tenant). Verificar que el
   `test_contrato_api` cubra el caso y que no haya rutas fantasma.
2. **Subagente 2 — revisión de la memoria/agente**: validar `login-flow.md` y `AGENTS.md`
   contra el formato de opencode (frontmatter) y que la memoria refleje el estado real.
3. **Subagente 3 — revisión de la implementación vs. buenas prácticas externas**: contrastar
   la solución de idempotencia y el contrato con lo investigado (IETF Idempotency-Key,
   contract testing con OpenAPI).
- Incorporar hallazgos; re-verificar (`pytest`, `tsc`, `lint`).

---

## Parte E — Verificación final

1. `Backend/`: `ruff check app tests` + `pytest`.
2. `mobile/`: `pnpm exec tsc --noEmit` + `pnpm exec expo lint`.
3. Confirmar que `test_contrato_api` falla si se desmonta `router_propinas` (prueba
   manual rápida opcional) y que `POST /v1/propinas` responde 201 con `Idempotency-Key`.
4. Recordar al usuario **reiniciar opencode** para que cargue el nuevo `login-flow.md`
   y `AGENTS.md` (config se lee al arranque, no en caliente).