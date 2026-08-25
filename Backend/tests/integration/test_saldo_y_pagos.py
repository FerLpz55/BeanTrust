"""B13 · `GET /v1/pagos` y `GET /v1/pagos/saldo` reales (§6, §9, §10).

Cubre lo que antes era STUB: historial paginado de la cooperativa y saldo del
productor (97% de ventas confirmadas + propinas confirmadas). Todo el dinero
es **simulado** vía `FakeGatewayPagos` — web3 sigue en pausa (B7).
"""

from __future__ import annotations

import uuid

import pytest

from .conftest import crear_lote_vendido

pytestmark = pytest.mark.integration


def _id_de(client, header) -> str:
    return client.get("/v1/auth/me", headers=header).json()["id"]


# ---------------------------------------------------------------- GET /v1/pagos


def test_historial_devuelve_los_pagos_de_la_cooperativa(
    client, header_productor, header_cooperativa, header_comprador
):
    comprador_id = _id_de(client, header_comprador)
    crear_lote_vendido(client, header_productor, header_cooperativa, comprador_id, 5000.0)

    r = client.get("/v1/pagos", headers=header_cooperativa)
    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert len(cuerpo["items"]) == 1
    pago = cuerpo["items"][0]
    assert pago["monto_total"] == 5000.0
    assert pago["comision_pct"] == 3.0
    assert pago["monto_productor"] == 4850.0  # 97%


@pytest.mark.parametrize("rol", ["productor", "comprador", "admin"])
def test_historial_solo_para_la_cooperativa(client, request, rol):
    """Matriz §10: el historial de pagos es de la cooperativa que vendió."""
    header = request.getfixturevalue(f"header_{rol}")
    assert client.get("/v1/pagos", headers=header).status_code == 403


def test_historial_vacio_sin_ventas(client, header_cooperativa):
    r = client.get("/v1/pagos", headers=header_cooperativa)
    assert r.status_code == 200
    assert r.json() == {"items": [], "next_cursor": None}


def test_historial_pagina_por_cursor(
    client, header_productor, header_cooperativa, header_comprador
):
    comprador_id = _id_de(client, header_comprador)
    for _ in range(3):
        crear_lote_vendido(client, header_productor, header_cooperativa, comprador_id)

    primera = client.get("/v1/pagos?limit=2", headers=header_cooperativa).json()
    assert len(primera["items"]) == 2
    assert primera["next_cursor"] is not None

    segunda = client.get(
        f"/v1/pagos?limit=2&cursor={primera['next_cursor']}", headers=header_cooperativa
    ).json()
    assert len(segunda["items"]) == 1
    ids = {p["id"] for p in primera["items"]} | {p["id"] for p in segunda["items"]}
    assert len(ids) == 3


# ---------------------------------------------------------- GET /v1/pagos/saldo


def test_saldo_suma_venta_confirmada_y_propina(
    client, header_productor, header_cooperativa, header_comprador
):
    """El poller simulado confirma en segundo plano: el saldo deja de ser cero."""
    comprador_id = _id_de(client, header_comprador)
    lote = crear_lote_vendido(
        client, header_productor, header_cooperativa, comprador_id, monto_total=1000.0
    )
    r = client.post(
        "/v1/propinas",
        headers={**header_comprador, "Idempotency-Key": str(uuid.uuid4())},
        json={"lote_id": lote["id"], "monto": 50.0, "moneda": "MXN"},
    )
    assert r.status_code == 201, r.text
    assert r.json()["estado_propina"] == "REGISTRADA"  # bivalente: confirma después

    saldo = client.get("/v1/pagos/saldo", headers=header_productor)
    assert saldo.status_code == 200, saldo.text
    cuerpo = saldo.json()
    assert cuerpo["total_pagos"] == 970.0  # 97% de 1000
    assert cuerpo["total_propinas"] == 50.0
    assert cuerpo["saldo_total"] == 1020.0
    assert cuerpo["moneda"] == "MXN"


def test_saldo_en_cero_sin_movimientos(client, header_productor):
    r = client.get("/v1/pagos/saldo", headers=header_productor)
    assert r.status_code == 200
    assert r.json()["saldo_total"] == 0.0


def test_saldo_es_del_productor_no_de_la_cooperativa(client, header_cooperativa):
    """Resuelve la contradicción del contrato: /saldo es del productor (§6)."""
    assert client.get("/v1/pagos/saldo", headers=header_cooperativa).status_code == 403


def test_saldo_sin_token(client):
    assert client.get("/v1/pagos/saldo").status_code == 401
