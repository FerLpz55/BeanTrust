"""Contrato de la API (guarda docs ↔ código).

Cada endpoint expuesto debe estar documentado en `Backend/README.md` (tabla de
endpoints) y en `docs/ARCHITECTURE.md` (§6), y viceversa: si se añade o se quita
una ruta hay que actualizar este conjunto Y la documentación en el mismo cambio.
Un fallo aquí significa que la superficie de la API y la documentación divergieron.
"""

from __future__ import annotations

from app.main import crear_app

# Fuente de verdad de la superficie de la API. Debe coincidir 1:1 con la tabla de
# `Backend/README.md` y `docs/ARCHITECTURE.md` §6 (mismo método y misma ruta).
ENDPOINTS_DOCUMENTADOS: set[tuple[str, str]] = {
    ("GET", "/health"),
    ("POST", "/v1/auth/login"),
    ("POST", "/v1/auth/register"),
    ("POST", "/v1/auth/refresh"),
    ("POST", "/v1/auth/recover"),
    ("POST", "/v1/auth/recover/confirm"),
    ("GET", "/v1/auth/me"),
    ("GET", "/v1/cooperativas"),
    ("GET", "/v1/compradores"),
    ("GET", "/v1/fincas"),
    ("POST", "/v1/fincas"),
    ("POST", "/v1/evidencias"),
    ("POST", "/v1/lotes"),
    ("GET", "/v1/lotes"),
    ("GET", "/v1/lotes/{lote_id}"),
    ("GET", "/v1/lotes/{lote_id}/evidencia"),
    ("POST", "/v1/lotes/{lote_id}/eventos"),
    ("GET", "/v1/verificar/{codigo}"),
    ("GET", "/v1/mercado/{lote_id}"),
    ("POST", "/v1/pagos"),
    ("GET", "/v1/pagos"),
    ("GET", "/v1/pagos/saldo"),
    ("POST", "/v1/propinas"),
    ("GET", "/v1/propinas/lote/{lote_id}"),
    ("POST", "/v1/sync"),
    ("GET", "/v1/blockchain/reconciliar"),
    ("POST", "/v1/blockchain/anclas/{lote_id}/reintentar"),
}


_METODOS_HTTP = {"get", "post", "put", "patch", "delete", "head", "options", "trace"}


def test_contrato_api_coincide_con_documentacion() -> None:
    """La API expone exactamente lo documentado (sin rutas fantasma)."""
    spec = crear_app().openapi()
    expuestos = {
        (metodo.upper(), ruta)
        for ruta, operaciones in spec["paths"].items()
        for metodo in operaciones
        if metodo.lower() in _METODOS_HTTP
    }
    assert expuestos == ENDPOINTS_DOCUMENTADOS
