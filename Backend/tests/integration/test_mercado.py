"""B16 · `GET /v1/mercado/{lote_id}`: Panel Comercio Justo (ADR-9, §9, §10).

Proyección read-only: verifica el desglose 97/3, la suma de propinas y que el
tenant se respeta (solo dueños del lote). Dinero simulado (B7 en pausa).
"""

from __future__ import annotations

import uuid

import pytest

from .conftest import crear_lote_tostado, crear_lote_vendido

pytestmark = pytest.mark.integration


def _id_de(client, header) -> str:
    return client.get("/v1/auth/me", headers=header).json()["id"]


def test_comprador_ve_el_desglose_97_3(
    client, header_productor, header_cooperativa, header_comprador
):
    """El caso que F13 no podía resolver: el comprador lee su donut."""
    comprador_id = _id_de(client, header_comprador)
    lote = crear_lote_vendido(
        client, header_productor, header_cooperativa, comprador_id, monto_total=2000.0
    )
    r = client.get(f"/v1/mercado/{lote['id']}", headers=header_comprador)
    assert r.status_code == 200, r.text
    panel = r.json()
    assert panel["monto_total"] == 2000.0
    assert panel["comision_pct"] == 3.0
    assert panel["monto_productor"] == 1940.0
    assert panel["monto_plataforma"] == 60.0
    assert panel["monto_productor"] + panel["monto_plataforma"] == panel["monto_total"]
    assert panel["finca_nombre"] == "Finca La Esperanza"


def test_panel_incluye_las_propinas(
    client, header_productor, header_cooperativa, header_comprador
):
    comprador_id = _id_de(client, header_comprador)
    lote = crear_lote_vendido(client, header_productor, header_cooperativa, comprador_id)
    for monto in (25.0, 15.0):
        r = client.post(
            "/v1/propinas",
            headers={**header_comprador, "Idempotency-Key": str(uuid.uuid4())},
            json={"lote_id": lote["id"], "monto": monto, "moneda": "MXN"},
        )
        assert r.status_code == 201, r.text

    panel = client.get(f"/v1/mercado/{lote['id']}", headers=header_comprador).json()
    assert panel["total_propinas"] == 40.0
    assert len(panel["propinas"]) == 2


def test_productor_y_cooperativa_tambien_leen(
    client, header_productor, header_cooperativa, header_comprador
):
    comprador_id = _id_de(client, header_comprador)
    lote = crear_lote_vendido(client, header_productor, header_cooperativa, comprador_id)
    for header in (header_productor, header_cooperativa):
        assert client.get(f"/v1/mercado/{lote['id']}", headers=header).status_code == 200


def test_tercero_no_accede(
    client, header_productor, header_cooperativa, header_comprador, header_comprador2
):
    """Un comprador que no compró el lote recibe 403 (tenancy ADR-10)."""
    comprador_id = _id_de(client, header_comprador)
    lote = crear_lote_vendido(client, header_productor, header_cooperativa, comprador_id)

    assert client.get(f"/v1/mercado/{lote['id']}", headers=header_comprador2).status_code == 403


def test_lote_sin_venta_devuelve_404(client, header_productor):
    """Sin pago no hay comercio justo que proyectar."""
    lote = crear_lote_tostado(client, header_productor)
    r = client.get(f"/v1/mercado/{lote['id']}", headers=header_productor)
    assert r.status_code == 404, r.text


def test_sin_token_rechaza(client):
    assert client.get(f"/v1/mercado/{uuid.uuid4()}").status_code == 401
