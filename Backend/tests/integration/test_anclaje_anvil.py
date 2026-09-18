"""E2E de anclaje contra Anvil con el contrato real (Fase A, sin keys del usuario).

Levanta un nodo Anvil efímero, despliega `CoffeeTraceability` con cuentas de
prueba del propio nodo, y recorre el worker completo: enqueue → broadcast →
recibo → CONFIRMADA. Se omite si `anvil`/`forge` no están instalados.
"""

from __future__ import annotations

import json
import shutil
import socket
import subprocess
import time
import uuid
from contextlib import suppress
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.models.dominio import CertificadoQR, EstadoAncla, Lote
from app.repositories.in_memory import InMemoryAnclaRepo, Memoria
from app.services.trazabilidad_service import TrazabilidadService, lote_id_a_bytes32

pytestmark = pytest.mark.integration

ANVIL = shutil.which("anvil")
FORGE = shutil.which("forge")
CONTRACTS = Path(__file__).resolve().parents[3] / "contracts"
ARTEFACTO = CONTRACTS / "out" / "CoffeeTraceability.sol" / "CoffeeTraceability.json"

# Cuentas deterministas de Anvil (públicas y sin valor real).
ADMIN_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
ANCHOR_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
ADMIN_ADDR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
ANCHOR_ADDR = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"

requiere_foundry = pytest.mark.skipif(
    ANVIL is None or FORGE is None, reason="anvil/forge no disponibles"
)


def _puerto_libre() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="module")
def anvil():
    subprocess.run([FORGE, "build"], cwd=CONTRACTS, check=True, capture_output=True)
    puerto = _puerto_libre()
    proceso = subprocess.Popen(
        [ANVIL, "--port", str(puerto), "--silent"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    url = f"http://127.0.0.1:{puerto}"
    from web3 import Web3

    w3 = Web3(Web3.HTTPProvider(url, request_kwargs={"timeout": 5}))
    listo = False
    for _ in range(50):
        with suppress(Exception):
            _ = w3.eth.block_number
            listo = True
        if listo:
            break
        time.sleep(0.1)
    if not listo:
        proceso.kill()
        pytest.fail("Anvil no respondió")
    try:
        yield url
    finally:
        proceso.terminate()
        proceso.wait(timeout=10)


@requiere_foundry
def test_anvil_ancla_confirmada_y_cron_sin_trabajo(anvil: str) -> None:
    from web3 import Web3

    w3 = Web3(Web3.HTTPProvider(anvil, request_kwargs={"timeout": 10}))
    artefacto = json.loads(ARTEFACTO.read_text(encoding="utf-8"))
    admin = w3.eth.account.from_key(ADMIN_KEY)
    anchor = w3.eth.account.from_key(ANCHOR_KEY)

    contrato = w3.eth.contract(abi=artefacto["abi"], bytecode=artefacto["bytecode"]["object"])
    tx = contrato.constructor(admin.address, admin.address, anchor.address).transact(
        {"from": admin.address, "gas": 3_000_000, "gasPrice": w3.eth.gas_price}
    )
    recibo = w3.eth.wait_for_transaction_receipt(tx)
    direccion = recibo["contractAddress"]
    assert direccion

    codigo = w3.eth.get_code(direccion)
    huella = w3.keccak(bytes(codigo)).hex()

    from app.repositories.web3_trazabilidad import Web3GatewayTrazabilidad

    gateway = Web3GatewayTrazabilidad(
        rpc_url=anvil,
        private_key=ANCHOR_KEY,
        contract_address=direccion,
        contract_code_hash=huella,
        anchor_address=anchor.address,
        chain_id=w3.eth.chain_id,
        confirmations=1,
        timeout_seconds=10,
        # Anvil arranca con baseFee ~1 gwei: el techo por defecto (0.05 gwei)
        # es para Base Sepolia, no para el nodo local.
        max_priority_fee_gwei=2.0,
        max_fee_gwei=10.0,
    )
    gateway.preflight()

    repo = InMemoryAnclaRepo(Memoria())
    servicio = TrazabilidadService(
        repo_anclas=repo,
        gateway=gateway,
        habilitado=True,
        contrato=direccion,
        code_hash=huella,
        chain_id=w3.eth.chain_id,
        confirmaciones=1,
        explorer_base_url="http://localhost",
        explorer_label="Anvil",
        red_nombre="Anvil",
        max_intentos=3,
        lease_segundos=60,
        max_batch_size=5,
        pending_ttl_segundos=1200,
        deployment_block=0,
        lock_nombre="anvil-anchorer",
        cron_secret="s" * 40,
    )

    lote_id = uuid.uuid4()
    lote = Lote(
        id=lote_id,
        finca_id=uuid.uuid4(),
        codigo_publico="LT-ANVIL",
        fecha_cosecha=datetime.now(UTC).date(),
    )
    qr = CertificadoQR(
        id=uuid.uuid4(), lote_id=lote_id, codigo="BT-ANVIL", hash_sha256="b2" * 32
    )
    servicio.encolar_certificado(qr, lote)

    # El recibo puede no estar disponible en el mismo instante del broadcast:
    # se reintenta el pase hasta confirmar (Anvil mina al instante).
    resumen = servicio.reconciliar()
    for _ in range(3):
        if resumen.confirmadas:
            break
        ancla = repo.buscar_por_lote(lote_id)
        ancla.proximo_intento = datetime.now(UTC) - timedelta(seconds=1)
        ancla.lock_hasta = None
        resumen = servicio.reconciliar()
    assert resumen.confirmadas == 1, resumen
    ancla = repo.buscar_por_lote(lote_id)
    assert ancla.estado is EstadoAncla.CONFIRMADA
    assert ancla.tx_hash
    assert ancla.bloque
    assert ancla.bloque > 0

    # El contrato real confirma la raíz y el actor.
    onchain = gateway.leer_ancla(lote_id_a_bytes32(lote_id))
    assert onchain is not None
    assert onchain.hash_raiz.lower() == "0x" + "b2" * 32

    # Un segundo pase no tiene trabajo pendiente.
    segundo = servicio.reconciliar()
    assert segundo.worker_adquirido is True
    assert segundo.procesadas == 0
