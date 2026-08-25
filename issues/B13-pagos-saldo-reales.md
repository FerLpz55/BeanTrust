# [Backend] B13: Implementar GET /v1/pagos y GET /v1/pagos/saldo reales + saldo del productor

> **GitHub:** [#26](https://github.com/FerLpz55/BeanTrust/issues/26) · **Estado:** Todo · **Label:** `backend`
> **Depende de:** — · **Desbloquea:** F13

## Contexto

`GET /v1/pagos` y `GET /v1/pagos/saldo` son **STUBs**: devuelven lista vacía y ceros (documentado en `Backend/README.md` y `docs/ARCHITECTURE.md` §6/§10). Además, `PropinaService.obtener_saldo_productor` tiene un **bug latente**: usa `self._repo_pago`, que nunca se inyecta, y el método está sin cablear.

Sin este issue, la pantalla de Mercado del móvil mostrará ceros aunque se conecte al backend real (bloquea F13).

> **Alcance de dinero: TODO ES SIMULADO.** Los pagos y propinas siguen fluyendo por el `FakeGatewayPagos` (tx determinista `0x<pago.id>`, confirmación simulada). **Nada de dinero real, pasarelas de pago, custodia ni integración blockchain**: web3 sigue en pausa (B7). Este issue solo implementa la **lectura** de los pagos registrados en la base.

## Alcance

- Implementar `GET /v1/pagos`: historial de pagos de la cooperativa autenticada (tenant resuelto desde `auth.uid()` → `usuarios`, nunca del cliente).
- Implementar `GET /v1/pagos/saldo`: saldo real del productor (ventas 97% + propinas 100%), respetando la matriz de acceso de `docs/ARCHITECTURE.md` §10 (el productor lee **su** saldo; cooperativa el de sus productores; admin todo).
- Corregir la inyección del repo de pagos (bug `_repo_pago`) y cablear el cálculo de saldo al servicio correspondiente.
- Mantener idempotencia y códigos del contrato existentes; sin romper `test_contrato_api.py`.

## Criterios de aceptación

- [ ] Ambos endpoints devuelven datos reales del repositorio (in_memory y preparado para Supabase) con aislamiento por tenant probado en tests.
- [ ] Tests unitarios + integración nuevos; `ruff check app tests` y `pytest` en verde.
- [ ] `Backend/README.md` y `docs/ARCHITECTURE.md` §6/§10 actualizados en el mismo cambio (se quita la marca **STUB**) — regla de oro docs↔código.

## Referencias

- `Backend/app/api/v1/endpoints/pagos.py`, `Backend/app/services/`, `Backend/app/repositories/`
- `docs/ARCHITECTURE.md` §6 (contrato), §9 (Panel Comercio Justo), §10 (matriz RLS)

## Dependencias

Ninguna. Desbloquea F13 (mercado móvil real).
