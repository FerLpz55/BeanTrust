# [Mobile] F11 — Registrar eventos / avanzar estado del lote (POST /v1/lotes/{id}/eventos, UI nueva)

> **GitHub:** [#32](https://github.com/FerLpz55/BeanTrust/issues/32) · **Estado:** Todo · **Label:** —
> **Depende de:** F09 · **Desbloquea:** —

## Contexto

`POST /v1/lotes/{lote_id}/eventos` es la **acción core del productor en campo** (avanzar el lote por la máquina de estados) y hoy **no existe ni el botón** en la app. El backend soporta los 11 tipos de evento (ADR-12) con campos obligatorios por transición (`docs/ARCHITECTURE.md` §4, tabla de transiciones) e idempotencia por `Idempotency-Key`.

## Alcance

- En `lotes/[id].tsx` (detalle real de F09): CTA "Registrar evento" visible según rol (productor/cooperativa).
- Formularios por tipo de evento mostrando **solo las transiciones válidas** desde el estado actual (derivado del detalle del lote): `LIMPIEZA`, `DESPULPADO`, `FERMENTACION`, `LAVADO`, `SECADO`, `REPOSO`, `DESCASCARADO`, `CLASIFICACION`, `TOSTADO`, `RECHAZADO`, cada uno con sus campos (`peso_kg`, `merma_pct`, `metodo_beneficiado`, `horas`, `humedad_*`, `puntaje_sca`, `defectos`, motivo, etc.).
- `VENTA` se excluye del móvil productor: la dispara la cooperativa vía `POST /v1/pagos` (verificar contrato; si aplica, documentarlo en la UI). El pago es **simulado** por el gateway fake — sin dinero real ni blockchain (B7 en pausa).
- `POST /v1/lotes/{id}/eventos` con `Idempotency-Key` por operación; tras `201`, refrescar detalle/timeline.
- Manejo de `409` (transición no permitida) con mensaje claro en español — la máquina de estados vive en el backend, la UI solo ofrece las válidas.

## Criterios de aceptación

- [ ] Un productor puede llevar un lote de CEREZA a TOSTADO registrando cada evento desde la app, y el timeline refleja el hash por etapa real.
- [ ] Reintentar la misma operación no duplica el evento (idempotencia).
- [ ] `pnpm exec tsc --noEmit` + `pnpm exec expo lint` en verde.

## Referencias

- `mobile/app/(app)/lotes/[id].tsx` (timeline existente)
- `docs/ARCHITECTURE.md` §4 (tabla de transiciones, invariantes), §6, ADR-12

## Dependencias

F09 (detalle real del lote).
