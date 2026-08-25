"""`GET /v1/compradores` (directorio para elegir `comprador_id` al vender, §6)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.integration


def test_cooperativa_lista_compradores(
    client: TestClient, header_cooperativa: dict[str, str]
) -> None:
    r = client.get("/v1/compradores", headers=header_cooperativa)
    assert r.status_code == 200, r.text
    emails = [u["email"] for u in r.json()]
    assert "comprador@beantrust.dev" in emails


def test_admin_lista_compradores(client: TestClient, header_admin: dict[str, str]) -> None:
    r = client.get("/v1/compradores", headers=header_admin)
    assert r.status_code == 200, r.text


def test_productor_no_lista_compradores(
    client: TestClient, header_productor: dict[str, str]
) -> None:
    r = client.get("/v1/compradores", headers=header_productor)
    assert r.status_code == 403


def test_comprador_no_lista_compradores(
    client: TestClient, header_comprador: dict[str, str]
) -> None:
    r = client.get("/v1/compradores", headers=header_comprador)
    assert r.status_code == 403
