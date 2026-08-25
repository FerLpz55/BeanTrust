"""Tests de pagos (§9): autorización, idempotencia y confirmación del poller."""

from __future__ import annotations

import uuid

from app.repositories.in_memory import (
    FakeGatewayPagos,
    InMemoryFincaRepo,
    InMemoryLoteRepo,
    InMemoryPagoRepo,
)
from app.services.pagos_service import PagoService

from .conftest import crear_lote_tostado


def test_productor_no_puede_disparar_pago(client, header_productor, header_cooperativa):
    """B9/A01: el rol productor recibe 403 en /v1/pagos (solo cooperativa)."""
    lote = crear_lote_tostado(client, header_productor)
    r = client.post(
        "/v1/pagos",
        headers=header_productor,
        json={"lote_id": lote["id"], "comprador_id": str(uuid.uuid4()), "monto_total": 1000.0},
    )
    assert r.status_code == 403


def test_venta_solo_por_pagos(client, header_productor):
    """B9: POST /eventos con tipo VENTA se rechaza (la venta va por /pagos)."""
    lote = crear_lote_tostado(client, header_productor)
    r = client.post(
        f"/v1/lotes/{lote['id']}/eventos",
        headers={**header_productor, "Idempotency-Key": str(uuid.uuid4())},
        json={"tipo": "VENTA", "comprador_id": str(uuid.uuid4())},
    )
    assert r.status_code == 409
    assert "pagos" in r.json()["detail"]


def test_confirmacion_poller_pendiente_a_confirmado(
    client, header_productor, header_cooperativa, memoria
):
    """B9: simula el poller de Polygon -> Pago PENDIENTE pasa a CONFIRMADO."""
    lote = crear_lote_tostado(client, header_productor)
    r = client.post(
        "/v1/pagos",
        headers={**header_cooperativa, "Idempotency-Key": str(uuid.uuid4())},
        json={"lote_id": lote["id"], "comprador_id": str(uuid.uuid4()), "monto_total": 10000.0},
    )
    assert r.status_code == 202, r.text
    assert r.json()["estado_pago"] == "PENDIENTE"

    servicio = PagoService(
        repo_pago=InMemoryPagoRepo(memoria),
        repo_lote=InMemoryLoteRepo(memoria),
        repo_finca=InMemoryFincaRepo(memoria),
        gateway=FakeGatewayPagos(),
    )
    confirmado = servicio.confirmar_venta(uuid.UUID(lote["id"]))
    assert confirmado.estado_pago.value == "CONFIRMADO"
    assert confirmado.confirmado_en is not None