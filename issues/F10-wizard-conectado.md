# [Mobile] F10 — Wizard conectado: POST /v1/lotes con finca_id, fecha_cosecha e Idempotency-Key

> **GitHub:** [#31](https://github.com/FerLpz55/BeanTrust/issues/31) · **Estado:** Done · **Label:** —
> **Depende de:** F07, F08 · **Desbloquea:** —

## Contexto

El wizard F02 (`app/(app)/lotes/nuevo.tsx`) guarda con `addLote()` en memoria local: **no hay `POST /v1/lotes`**, ni `Idempotency-Key`, ni `finca_id` (el backend lo exige en `LoteCreate`), ni `fecha_cosecha` (el wizard no la captura). El paso 3 de evidencia muestra "Cámara no disponible en demo" — la evidencia fotográfica real (Storage, ADR-14) se **difere a B11**; el schema admite `evidencia_url`/`evidencia_sha256` nulos.

## Alcance

- Obtener `finca_id` del productor autenticado (vía `GET /v1/auth/me` / perfil real de F08).
- Agregar captura de `fecha_cosecha` al wizard (paso 1) y validar catálogos contra el contrato (variedad, método de beneficiado).
- Al confirmar: `POST /v1/lotes` con header `Idempotency-Key` (UUID generado en el móvil por intento de guardado; reintentos del mismo intento reusan la clave).
- Manejo de errores: `422` (validación, mensajes en español), `409`, red; estado `success` solo tras `201` real.
- Al volver, refrescar la lista de lotes (coordinar con F09) para que el lote nuevo aparezca.

## Criterios de aceptación

- [x] Crear un lote desde el wizard lo persiste en el backend y aparece en dashboard/trazabilidad.
- [x] Doble tap / retry no duplica el lote (idempotencia demostrada en test o manualmente).
- [x] `pnpm exec tsc --noEmit` + `pnpm exec expo lint` en verde.

## Referencias

- `mobile/app/(app)/lotes/nuevo.tsx`, `mobile/src/store/lote-draft.ts`
- `Backend` `POST /v1/lotes`; `docs/ARCHITECTURE.md` §6 (idempotencia), ADR-14

## Dependencias

F07 (capa API), F08 (perfil/rol real para `finca_id`).
