"""Alta inicial de finca (onboarding, §6, §10).

Cubre idempotencia por `id`, tenencia server-side (el `productor_id` sale del
usuario autenticado y la `cooperativa_id` del servidor) y el rechazo de campos
que el cliente no debe poder fijar.
"""

from __future__ import annotations

import uuid


def _payload(finca_id: uuid.UUID, **over) -> dict:
    base = {
        "id": str(finca_id),
        "nombre": "Finca del productor",
        "municipio": "Coatepec",
        "altitud_min": 1100,
        "altitud_max": 1300,
    }
    base.update(over)
    return base


def test_productor_crea_su_finca(client, header_productor):
    finca_id = uuid.uuid4()
    r = client.post("/v1/fincas", headers=header_productor, json=_payload(finca_id))
    assert r.status_code == 201, r.text
    finca = r.json()
    assert finca["id"] == str(finca_id)
    assert finca["organica"] is False
    # La tenencia no se filtra al cliente.
    assert "productor_id" not in finca
    assert "cooperativa_id" not in finca
    # Aparece en el directorio del productor.
    lista = client.get("/v1/fincas", headers=header_productor).json()
    assert str(finca_id) in {f["id"] for f in lista}


def test_reintento_identico_devuelve_la_misma_finca(client, header_productor):
    finca_id = uuid.uuid4()
    primera = client.post("/v1/fincas", headers=header_productor, json=_payload(finca_id))
    assert primera.status_code == 201, primera.text
    replay = client.post("/v1/fincas", headers=header_productor, json=_payload(finca_id))
    assert replay.status_code == 201, replay.text
    assert replay.json()["id"] == primera.json()["id"]


def test_mismo_id_con_datos_distintos_es_conflicto(client, header_productor):
    finca_id = uuid.uuid4()
    assert (
        client.post("/v1/fincas", headers=header_productor, json=_payload(finca_id)).status_code
        == 201
    )
    r = client.post(
        "/v1/fincas", headers=header_productor, json=_payload(finca_id, nombre="Otra Finca")
    )
    assert r.status_code == 409, r.text


def test_otro_productor_no_reutiliza_el_id(client):
    """El `id` de una finca ajena no se puede reclamar (ni crear con él)."""
    finca_id = uuid.uuid4()

    a = client.post(
        "/v1/auth/register",
        json={"email": "prod-a@beantrust.dev", "password": "ProdA1234!", "nombre": "Productor A"},
    )
    b = client.post(
        "/v1/auth/register",
        json={"email": "prod-b@beantrust.dev", "password": "ProdB1234!", "nombre": "Productor B"},
    )
    header_a = {"Authorization": f"Bearer {a.json()['access_token']}"}
    header_b = {"Authorization": f"Bearer {b.json()['access_token']}"}

    # B empieza sin fincas.
    assert client.get("/v1/fincas", headers=header_b).json() == []
    assert client.post("/v1/fincas", headers=header_a, json=_payload(finca_id)).status_code == 201
    assert client.post("/v1/fincas", headers=header_b, json=_payload(finca_id)).status_code == 403


def test_solo_productor_puede_crear(client, header_cooperativa, header_comprador, header_admin):
    for header in (header_cooperativa, header_comprador, header_admin):
        r = client.post("/v1/fincas", headers=header, json=_payload(uuid.uuid4()))
        assert r.status_code == 403, r.text


def test_rechaza_campos_de_tenencia_del_cliente(client, header_productor):
    r = client.post(
        "/v1/fincas",
        headers=header_productor,
        json={
            **_payload(uuid.uuid4()),
            "productor_id": str(uuid.uuid4()),
            "cooperativa_id": str(uuid.uuid4()),
        },
    )
    assert r.status_code == 422, r.text


def test_altitudes_incoherentes(client, header_productor):
    r = client.post(
        "/v1/fincas",
        headers=header_productor,
        json=_payload(uuid.uuid4(), altitud_min=2000, altitud_max=1000),
    )
    assert r.status_code == 422, r.text


def test_nombre_vacio(client, header_productor):
    r = client.post(
        "/v1/fincas", headers=header_productor, json=_payload(uuid.uuid4(), nombre="   ")
    )
    assert r.status_code == 422, r.text


def test_sin_token(client):
    assert client.post("/v1/fincas", json=_payload(uuid.uuid4())).status_code == 401
