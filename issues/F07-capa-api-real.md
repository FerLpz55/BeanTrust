# [Mobile] F07 — Capa de API real (módulos lotes/verificar/pagos/propinas + refresh 401 + .env.example)

> **GitHub:** [#28](https://github.com/FerLpz55/BeanTrust/issues/28) · **Estado:** Done · **Label:** —
> **Depende de:** — · **Desbloquea:** F08, F09, F10, F11, F12, F13

## Contexto

Hoy solo `src/api/auth.ts` (`login`/`refresh`) llama al backend real. No existen módulos de API para lotes, verificar, pagos ni propinas: todas las pantallas consumen mocks de los stores. `src/api/client.ts` ya soporta método/body/token/headers extra (sirve para `Idempotency-Key`) y timeout de 15s.

Además: `mobile/README.md` documenta `API_URL` default `http://192.168.1.109:8000` pero `src/config.ts` tiene `192.168.0.201` (divergencia docs↔código), y no hay `.env.example`. Tampoco hay framework de tests instalado.

Este issue es la **base** de toda la conexión móvil (F08–F13 dependen de él).

## Alcance

- Crear `src/api/lotes.ts`, `src/api/verificar.ts`, `src/api/pagos.ts`, `src/api/propinas.ts` con funciones tipadas.
- Ampliar `src/api/types.ts` con tipos espejo de `Backend/app/schemas/` (`LoteRead`, `LoteDetalleRead`, `LoteEventoRead`, `Pagina`, `VerificarRead`, `PropinaRead/Crear`, etc.).
- Interceptor en `client.ts`: ante `401`, renovar con `/v1/auth/refresh` **una sola vez** (cola única de renovación; el refresh del backend no rota tokens, lo simplifica) y reintentar la petición original; si falla, cerrar sesión.
- Crear `mobile/.env.example` con `EXPO_PUBLIC_API_URL` y corregir la divergencia README↔`config.ts`.
- Setup mínimo de tests (jest/vitest) con pruebas de la capa `api/*` (mock de fetch).

## Criterios de aceptación

- [x] Todos los módulos api compilando y con tests de unidad (happy path + errores 401/404/409/422).
- [x] Una petición con token expirado se renueva y reintenta de forma transparente.
- [x] `pnpm exec tsc --noEmit` y `pnpm exec expo lint` en verde; README y `.env.example` coherentes con `config.ts`.

## Referencias

- `mobile/src/api/client.ts`, `mobile/src/api/auth.ts`, `mobile/src/store/auth.ts`, `mobile/src/config.ts`
- `Backend/README.md` (tabla de endpoints), `docs/ARCHITECTURE.md` §6

## Dependencias

Ninguna. Bloquea a F08, F09, F10, F11, F12, F13.
