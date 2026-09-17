"""Anclaje on-chain del Pasaporte (ADR-11): cola, worker y verificación pública.

Usa el gateway fake (sin cadena) y el almacén en memoria; el contrato real se
prueba en `contracts/test/CoffeeTraceability.t.sol` y en el E2E de Anvil.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app import dependencies as deps
from app.core.config import Settings
from app.repositories.in_memory import FakeGatewayTrazabilidad, Memoria
from app.services.trazabilidad_service import (
    bytes32_a_lote_id,
    hash_a_bytes32,
    lote_id_a_bytes32,
)

from .conftest import crear_lote_tostado

pytestmark = pytest.mark.integration

CRON_SECRET = "cron-secreto-de-test-con-mas-de-32-bytes"
CONTRATO = "0x" + "ab" * 20
CODE_HASH = "0x" + "cd" * 32


def activar_anclaje(
    client: TestClient,
    *,
    cron_secret: str = CRON_SECRET,
    max_intentos: int = 8,
) -> Settings:
    settings = Settings(
        _env_file=None,
        jwt_secret="x" * 40,
        web3_mode="anchor",
        web3_contract_address=CONTRATO,
        web3_contract_code_hash=CODE_HASH,
        web3_pauser_address="0x" + "ef" * 20,
        web3_backend_private_key="0x" + "11" * 32,
        web3_cron_secret=cron_secret,
        web3_confirmations=2,
        web3_network_name="Base Sepolia",
        web3_explorer_label="BaseScan",
        web3_max_intentos=max_intentos,
    )
    client.app.dependency_overrides[deps.get_settings] = lambda: settings
    return settings


def cron(client: TestClient, secret: str | None = CRON_SECRET):
    headers = {"Authorization": f"Bearer {secret}"} if secret is not None else {}
    return client.get("/v1/blockchain/reconciliar", headers=headers)


def _desbloquear(memoria: Memoria) -> None:
    """Adelanta el backoff para no dormir el test."""
    ahora = datetime.now(UTC)
    for ancla in memoria.anclas.values():
        ancla.proximo_intento = ahora - timedelta(seconds=1)
        ancla.lock_hasta = None


def _pasaporte(client: TestClient, codigo: str) -> dict:
    r = client.get(f"/v1/verificar/{codigo}")
    assert r.status_code == 200, r.text
    return r.json()


def _lote_tostado(client: TestClient, header) -> tuple[dict, str]:
    lote = crear_lote_tostado(client, header)
    detalle = client.get(f"/v1/lotes/{lote['id']}", headers=header).json()
    return lote, detalle["certificado"]["codigo"]


def test_sin_ancla_cuando_web3_desactivado(client: TestClient, header_productor) -> None:
    lote = crear_lote_tostado(client, header_productor)
    detalle = client.get(f"/v1/lotes/{lote['id']}", headers=header_productor).json()
    codigo = detalle["certificado"]["codigo"]

    assert _pasaporte(client, codigo)["anclaje_onchain"] is None

    # El cron responde sin secreto cuando no hay nada que reconciliar.
    r = cron(client, secret=None)
    assert r.status_code == 200, r.text
    assert r.headers.get("Cache-Control") == "no-store"
    assert r.json()["habilitado"] is False
    assert r.json()["worker_adquirido"] is False


def test_flujo_confirmado_y_verificacion_publica(
    client: TestClient,
    header_productor,
    gateway_trazabilidad: FakeGatewayTrazabilidad,
) -> None:
    activar_anclaje(client)
    lote, codigo = _lote_tostado(client, header_productor)

    pendiente = _pasaporte(client, codigo)["anclaje_onchain"]
    assert pendiente["estado"] == "PENDIENTE"
    assert pendiente["chain_id"] == 84532
    assert pendiente["red_nombre"] == "Base Sepolia"
    assert pendiente["explorer_etiqueta"] == "BaseScan"

    r = cron(client)
    assert r.status_code == 200, r.text
    assert r.json()["worker_adquirido"] is True
    assert r.json()["confirmadas"] == 1

    anclaje = _pasaporte(client, codigo)["anclaje_onchain"]
    assert anclaje["estado"] == "CONFIRMADA"
    assert anclaje["contrato"] == CONTRATO
    assert anclaje["tx_hash"].startswith("0x")
    assert anclaje["bloque"] >= 0
    assert anclaje["confirmada_en"]
    assert anclaje["explorer_url"].startswith("https://sepolia.basescan.org/tx/")

    assert anclaje["hash_raiz"] == hash_a_bytes32(
        client.get(f"/v1/lotes/{lote['id']}", headers=header_productor).json()[
            "certificado"
        ]["hash_sha256"]
    )
    assert bytes32_a_lote_id(lote_id_a_bytes32(uuid.UUID(lote["id"]))) == uuid.UUID(
        lote["id"]
    )


def test_reconciliar_exige_bearer(client: TestClient, header_productor) -> None:
    activar_anclaje(client)
    crear_lote_tostado(client, header_productor)

    assert cron(client, secret=None).status_code == 401
    assert cron(client, secret="incorrecto").status_code == 401
    assert cron(client).status_code == 200


def test_estado_enviada_y_confirmacion_posterior(
    client: TestClient,
    header_productor,
    gateway_trazabilidad: FakeGatewayTrazabilidad,
    memoria: Memoria,
) -> None:
    gateway_trazabilidad.confirmar_al_enviar = False
    activar_anclaje(client)
    _lote, codigo = _lote_tostado(client, header_productor)

    r = cron(client)
    assert r.json()["enviadas"] == 1
    enviada = _pasaporte(client, codigo)["anclaje_onchain"]
    assert enviada["estado"] == "ENVIADA"
    assert enviada["tx_hash"]

    gateway_trazabilidad.minar_pendientes()
    _desbloquear(memoria)
    r = cron(client)
    assert r.json()["confirmadas"] + r.json()["reconciliadas"] >= 1
    assert _pasaporte(client, codigo)["anclaje_onchain"]["estado"] == "CONFIRMADA"


def test_reintento_admin_de_fallo_reintentable(
    client: TestClient,
    header_productor,
    header_admin,
    gateway_trazabilidad: FakeGatewayTrazabilidad,
) -> None:
    # Con max_intentos=1, un fallo transitorio antes del nonce pasa a FALLIDA.
    gateway_trazabilidad.fallar_nonce = True
    activar_anclaje(client, max_intentos=1)
    lote, codigo = _lote_tostado(client, header_productor)

    assert cron(client).json()["fallidas"] == 1
    assert _pasaporte(client, codigo)["anclaje_onchain"]["estado"] == "FALLIDA"

    gateway_trazabilidad.fallar_nonce = False
    assert (
        client.post(
            f"/v1/blockchain/anclas/{lote['id']}/reintentar", headers=header_productor
        ).status_code
        == 403
    )
    r = client.post(f"/v1/blockchain/anclas/{lote['id']}/reintentar", headers=header_admin)
    assert r.status_code == 200, r.text
    assert r.json()["estado"] == "PENDIENTE"


def test_hash_distinto_es_definitivo(
    client: TestClient,
    header_productor,
    header_admin,
    gateway_trazabilidad: FakeGatewayTrazabilidad,
    memoria: Memoria,
) -> None:
    activar_anclaje(client)
    lote, codigo = _lote_tostado(client, header_productor)

    ancla = next(iter(memoria.anclas.values()))
    gateway_trazabilidad.simular_ancla_ajena(ancla.lote_id_bytes32, "0x" + "ff" * 32)

    assert cron(client).json()["fallidas"] == 1
    assert _pasaporte(client, codigo)["anclaje_onchain"]["estado"] == "FALLIDA"
    # Un hash distinto on-chain es definitivo: no se reintenta.
    r = client.post(f"/v1/blockchain/anclas/{lote['id']}/reintentar", headers=header_admin)
    assert r.status_code == 409


def test_reintento_lote_sin_ancla_404(client: TestClient, header_admin) -> None:
    activar_anclaje(client)
    r = client.post(f"/v1/blockchain/anclas/{uuid.uuid4()}/reintentar", headers=header_admin)
    assert r.status_code == 404


def test_verificar_responde_200_si_la_cola_falla(
    client: TestClient,
    header_productor,
    gateway_trazabilidad: FakeGatewayTrazabilidad,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """El Pasaporte público nunca falla por la cola ni por el RPC."""
    activar_anclaje(client)
    _lote, codigo = _lote_tostado(client, header_productor)

    monkeypatch.setattr(
        "app.repositories.in_memory.InMemoryAnclaRepo.buscar_por_lote",
        lambda self, lote_id: (_ for _ in ()).throw(RuntimeError("RPC caído")),
    )
    r = client.get(f"/v1/verificar/{codigo}")
    assert r.status_code == 200, r.text
    assert r.json()["anclaje_onchain"] is None
