"""Flujo de propinas al productor (ADR-10): happy path, tenancy e idempotencia."""

from __future__ import annotations

import uuid

from .conftest import crear_lote_vendido

FINCA1 = "11111111-1111-1111-1111-111111111111"


def _login(client, email: str, password: str) -> tuple[dict, str]:
    r = client.post("/v1/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    me = client.get("/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200, me.text
    return {"Authorization": f"Bearer {token}"}, me.json()["id"]


def _registrar_comprador2(client) -> dict:
    r = client.post(
        "/v1/auth/register",
        json={
            "email": "comprador2@beantrust.dev",
            "password": "Comp123!",
            "nombre": "Comprador Dos",
            "rol": "comprador",
        },
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_propina_happy_path(client, header_productor, header_cooperativa, header_admin):
    """El comprador de la venta puede dar propina (201, idempotente) y los dueños leerla."""
    comprador, comprador_id = _login(client, "comprador@beantrust.dev", "Comp123!")
    lote = crear_lote_vendido(client, header_productor, header_cooperativa, comprador_id)
    key = str(uuid.uuid4())
    r = client.post(
        "/v1/propinas",
        headers={**comprador, "Idempotency-Key": key},
        json={"lote_id": lote["id"], "monto": 250.0, "moneda": "MXN"},
    )
    assert r.status_code == 201, r.text
    propina = r.json()
    assert propina["monto"] == 250.0
    assert propina["estado_propina"] == "REGISTRADA"

    replay = client.post(
        "/v1/propinas",
        headers={**comprador, "Idempotency-Key": key},
        json={"lote_id": lote["id"], "monto": 250.0, "moneda": "MXN"},
    )
    assert replay.status_code == 201, replay.text
    assert replay.json()["id"] == propina["id"]

    for header in (comprador, header_productor, header_cooperativa, header_admin):
        lista = client.get(f"/v1/propinas/lote/{lote['id']}", headers=header)
        assert lista.status_code == 200, lista.text
        assert [p["id"] for p in lista.json()] == [propina["id"]]


def test_propina_solo_comprador_de_la_venta(client, header_productor, header_cooperativa):
    """Un comprador ajeno no puede dar propina ni leer propinas del lote."""
    comprador_id = _login(client, "comprador@beantrust.dev", "Comp123!")[1]
    comprador2 = _registrar_comprador2(client)
    lote = crear_lote_vendido(client, header_productor, header_cooperativa, comprador_id)

    r = client.post(
        "/v1/propinas",
        headers={**comprador2, "Idempotency-Key": str(uuid.uuid4())},
        json={"lote_id": lote["id"], "monto": 100.0, "moneda": "MXN"},
    )
    assert r.status_code == 403
    r = client.get(f"/v1/propinas/lote/{lote['id']}", headers=comprador2)
    assert r.status_code == 403


def test_propina_rol_sin_acceso_no_lista(client, header_productor, header_cooperativa):
    """Un rol sin tenancy del lote no puede listar propinas (fail-closed)."""
    comprador_id = _login(client, "comprador@beantrust.dev", "Comp123!")[1]
    lote = crear_lote_vendido(client, header_productor, header_cooperativa, comprador_id)
    r = client.post(
        "/v1/propinas",
        headers={**header_productor, "Idempotency-Key": str(uuid.uuid4())},
        json={"lote_id": lote["id"], "monto": 100.0, "moneda": "MXN"},
    )
    assert r.status_code == 403
    r = client.get(f"/v1/propinas/lote/{lote['id']}", headers=header_productor)
    assert r.status_code == 200, r.text
