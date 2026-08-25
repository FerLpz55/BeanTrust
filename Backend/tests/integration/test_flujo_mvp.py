"""Flujo MVP completo de punta a punta.

Los demás módulos prueban cada pieza por separado; este recorre la cadena
entera que debe funcionar en el móvil, que es donde aparecen los fallos de
integración (un `finca_id` que nadie entrega, un saldo que nunca se confirma):

    login → fincas → alta de lote → eventos → certificado
          → verificación pública → venta → propina → saldo → comercio justo

Dinero simulado por `FakeGatewayPagos`: web3 sigue en pausa (B7).
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.integration


def test_cadena_completa_del_grano_al_comercio_justo(
    client: TestClient,
    header_productor: dict[str, str],
    header_cooperativa: dict[str, str],
    header_comprador: dict[str, str],
) -> None:
    # 1. El productor descubre sus fincas (B15): sin esto no puede crear lotes.
    fincas = client.get("/v1/fincas", headers=header_productor).json()
    assert fincas, "el productor debe tener al menos una finca"
    finca_id = fincas[0]["id"]

    # 2. Alta de lote con id generado en el móvil (idempotencia por cuerpo, §6).
    lote_id = str(uuid.uuid4())
    cuerpo = {
        "id": lote_id,
        "finca_id": finca_id,
        "fecha_cosecha": "2026-08-01",
        "peso_kg": 500.0,
        "variedad": "Bourbon",
        "metodo_beneficiado": "Lavado",
    }
    assert client.post("/v1/lotes", headers=header_productor, json=cuerpo).status_code == 201
    # Reintento del mismo alta: no debe crear un segundo lote.
    assert client.post("/v1/lotes", headers=header_productor, json=cuerpo).status_code == 201
    assert len(client.get("/v1/lotes", headers=header_productor).json()["items"]) == 1

    # 3. Avance por la máquina de estados hasta TOSTADO.
    for tipo, peso in [("DESPULPADO", 480.0), ("DESCASCARADO", 450.0), ("TOSTADO", 420.0)]:
        clave = str(uuid.uuid4())
        headers = {**header_productor, "Idempotency-Key": clave}
        cuerpo_evento = {"tipo": tipo, "peso_kg": peso}
        assert (
            client.post(f"/v1/lotes/{lote_id}/eventos", headers=headers, json=cuerpo_evento)
        ).status_code == 201
        # Reintento con la misma clave: idempotente.
        client.post(f"/v1/lotes/{lote_id}/eventos", headers=headers, json=cuerpo_evento)

    detalle = client.get(f"/v1/lotes/{lote_id}", headers=header_productor).json()
    assert detalle["estado"] == "TOSTADO"
    tipos = [e["tipo"] for e in detalle["historial"]]
    assert tipos == ["COSECHA", "DESPULPADO", "DESCASCARADO", "TOSTADO"], "sin duplicados"
    # ADR-11: la cadena de hashes no puede tener eslabones vacíos, ni el génesis.
    assert all(e["hash_etapa"] for e in detalle["historial"])
    assert detalle["certificado"] is not None, "el certificado se emite al llegar a TOSTADO"

    # 4. El consumidor verifica el Pasaporte de Café sin cuenta (§8).
    codigo = detalle["certificado"]["codigo"]
    pasaporte = client.get(f"/v1/verificar/{codigo}").json()
    assert pasaporte["variedad"] == "Bourbon"
    assert pasaporte["finca_nombre"]
    assert len(pasaporte["historial"]) == 4
    assert "actor_id" not in pasaporte["historial"][0], "el pasaporte no filtra datos internos"

    # 5. La cooperativa vende: 97% al productor, 3% de comisión.
    comprador_id = client.get("/v1/auth/me", headers=header_comprador).json()["id"]
    venta = client.post(
        "/v1/pagos",
        headers={**header_cooperativa, "Idempotency-Key": str(uuid.uuid4())},
        json={"lote_id": lote_id, "comprador_id": comprador_id, "monto_total": 1000.0},
    )
    assert venta.status_code == 202
    assert venta.json()["monto_productor"] == 970.0
    assert len(client.get("/v1/pagos", headers=header_cooperativa).json()["items"]) == 1

    # 6. El comprador deja propina (100% directa, idempotente).
    clave_propina = str(uuid.uuid4())
    propina = client.post(
        "/v1/propinas",
        headers={**header_comprador, "Idempotency-Key": clave_propina},
        json={"lote_id": lote_id, "monto": 50.0, "moneda": "MXN"},
    )
    assert propina.status_code == 201
    assert propina.json()["estado_propina"] == "REGISTRADA", "bivalente: confirma después"
    client.post(
        "/v1/propinas",
        headers={**header_comprador, "Idempotency-Key": clave_propina},
        json={"lote_id": lote_id, "monto": 50.0, "moneda": "MXN"},
    )
    assert len(client.get(f"/v1/propinas/lote/{lote_id}", headers=header_comprador).json()) == 1

    # 7. El saldo del productor deja de ser cero (B13 + confirmación en segundo plano).
    saldo = client.get("/v1/pagos/saldo", headers=header_productor).json()
    assert saldo["total_pagos"] == 970.0
    assert saldo["total_propinas"] == 50.0
    assert saldo["saldo_total"] == 1020.0

    # 8. El comprador ve el Panel Comercio Justo del lote que compró (B16, ADR-9).
    panel = client.get(f"/v1/mercado/{lote_id}", headers=header_comprador).json()
    assert panel["monto_productor"] == 970.0
    assert panel["monto_plataforma"] == 30.0
    assert panel["monto_productor"] + panel["monto_plataforma"] == panel["monto_total"]
    assert panel["total_propinas"] == 50.0
