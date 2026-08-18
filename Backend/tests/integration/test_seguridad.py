"""Tests de seguridad (OWASP): aislamiento entre tenants, rate limiting y uso
de tokens (access vs refresh).
"""

from __future__ import annotations

import uuid

FINCA1 = "11111111-1111-1111-1111-111111111111"
FINCA2 = "22222222-2222-2222-2222-222222222222"


def _crear_lote(client, header, finca: str, peso: float = 400.0) -> dict:
    r = client.post(
        "/v1/lotes",
        headers=header,
        json={"finca_id": finca, "fecha_cosecha": "2026-08-01", "peso_kg": peso},
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_aislamiento_entre_cooperativas(client, header_productor, header_cooperativa):
    """A01: una cooperativa NO puede vender un lote de otra cooperativa."""
    lote = _crear_lote(client, header_productor, FINCA2)
    for tipo, peso in [("DESPULPADO", 380.0), ("DESCASCARADO", 360.0), ("TOSTADO", 340.0)]:
        r = client.post(
            f"/v1/lotes/{lote['id']}/eventos",
            headers={**header_productor, "Idempotency-Key": str(uuid.uuid4())},
            json={"tipo": tipo, "peso_kg": peso},
        )
        assert r.status_code == 201, r.text
    r = client.post(
        "/v1/pagos",
        headers={**header_cooperativa, "Idempotency-Key": str(uuid.uuid4())},
        json={"lote_id": lote["id"], "comprador_id": str(uuid.uuid4()), "monto_total": 5000.0},
    )
    assert r.status_code == 403
    assert "No tiene acceso" in r.json()["detail"]


def test_idor_replay_de_lote_ajeno(client, header_productor, header_cooperativa):
    """A01: reenviar el id de un lote ajeno en POST /v1/lotes no debe revelarlo."""
    lote = _crear_lote(client, header_productor, FINCA2)
    r = client.post(
        "/v1/lotes",
        headers=header_cooperativa,
        json={
            "id": lote["id"],
            "finca_id": FINCA1,
            "fecha_cosecha": "2026-08-01",
            "peso_kg": 100.0,
        },
    )
    assert r.status_code == 403


def test_refresh_token_no_sirve_como_access(client):
    """A07: un refresh token firmado no debe autenticar un endpoint."""
    r = client.post(
        "/v1/auth/login",
        json={"email": "productor@beantrust.dev", "password": "Prod123!"},
    )
    assert r.status_code == 200, r.text
    refresh = r.json()["refresh_token"]
    res = client.get("/v1/lotes", headers={"Authorization": f"Bearer {refresh}"})
    assert res.status_code == 401


def test_refresh_renueva_access_token(client):
    """B6: POST /auth/refresh devuelve un par de tokens válido y firma renovada."""
    r = client.post(
        "/v1/auth/login",
        json={"email": "productor@beantrust.dev", "password": "Prod123!"},
    )
    assert r.status_code == 200, r.text
    tokens = r.json()
    res = client.post("/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert res.status_code == 200, res.text
    nuevo = res.json()
    assert nuevo["token_type"] == "bearer"
    assert nuevo["access_token"] != tokens["access_token"]
    assert nuevo["refresh_token"]
    res = client.get(
        "/v1/lotes", headers={"Authorization": f"Bearer {nuevo['access_token']}"}
    )
    assert res.status_code == 200


def test_rate_limit_login(client):
    """A07: fuerza bruta limitada por IP (429 tras el tope)."""
    for _ in range(20):
        r = client.post("/v1/auth/login", json={"email": "x@y.com", "password": "WrongPass123"})
        assert r.status_code == 401, r.text
    r = client.post("/v1/auth/login", json={"email": "x@y.com", "password": "WrongPass123"})
    assert r.status_code == 429, r.text


def test_verificar_publico_no_filtra_actor_id(client, header_productor):
    """A01/A09: el endpoint público no expone IDs internos de usuarios."""
    lote = _crear_lote(client, header_productor, FINCA1)
    for tipo, peso in [("DESPULPADO", 380.0), ("DESCASCARADO", 360.0), ("TOSTADO", 340.0)]:
        r = client.post(
            f"/v1/lotes/{lote['id']}/eventos",
            headers={**header_productor, "Idempotency-Key": str(uuid.uuid4())},
            json={"tipo": tipo, "peso_kg": peso},
        )
        assert r.status_code == 201, r.text
    detalle = client.get(f"/v1/lotes/{lote['id']}", headers=header_productor).json()
    codigo = detalle["certificado"]["codigo"]
    body = client.get(f"/v1/verificar/{codigo}").json()
    assert "actor_id" not in body["historial"][0]
    assert "comprador_id" not in body["historial"][0]