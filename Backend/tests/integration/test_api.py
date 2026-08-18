"""Tests E2E de la API (B9): flujos completos con TestClient.

Cubren el contrato §6-§9: lotes, idempotencia, certificado QR, verificación,
pagos, sync y RBAC. Cada test parte de un almacén en memoria limpio.
"""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

FINCA = "11111111-1111-1111-1111-111111111111"


def crear_lote(client: TestClient, header: dict[str, str], *, peso: float = 500.0) -> dict:
    r = client.post(
        "/v1/lotes",
        headers=header,
        json={"finca_id": FINCA, "fecha_cosecha": "2026-08-01", "peso_kg": peso},
    )
    assert r.status_code == 201, r.text
    return r.json()


def avanzar_a_tostado(client: TestClient, header: dict[str, str], lote_id: str) -> dict:
    for tipo, peso in [("DESPULPADO", 480.0), ("DESCASCARADO", 450.0), ("TOSTADO", 420.0)]:
        r = client.post(
            f"/v1/lotes/{lote_id}/eventos",
            headers={**header, "Idempotency-Key": str(uuid.uuid4())},
            json={"tipo": tipo, "peso_kg": peso},
        )
        assert r.status_code == 201, r.text
    return client.get(f"/v1/lotes/{lote_id}", headers=header).json()


def test_flujo_completo_verificacion(client, header_productor):
    lote = crear_lote(client, header_productor)
    detalle = avanzar_a_tostado(client, header_productor, lote["id"])
    certificado = detalle["certificado"]
    assert certificado is not None
    assert certificado["codigo"].startswith("BT-")
    assert len(certificado["hash_sha256"]) == 64

    r = client.get(f"/v1/verificar/{certificado['codigo']}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["lote_id"] == lote["id"]
    assert body["estado"] == "TOSTADO"
    assert len(body["historial"]) == 4


def test_verificar_404_y_409(client):
    assert client.get("/v1/verificar/BT-NOEXISTE").status_code == 404
    # No existe caso 409 sin manipular datos: se cubre unitariamente vía hash.


def test_idempotencia_de_evento(client, header_productor):
    lote = crear_lote(client, header_productor)
    clave = str(uuid.uuid4())
    for _ in range(2):
        r = client.post(
            f"/v1/lotes/{lote['id']}/eventos",
            headers={**header_productor, "Idempotency-Key": clave},
            json={"tipo": "DESPULPADO", "peso_kg": 480.0},
        )
        assert r.status_code == 201, r.text
    detalle = client.get(f"/v1/lotes/{lote['id']}", headers=header_productor).json()
    assert len(detalle["historial"]) == 2  # cosecha + 1 despulpado


def test_evento_invalido_conflicto(client, header_productor):
    lote = crear_lote(client, header_productor)
    r = client.post(
        f"/v1/lotes/{lote['id']}/eventos",
        headers={**header_productor, "Idempotency-Key": str(uuid.uuid4())},
        json={"tipo": "TOSTADO", "peso_kg": 420.0},
    )
    assert r.status_code == 409
    assert "No se puede pasar" in r.json()["detail"]


def test_venta_y_pago_con_comision(client, header_cooperativa, header_productor):
    lote = crear_lote(client, header_productor)
    avanzar_a_tostado(client, header_productor, lote["id"])
    clave = str(uuid.uuid4())
    body = {"lote_id": lote["id"], "comprador_id": str(uuid.uuid4()), "monto_total": 10000.0}

    r = client.post(
        "/v1/pagos",
        headers={**header_cooperativa, "Idempotency-Key": clave},
        json=body,
    )
    assert r.status_code == 202, r.text
    pago = r.json()
    assert pago["estado_pago"] == "PENDIENTE"
    assert pago["monto_productor"] == 9700.0
    assert pago["tx_hash"].startswith("0x")

    # mismo Idempotency-Key no crea un segundo pago
    r2 = client.post(
        "/v1/pagos",
        headers={**header_cooperativa, "Idempotency-Key": clave},
        json=body,
    )
    assert r2.status_code == 202
    assert r2.json()["id"] == pago["id"]

    detalle = client.get(f"/v1/lotes/{lote['id']}", headers=header_productor).json()
    assert detalle["estado"] == "VENDIDO"


def test_venta_de_lote_no_tostado_rechazada(client, header_cooperativa, header_productor):
    lote = crear_lote(client, header_productor)
    r = client.post(
        "/v1/pagos",
        headers={**header_cooperativa, "Idempotency-Key": str(uuid.uuid4())},
        json={"lote_id": lote["id"], "comprador_id": str(uuid.uuid4()), "monto_total": 1000.0},
    )
    assert r.status_code == 409


def test_rbac_comprador_sin_acceso(client, header_comprador, header_admin):
    assert client.get("/v1/lotes", headers=header_comprador).status_code == 403
    assert client.get("/v1/lotes", headers=header_admin).status_code == 200


def test_sync_batch_202(client, header_productor):
    nuevo = str(uuid.uuid4())
    ops = [
        {
            "id": nuevo,
            "tipo": "registrar_cosecha",
            "finca_id": FINCA,
            "fecha_cosecha": "2026-08-02",
            "peso_kg": 300.0,
        },
        {
            "id": str(uuid.uuid4()),
            "tipo": "avanzar_estado",
            "lote_id": nuevo,
            "evento": {"tipo": "DESPULPADO", "peso_kg": 290.0},
        },
    ]
    r = client.post("/v1/sync", headers=header_productor, json={"operaciones": ops})
    assert r.status_code == 202, r.text
    assert all(resultado["estado"] == "ok" for resultado in r.json()["resultados"])


def test_sync_batch_207_con_conflicto(client, header_productor):
    ops = [
        {
            "id": str(uuid.uuid4()),
            "tipo": "avanzar_estado",
            "lote_id": str(uuid.uuid4()),
            "evento": {"tipo": "DESPULPADO"},
        }
    ]
    r = client.post("/v1/sync", headers=header_productor, json={"operaciones": ops})
    assert r.status_code == 207, r.text
    assert r.json()["resultados"][0]["estado"] == "conflicto"


def test_paginacion_por_cursor(client, header_admin):
    for i in range(3):
        crear_lote(client, header_admin, peso=100.0 + i)
    ids: list[str] = []
    cursor: str | None = None
    while True:
        url = "/v1/lotes?limit=2" + (f"&cursor={cursor}" if cursor else "")
        page = client.get(url, headers=header_admin).json()
        ids.extend(lote["id"] for lote in page["items"])
        cursor = page["next_cursor"]
        if not cursor:
            break
    assert len(ids) == 3
    assert len(set(ids)) == 3


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}