# [Mobile] F13 — Mercado y propinas reales: saldo + POST /v1/propinas idempotente + donut 97/3

> **GitHub:** [#34](https://github.com/FerLpz55/BeanTrust/issues/34) · **Estado:** Done · **Label:** —
> **Depende de:** B13, F08, F07 · **Desbloquea:** —

## Contexto

`src/store/mercado.ts` tiene el saldo **hardcodeado en `$420.00`**, lotes vendidos mock y `enviarPropina()` que solo muta estado local (sin `POST /v1/propinas`, sin `Idempotency-Key`). El backend ya expone: `POST /v1/propinas` (201, idempotente, rol comprador), `GET /v1/propinas/lote/{lote_id}` (tenancy por dueños del lote) y, tras B13, `GET /v1/pagos` / `GET /v1/pagos/saldo` reales. El Panel Comercio Justo es proyección read-only del backend (ADR-9): la app nunca lo escribe.

> **Alcance de dinero: TODO ES SIMULADO (test).** Las propinas y el saldo se registran y leen contra el backend con el `FakeGatewayPagos` (confirmación simulada). **No se mueve dinero real, no hay pasarela de pago ni nada de blockchain** (web3 sigue en pausa, B7). La UI debe reflejar que es un entorno de prueba donde aplique.

## Alcance

- Saldo real desde `GET /v1/pagos/saldo` y listado según rol desde `GET /v1/pagos` (cooperativa) — sustituir el mock `$420`.
- `POST /v1/propinas` desde `mercado/[loteId].tsx` con `Idempotency-Key` (UUID por intención de propina; `client.ts` ya admite headers extra); manejo de `409`/`422`.
- Historial de propinas real con `GET /v1/propinas/lote/{lote_id}`.
- Donut 97/3 con montos reales del pago del lote (`monto_total`, `monto_productor`, comisión 3%).
- **Gating por rol** (usa el rol real de F08): solo comprador ve "Enviar Propina"; productor/cooperativa ven saldo/lectura según la matriz §10.

## Criterios de aceptación

- [x] Un comprador puede enviar una propina real y verla en el historial del lote; retry no duplica (idempotencia).
- [x] El saldo y el donut reflejan datos del backend (con B13 resuelto, no ceros).
- [x] `pnpm exec tsc --noEmit` + `pnpm exec expo lint` en verde.

## Referencias

- `mobile/src/store/mercado.ts`, `app/(app)/(tabs)/mercado.tsx`, `app/(app)/mercado/[loteId].tsx`
- `docs/ARCHITECTURE.md` §9 (Panel Comercio Justo, propina ADR-10), §10

## Dependencias

B13 (pagos/saldo reales), F08 (rol real), F07 (capa API).
