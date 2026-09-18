"""Gateway real de anclaje: normalización de hashes, dirección y tarifas.

No toca la red: el `Web3` se sustituye por dobles para probar la política de
tarifas y la firma en memoria sin firmar de verdad. El contrato real se prueba
en `contracts/` y el E2E de Anvil en `test_anclaje_anvil.py`.
"""

from __future__ import annotations

from typing import Any

import pytest
from hexbytes import HexBytes
from web3 import Web3

from app.models.dominio import ErrorAnclajePermanente, ErrorAnclajeTransitorio
from app.repositories.web3_trazabilidad import Web3GatewayTrazabilidad

# Cuenta 0 de Anvil: la private key deriva esta dirección (pública).
PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
DIRECCION_ESPERADA = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"


def _gateway(contract_code_hash: str = "", **kwargs) -> Web3GatewayTrazabilidad:
    return Web3GatewayTrazabilidad(
        rpc_url="http://127.0.0.1:0",
        private_key=PRIVATE_KEY,
        contract_address="0x" + "ab" * 20,
        contract_code_hash=contract_code_hash,
        chain_id=84532,
        confirmations=2,
        **kwargs,
    )


class _EthFalso:
    def __init__(
        self,
        *,
        base_fee: int = 1_000_000_000,
        priority: int = 1_000_000_000,
        saldo: int = 10**20,
        chain_id: int = 84532,
    ) -> None:
        self.base_fee = base_fee
        self.priority = priority
        self.saldo = saldo
        self.chain_id = chain_id
        self.gas_price = base_fee

    def get_block(self, _tag: str) -> dict[str, int]:
        return {"baseFeePerGas": self.base_fee}

    @property
    def max_priority_fee(self) -> int:
        return self.priority

    def get_balance(self, _addr: str) -> int:
        return self.saldo

    def get_transaction_count(self, _addr: str, _tag: str) -> int:
        return 7


class _W3Falso:
    def __init__(self, eth: _EthFalso) -> None:
        self.eth = eth
        self.to_wei = staticmethod(Web3.to_wei)

    @staticmethod
    def keccak(_data: bytes) -> bytes:
        return b"\x11" * 32


def test_hash_de_web3_siempre_lleva_prefijo() -> None:
    """Regresión: `HexBytes.hex()` omite `0x`; por eso se usa `Web3.to_hex`."""
    crudo = HexBytes(b"\x01" * 32)
    assert not crudo.hex().startswith("0x")
    assert Web3.to_hex(crudo).startswith("0x")


def test_code_hash_sin_prefijo_se_normaliza() -> None:
    gateway = _gateway(contract_code_hash="cd" * 32)
    assert gateway.code_hash == "0x" + "cd" * 32


def test_private_key_deriva_la_direccion_caliente() -> None:
    gateway = _gateway()
    assert gateway.direccion == DIRECCION_ESPERADA


def test_tarifa_normal_respeta_la_sugerencia() -> None:
    gateway = _gateway(max_priority_fee_gwei=0.01, max_fee_gwei=0.05)
    gateway._w3 = _W3Falso(_EthFalso(base_fee=1_000_000, priority=1_000_000))
    base_fee, prioridad, max_fee = gateway._calcular_tarifas()
    assert prioridad == 1_000_000
    assert max_fee == 2 * base_fee + prioridad


def test_tarifa_se_limita_al_techo_de_prioridad() -> None:
    gateway = _gateway(max_priority_fee_gwei=0.01, max_fee_gwei=1.0)
    # Sugerencia 1 gwei, techo 0.01 gwei: la prioridad se recorta.
    gateway._w3 = _W3Falso(_EthFalso(base_fee=1_000_000, priority=1_000_000_000))
    _base, prioridad, max_fee = gateway._calcular_tarifas()
    assert prioridad == Web3.to_wei(0.01, "gwei")
    assert max_fee == min(2 * 1_000_000 + prioridad, Web3.to_wei(1.0, "gwei"))


def test_cap_insuficiente_no_firma_ni_envia() -> None:
    gateway = _gateway(max_priority_fee_gwei=0.01, max_fee_gwei=0.05)
    # baseFee 1 gwei supera el techo de 0.05 gwei.
    gateway._w3 = _W3Falso(_EthFalso(base_fee=1_000_000_000, priority=1_000_000_000))
    gateway._contrato = _ContratoFalso()
    gateway._cuenta = _CuentaFalsa()
    with pytest.raises(ErrorAnclajeTransitorio) as exc:
        gateway.preparar_ancla("0x" + "aa" * 32, "0x" + "bb" * 32, 0)
    assert exc.value.codigo == "FEE_CAP_TOO_LOW"


def test_saldo_insuficiente_no_firma_ni_envia() -> None:
    gateway = _gateway(max_priority_fee_gwei=0.01, max_fee_gwei=0.05)
    gateway._w3 = _W3Falso(_EthFalso(base_fee=1_000_000, saldo=0))
    gateway._contrato = _ContratoFalso()
    gateway._cuenta = _CuentaFalsa()
    with pytest.raises(ErrorAnclajeTransitorio) as exc:
        gateway.preparar_ancla("0x" + "aa" * 32, "0x" + "bb" * 32, 0)
    assert exc.value.codigo == "SALDO_INSUFICIENTE"


def test_preparar_devuelve_tx_hash_normalizado_y_firma_en_memoria() -> None:
    gateway = _gateway(max_priority_fee_gwei=0.01, max_fee_gwei=1.0)
    gateway._w3 = _W3Falso(_EthFalso(base_fee=1_000_000, saldo=10**20))
    gateway._contrato = _ContratoFalso()
    gateway._cuenta = _CuentaFalsa()
    transaccion = gateway.preparar_ancla("0x" + "aa" * 32, "0x" + "bb" * 32, 3)
    assert transaccion.tx_hash.startswith("0x")
    assert len(transaccion.tx_hash) == 66
    assert transaccion.raw_transaction == b"raw-firmada"


def test_cadena_incorrecta_es_permanente() -> None:
    gateway = _gateway()
    gateway._w3 = _W3Falso(_EthFalso(chain_id=1))
    with pytest.raises(ErrorAnclajePermanente) as exc:
        gateway._verificar_red()
    assert exc.value.codigo == "CADENA_INCORRECTA"


class _FuncionFalsa:
    def estimate_gas(self, _tx: dict[str, Any]) -> int:
        return 100_000

    def build_transaction(self, tx: dict[str, Any]) -> dict[str, Any]:
        return dict(tx)


class _ContratoFalso:
    class _Functions:
        @staticmethod
        def anchorHash(_lote, _hash):
            return _FuncionFalsa()

    functions = _Functions()


class _FirmadaFalsa:
    raw_transaction = b"raw-firmada"


class _CuentaFalsa:
    address = DIRECCION_ESPERADA

    @staticmethod
    def sign_transaction(_tx: dict[str, Any]) -> _FirmadaFalsa:
        return _FirmadaFalsa()
