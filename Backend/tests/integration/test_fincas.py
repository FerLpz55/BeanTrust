"""B15 · `GET /v1/fincas`: directorio de fincas del usuario (§6, §10).

El móvil necesita este endpoint para resolver el `finca_id` obligatorio de
`POST /v1/lotes`. Los fixtures de `conftest` siembran dos fincas del mismo
productor bajo cooperativas distintas, lo que permite probar el aislamiento.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.integration

ESPERANZA = "11111111-1111-1111-1111-111111111111"
ENCANTO = "22222222-2222-2222-2222-222222222222"


def test_productor_ve_todas_sus_fincas(
    client: TestClient, header_productor: dict[str, str]
) -> None:
    r = client.get("/v1/fincas", headers=header_productor)
    assert r.status_code == 200, r.text
    ids = {f["id"] for f in r.json()}
    assert ids == {ESPERANZA, ENCANTO}


def test_cooperativa_solo_ve_las_fincas_de_sus_productores(
    client: TestClient, header_cooperativa: dict[str, str]
) -> None:
    """La segunda finca pertenece a otra cooperativa: no debe aparecer."""
    r = client.get("/v1/fincas", headers=header_cooperativa)
    assert r.status_code == 200, r.text
    ids = {f["id"] for f in r.json()}
    assert ids == {ESPERANZA}


def test_admin_ve_todas(client: TestClient, header_admin: dict[str, str]) -> None:
    r = client.get("/v1/fincas", headers=header_admin)
    assert r.status_code == 200, r.text
    assert {f["id"] for f in r.json()} == {ESPERANZA, ENCANTO}


def test_comprador_no_tiene_acceso(
    client: TestClient, header_comprador: dict[str, str]
) -> None:
    """Matriz §10: el comprador no lee `finca` (solo verifica por QR público)."""
    r = client.get("/v1/fincas", headers=header_comprador)
    assert r.status_code == 403, r.text


def test_sin_token_rechaza(client: TestClient) -> None:
    assert client.get("/v1/fincas").status_code == 401


def test_forma_del_payload(client: TestClient, header_productor: dict[str, str]) -> None:
    """El contrato expone datos de finca, nunca ids de titularidad (tenancy)."""
    finca = next(f for f in client.get("/v1/fincas", headers=header_productor).json()
                 if f["id"] == ESPERANZA)
    assert finca["nombre"] == "Finca La Esperanza"
    assert finca["municipio"] == "Coatepec"
    assert finca["organica"] is True
    assert "productor_id" not in finca
    assert "cooperativa_id" not in finca
