"""Conversión canónica, sanitización, lock/fencing y worker de anclaje."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.models.dominio import (
    AnclaBlockchain,
    CertificadoQR,
    EstadoAncla,
    FencingPerdido,
    Lote,
)
from app.repositories.in_memory import FakeGatewayTrazabilidad, InMemoryAnclaRepo, Memoria
from app.services.trazabilidad_service import (
    TrazabilidadService,
    bytes32_a_hash,
    bytes32_a_lote_id,
    error_sanitizado,
    hash_a_bytes32,
    lote_id_a_bytes32,
)

LOTE_ID = uuid.UUID("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
HASH = "a1" * 32
LOCK = "test-anchorer"


def test_lote_id_a_bytes32_rellena_a_la_derecha() -> None:
    valor = lote_id_a_bytes32(LOTE_ID)
    assert valor == "0x" + LOTE_ID.hex + "0" * 32
    assert len(valor) == 66
    assert bytes32_a_lote_id(valor) == LOTE_ID


def test_hash_a_bytes32_normaliza_prefijo_y_mayusculas() -> None:
    assert hash_a_bytes32(HASH.upper()) == "0x" + HASH
    assert hash_a_bytes32("0x" + HASH) == "0x" + HASH
    assert bytes32_a_hash("0x" + HASH) == HASH


@pytest.mark.parametrize("invalido", ["", "0x1234", "z" * 64])
def test_hash_a_bytes32_rechaza_invalidos(invalido: str) -> None:
    with pytest.raises(ValueError, match="bytes32"):
        hash_a_bytes32(invalido)


def test_error_sanitizado_quita_urls_y_claves() -> None:
    exc = RuntimeError("fallo en https://sepolia.base.org con clave 0x" + "ab" * 32)
    texto = error_sanitizado(exc)
    assert "https://" not in texto
    assert "0x" + "ab" * 32 not in texto
    assert "RuntimeError" in texto


def _servicio(
    repo: InMemoryAnclaRepo,
    gateway: FakeGatewayTrazabilidad,
    *,
    max_intentos: int = 3,
) -> TrazabilidadService:
    return TrazabilidadService(
        repo_anclas=repo,
        gateway=gateway,
        habilitado=True,
        contrato=gateway.contrato,
        code_hash=gateway.code_hash,
        chain_id=gateway.chain_id,
        confirmaciones=gateway.confirmaciones_requeridas,
        explorer_base_url="https://sepolia.basescan.org",
        explorer_label="BaseScan",
        red_nombre="Base Sepolia",
        max_intentos=max_intentos,
        lease_segundos=60,
        max_batch_size=5,
        pending_ttl_segundos=1200,
        deployment_block=0,
        lock_nombre=LOCK,
        cron_secret="s" * 40,
    )


def _encolar(servicio: TrazabilidadService) -> None:
    lote = Lote(
        id=LOTE_ID,
        finca_id=uuid.uuid4(),
        codigo_publico="LT-1",
        fecha_cosecha=datetime.now(UTC).date(),
    )
    qr = CertificadoQR(id=uuid.uuid4(), lote_id=LOTE_ID, codigo="BT-1", hash_sha256=HASH)
    servicio.encolar_certificado(qr, lote)


def _desbloquear(repo: InMemoryAnclaRepo) -> None:
    ancla = repo.buscar_por_lote(LOTE_ID)
    ancla.proximo_intento = datetime.now(UTC) - timedelta(seconds=1)
    ancla.lock_hasta = None


def test_encolar_es_noop_si_deshabilitado() -> None:
    repo = InMemoryAnclaRepo(Memoria())
    servicio = _servicio(repo, FakeGatewayTrazabilidad())
    servicio._habilitado = False
    _encolar(servicio)
    assert repo.buscar_por_lote(LOTE_ID) is None


def test_lock_global_es_excluyente() -> None:
    repo = InMemoryAnclaRepo(Memoria())
    t1 = repo.adquirir_lock(LOCK, 60)
    assert t1 is not None
    assert repo.adquirir_lock(LOCK, 60) is None
    assert repo.liberar_lock(LOCK, t1) is True
    t2 = repo.adquirir_lock(LOCK, 60)
    assert t2 is not None
    assert t2 != t1


def test_fencing_rechaza_token_vencido() -> None:
    repo = InMemoryAnclaRepo(Memoria())
    servicio = _servicio(repo, FakeGatewayTrazabilidad())
    _encolar(servicio)
    token = repo.adquirir_lock(LOCK, 60)
    ancla = repo.reclamar_siguiente(LOCK, token, 60)
    with pytest.raises(FencingPerdido):
        repo.marcar_confirmada(
            ancla.id, uuid.uuid4(), 1, "0x" + "aa" * 32, datetime.now(UTC)
        )


def test_worker_envia_y_espera_confirmaciones() -> None:
    repo = InMemoryAnclaRepo(Memoria())
    gateway = FakeGatewayTrazabilidad(confirmar_al_enviar=False)
    servicio = _servicio(repo, gateway)
    _encolar(servicio)

    resumen = servicio.reconciliar()
    assert resumen.worker_adquirido is True
    assert resumen.enviadas == 1
    assert repo.buscar_por_lote(LOTE_ID).estado is EstadoAncla.ENVIADA

    _desbloquear(repo)
    assert servicio.reconciliar().reprogramadas == 1
    assert repo.buscar_por_lote(LOTE_ID).estado is EstadoAncla.ENVIADA


def test_worker_confirma_tras_dos_confirmaciones() -> None:
    repo = InMemoryAnclaRepo(Memoria())
    gateway = FakeGatewayTrazabilidad(confirmar_al_enviar=False)
    servicio = _servicio(repo, gateway)
    _encolar(servicio)
    servicio.reconciliar()

    gateway.minar_pendientes()
    _desbloquear(repo)
    resumen = servicio.reconciliar()
    assert resumen.confirmadas == 1
    ancla = repo.buscar_por_lote(LOTE_ID)
    assert ancla.estado is EstadoAncla.CONFIRMADA
    assert ancla.tx_hash
    assert ancla.bloque
    assert ancla.confirmada_en


def test_worker_agota_intentos_antes_de_nonce() -> None:
    repo = InMemoryAnclaRepo(Memoria())
    gateway = FakeGatewayTrazabilidad()
    gateway.fallar_nonce = True
    servicio = _servicio(repo, gateway, max_intentos=3)
    _encolar(servicio)

    for _ in range(3):
        _desbloquear(repo)
        servicio.reconciliar()
    ancla = repo.buscar_por_lote(LOTE_ID)
    assert ancla.estado is EstadoAncla.FALLIDA
    assert ancla.codigo_error == "REINTENTOS_AGOTADOS"


def test_worker_recupera_tx_no_persistida_por_evento() -> None:
    repo = InMemoryAnclaRepo(Memoria())
    gateway = FakeGatewayTrazabilidad()
    gateway.perder_respuesta = True
    servicio = _servicio(repo, gateway)
    _encolar(servicio)

    assert servicio.reconciliar().reprogramadas == 1
    ancla = repo.buscar_por_lote(LOTE_ID)
    assert ancla.estado is EstadoAncla.ENVIANDO
    assert ancla.nonce is not None

    _desbloquear(repo)
    assert servicio.reconciliar().reconciliadas == 1
    ancla = repo.buscar_por_lote(LOTE_ID)
    assert ancla.estado is EstadoAncla.CONFIRMADA
    assert ancla.tx_hash
    assert ancla.bloque


def test_worker_ancla_previa_sin_evento_marca_fallida() -> None:
    repo = InMemoryAnclaRepo(Memoria())
    gateway = FakeGatewayTrazabilidad(confirmar_al_enviar=False)
    servicio = _servicio(repo, gateway)
    _encolar(servicio)
    ancla = repo.buscar_por_lote(LOTE_ID)
    gateway.simular_ancla_ajena(ancla.lote_id_bytes32, ancla.hash_raiz)

    assert servicio.reconciliar().fallidas == 1
    ancla = repo.buscar_por_lote(LOTE_ID)
    assert ancla.estado is EstadoAncla.FALLIDA
    assert ancla.codigo_error == "ANCLA_PREVIA"


def test_worker_hash_distinto_marca_fallida() -> None:
    repo = InMemoryAnclaRepo(Memoria())
    gateway = FakeGatewayTrazabilidad(confirmar_al_enviar=False)
    servicio = _servicio(repo, gateway)
    _encolar(servicio)
    ancla = repo.buscar_por_lote(LOTE_ID)
    gateway.simular_ancla_ajena(ancla.lote_id_bytes32, "0x" + "ff" * 32)

    assert servicio.reconciliar().fallidas == 1
    assert repo.buscar_por_lote(LOTE_ID).codigo_error == "HASH_ONCHAIN_DISTINTO"


def test_preflight_permanente_no_firma() -> None:
    repo = InMemoryAnclaRepo(Memoria())
    gateway = FakeGatewayTrazabilidad()
    gateway.fallar_preflight = "ROL_FALTANTE"
    servicio = _servicio(repo, gateway)
    _encolar(servicio)

    resumen = servicio.reconciliar()
    # El preflight lanza fuera del bucle de trabajos: no se procesa ninguno.
    assert resumen.procesadas == 0
    assert repo.buscar_por_lote(LOTE_ID).estado is EstadoAncla.PENDIENTE


def test_confirmacion_insuficiente_devuelve_none() -> None:
    gateway = FakeGatewayTrazabilidad(confirmaciones_requeridas=2)
    transaccion = gateway.preparar_ancla("0x" + "aa" * 32, "0x" + HASH, 0)
    tx = gateway.transmitir_ancla(transaccion)
    gateway.confirmaciones = 1
    assert gateway.confirmar_ancla(tx, "0x" + "aa" * 32, "0x" + HASH) is None
    gateway.confirmaciones = 2
    assert gateway.confirmar_ancla(tx, "0x" + "aa" * 32, "0x" + HASH) is not None


def test_ancla_blockchain_por_defecto_pendiente() -> None:
    ancla = AnclaBlockchain(
        id=uuid.uuid4(),
        qr_certificado_id=uuid.uuid4(),
        lote_id=LOTE_ID,
        lote_id_bytes32=lote_id_a_bytes32(LOTE_ID),
        hash_raiz="0x" + HASH,
        chain_id=84532,
    )
    assert ancla.estado is EstadoAncla.PENDIENTE
    assert ancla.intentos == 0
    assert ancla.nonce is None


def test_reclamar_exige_lease_vigente() -> None:
    repo = InMemoryAnclaRepo(Memoria())
    servicio = _servicio(repo, FakeGatewayTrazabilidad())
    _encolar(servicio)
    token = repo.adquirir_lock(LOCK, 60)
    # Token ajeno: no reclama aunque haya trabajo listo.
    assert repo.reclamar_siguiente(LOCK, uuid.uuid4(), 60) is None
    assert repo.reclamar_siguiente(LOCK, token, 60) is not None


def test_lease_perdido_detiene_el_worker(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = InMemoryAnclaRepo(Memoria())
    servicio = _servicio(repo, FakeGatewayTrazabilidad())
    _encolar(servicio)
    monkeypatch.setattr(repo, "renovar_lock", lambda *a, **k: False)

    resumen = servicio.reconciliar()
    assert resumen.worker_adquirido is True
    assert resumen.procesadas == 0
    assert repo.buscar_por_lote(LOTE_ID).estado is EstadoAncla.PENDIENTE


def test_saldo_insuficiente_no_deja_enviando() -> None:
    repo = InMemoryAnclaRepo(Memoria())
    gateway = FakeGatewayTrazabilidad()
    gateway.fallar_saldo = True
    servicio = _servicio(repo, gateway, max_intentos=1)
    _encolar(servicio)

    assert servicio.reconciliar().fallidas == 1
    ancla = repo.buscar_por_lote(LOTE_ID)
    assert ancla.estado is EstadoAncla.FALLIDA
    assert ancla.codigo_error == "REINTENTOS_AGOTADOS"
    assert ancla.nonce is None
    assert ancla.tx_hash is None


def test_fee_cap_bajo_reprograma_sin_firmar() -> None:
    repo = InMemoryAnclaRepo(Memoria())
    gateway = FakeGatewayTrazabilidad()
    gateway.fallar_fee_cap = True
    servicio = _servicio(repo, gateway)
    _encolar(servicio)

    assert servicio.reconciliar().reprogramadas == 1
    ancla = repo.buscar_por_lote(LOTE_ID)
    assert ancla.estado is EstadoAncla.PENDIENTE
    assert ancla.tx_hash is None


def test_tx_hash_persistido_antes_del_broadcast() -> None:
    repo = InMemoryAnclaRepo(Memoria())
    gateway = FakeGatewayTrazabilidad()
    gateway.perder_respuesta = True
    servicio = _servicio(repo, gateway)
    _encolar(servicio)

    assert servicio.reconciliar().reprogramadas == 1
    ancla = repo.buscar_por_lote(LOTE_ID)
    assert ancla.estado is EstadoAncla.ENVIANDO
    assert ancla.tx_hash is not None
    assert ancla.nonce is not None


def test_timeout_se_reconcilia_por_el_mismo_hash() -> None:
    repo = InMemoryAnclaRepo(Memoria())
    gateway = FakeGatewayTrazabilidad()
    gateway.perder_respuesta = True
    servicio = _servicio(repo, gateway)
    _encolar(servicio)

    servicio.reconciliar()
    hash_persistido = repo.buscar_por_lote(LOTE_ID).tx_hash
    assert hash_persistido
    assert len(gateway._txs) == 1

    _desbloquear(repo)
    assert servicio.reconciliar().reconciliadas == 1
    ancla = repo.buscar_por_lote(LOTE_ID)
    assert ancla.estado is EstadoAncla.CONFIRMADA
    assert ancla.tx_hash == hash_persistido
    # No se envió una segunda transacción para el mismo lote.
    assert len(gateway._txs) == 1
