# [Backend] B16: GET /v1/mercado/{lote_id} — Panel Comercio Justo (proyección read-only)

> **GitHub:** (pendiente de crear) · **Estado:** Done · **Label:** `backend`
> **Depende de:** B13 · **Desbloquea:** F13

## Contexto

ADR-9 (§11) decide que el mercado es "una **proyección read-only** materializada por el backend a
partir de `LOTE`, `PAGO`, `PROPINA`", y §9 dice que el Panel Comercio Justo es visible para el
comprador y el productor. **Pero la tabla de endpoints §6 no lista ninguna ruta de mercado**: es un
hueco de la propia documentación.

Sin este endpoint, F13 no puede pintar el donut 97/3 con datos reales para el **comprador**:
`GET /v1/pagos` está restringido a la cooperativa (B13) y `GET /v1/propinas/lote/{id}` solo
devuelve propinas, no los montos de la venta.

> **Dinero simulado**: la proyección solo lee lo que registró el `FakeGatewayPagos`. Sin dinero
> real, pasarelas ni blockchain (B7 en pausa).

## Alcance

- `GET /v1/mercado/{lote_id}`: `monto_total`, `comision_pct`, `monto_productor` (97%), estado del
  pago, propinas del lote y datos de finca/productor.
- Tenancy: comprador de la venta, productor del lote, cooperativa del lote y admin. **Reusar** la
  regla ya implementada en `PropinaService.listar_propinas_lote` en vez de reescribirla.
- Sin escritura: ADR-9 prohíbe `POST /mercado`.
- Sincronizar `test_contrato_api.py`, `Backend/README.md`, `docs/ARCHITECTURE.md` §6 y §10, y
  documentar la ruta en ADR-9 (que la daba por existente sin nombrarla).

## Criterios de aceptación

- [x] El comprador de la venta ve el desglose 97/3 de su lote; un tercero recibe 403.
- [x] `ruff check app tests` + `pytest` en verde con tests de tenancy.
- [x] Contrato y docs sincronizados en el mismo cambio.

## Referencias

- `docs/ARCHITECTURE.md` §9 (Panel Comercio Justo), ADR-9, §10
- `Backend/app/services/propina_service.py` (regla de tenant a reusar)
