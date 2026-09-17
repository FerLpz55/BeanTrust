"""Gateway de anclaje contra Base Sepolia con `web3.py` (ADR-11).

Frontera de infraestructura: el servicio habla con `GatewayTrazabilidad`, no con
`web3`. Importa `web3` de forma perezosa para que el backend arranque aunque la
dependencia no esté instalada cuando el anclaje está desactivado.

Endurecimiento (fase de hardening):
- preflight de cadena, bytecode, huella del runtime y `ANCHOR_ROLE` antes de firmar;
- nonce reservado con `eth_getTransactionCount(..., "pending")`;
- EIP-1559 con estimación de gas y `maxFeePerGas >= maxPriorityFeePerGas`;
- confirmación por tx (remitente/contrato) + recibo + evento + confirmaciones;
- recuperación por logs `HashAnchored` si el `tx_hash` no se persistió.

La ABI versionada vive en `contracts/abi/CoffeeTraceability.json`; si el backend
se despliega sin ese archivo se usa una ABI mínima embebida.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.models.dominio import (
    AnclaOnchain,
    ErrorAnclajePermanente,
    ErrorAnclajeTransitorio,
    ReciboAncla,
)

# Solo lo que el worker usa (misma firma que `contracts/src/CoffeeTraceability.sol`).
_ABI_MINIMA = [
    {
        "type": "function",
        "name": "anchorHash",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "loteId", "type": "bytes32"},
            {"name": "hashRaiz", "type": "bytes32"},
        ],
        "outputs": [],
    },
    {
        "type": "function",
        "name": "isAnchored",
        "stateMutability": "view",
        "inputs": [{"name": "loteId", "type": "bytes32"}],
        "outputs": [{"name": "", "type": "bool"}],
    },
    {
        "type": "function",
        "name": "getAnchor",
        "stateMutability": "view",
        "inputs": [{"name": "loteId", "type": "bytes32"}],
        "outputs": [
            {"name": "hashRaiz", "type": "bytes32"},
            {"name": "actor", "type": "address"},
            {"name": "anchoredAt", "type": "uint256"},
        ],
    },
    {
        "type": "function",
        "name": "hasRole",
        "stateMutability": "view",
        "inputs": [
            {"name": "role", "type": "bytes32"},
            {"name": "account", "type": "address"},
        ],
        "outputs": [{"name": "", "type": "bool"}],
    },
    {
        "type": "function",
        "name": "defaultAdminDelay",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"name": "", "type": "uint48"}],
    },
    {
        "type": "event",
        "name": "HashAnchored",
        "anonymous": False,
        "inputs": [
            {"name": "loteId", "type": "bytes32", "indexed": True},
            {"name": "hashRaiz", "type": "bytes32", "indexed": True},
            {"name": "actor", "type": "address", "indexed": True},
            {"name": "anchoredAt", "type": "uint256", "indexed": False},
        ],
    },
]

_ABI_VERSIONADA = (
    Path(__file__).resolve().parents[3] / "contracts" / "abi" / "CoffeeTraceability.json"
)


def _cargar_abi() -> list:
    try:
        return json.loads(_ABI_VERSIONADA.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return _ABI_MINIMA


def _a_bytes32(hexstr: str) -> bytes:
    limpio = hexstr[2:] if hexstr.startswith("0x") else hexstr
    return bytes.fromhex(limpio)


def _de_bytes32(valor: bytes) -> str:
    return "0x" + valor.hex()


class Web3GatewayTrazabilidad:
    """Implementación real: EIP-1559 desde la wallet caliente del backend."""

    def __init__(
        self,
        *,
        rpc_url: str,
        private_key: str,
        contract_address: str,
        contract_code_hash: str,
        chain_id: int,
        confirmations: int,
        timeout_seconds: int = 10,
    ) -> None:
        from web3 import Web3

        self._w3 = Web3(
            Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": timeout_seconds})
        )
        self._cuenta = self._w3.eth.account.from_key(private_key)
        self._direccion = Web3.to_checksum_address(contract_address)
        self._contrato = self._w3.eth.contract(address=self._direccion, abi=_cargar_abi())
        self._chain_id = chain_id
        huella = contract_code_hash.strip().lower()
        if huella and not huella.startswith("0x"):
            huella = "0x" + huella
        self._code_hash = huella
        self._confirmaciones = confirmations
        self._preflight_ok = False

    @property
    def chain_id(self) -> int:
        return self._chain_id

    @property
    def contrato(self) -> str:
        return self._direccion

    @property
    def code_hash(self) -> str:
        return self._code_hash

    @property
    def direccion(self) -> str:
        """Dirección pública de la wallet de anclaje (nunca la clave)."""
        return self._cuenta.address

    # ------------------------------------------------------------- preflight

    def preflight(self) -> None:
        if self._preflight_ok:
            return
        self._verificar_red()
        try:
            codigo = self._w3.eth.get_code(self._direccion)
        except Exception as exc:
            raise ErrorAnclajeTransitorio(f"RPC inalcanzable: {exc}") from exc
        if not codigo:
            raise ErrorAnclajePermanente(
                "El contrato no tiene bytecode en la cadena.",
                codigo="BYTECODE_INCORRECTO",
            )
        huella = self._w3.keccak(bytes(codigo)).hex().lower()
        if not huella.startswith("0x"):
            huella = "0x" + huella
        if self._code_hash and huella != self._code_hash:
            raise ErrorAnclajePermanente(
                "La huella del runtime no coincide con BEAN_WEB3_CONTRACT_CODE_HASH.",
                codigo="BYTECODE_INCORRECTO",
            )
        try:
            rol = self._w3.keccak(text="ANCHOR_ROLE")
            tiene_rol = self._contrato.functions.hasRole(rol, self._cuenta.address).call()
        except Exception as exc:
            raise ErrorAnclajeTransitorio(f"RPC inalcanzable: {exc}") from exc
        if not tiene_rol:
            raise ErrorAnclajePermanente(
                "La wallet caliente no tiene ANCHOR_ROLE.",
                codigo="ROL_FALTANTE",
            )
        self._preflight_ok = True

    # -------------------------------------------------- diagnóstico (smoke)

    def tiene_rol(self, rol: str, direccion: str) -> bool:
        """Consulta `hasRole(keccak256(rol), direccion)` para el smoke."""
        from web3 import Web3

        self._verificar_red()
        try:
            return bool(
                self._contrato.functions.hasRole(
                    self._w3.keccak(text=rol), Web3.to_checksum_address(direccion)
                ).call()
            )
        except Exception as exc:
            raise ErrorAnclajeTransitorio(f"No se pudo consultar el rol: {exc}") from exc

    def retardo_admin_segundos(self) -> int:
        """`defaultAdminDelay()` (48 h = 172800 s) para el smoke."""
        self._verificar_red()
        try:
            return int(self._contrato.functions.defaultAdminDelay().call())
        except Exception as exc:
            raise ErrorAnclajeTransitorio(f"No se pudo leer el retardo admin: {exc}") from exc

    # ----------------------------------------------------------------- lecturas

    def leer_ancla(self, lote_id_bytes32: str) -> AnclaOnchain | None:
        self._verificar_red()
        try:
            anclado = self._contrato.functions.isAnchored(
                _a_bytes32(lote_id_bytes32)
            ).call()
            if not anclado:
                return None
            hash_raiz, actor, anchored_at = self._contrato.functions.getAnchor(
                _a_bytes32(lote_id_bytes32)
            ).call()
        except Exception as exc:
            raise ErrorAnclajeTransitorio(f"No se pudo leer el anclaje: {exc}") from exc
        return AnclaOnchain(
            hash_raiz=_de_bytes32(hash_raiz), actor=actor, anchored_at=int(anchored_at)
        )

    def buscar_ancla_por_evento(
        self, lote_id_bytes32: str, hash_raiz_bytes32: str, desde_bloque: int
    ) -> ReciboAncla | None:
        self._verificar_red()
        try:
            logs = self._contrato.events.HashAnchored().get_logs(
                from_block=desde_bloque,
                argument_filters={
                    "loteId": _a_bytes32(lote_id_bytes32),
                    "hashRaiz": _a_bytes32(hash_raiz_bytes32),
                },
            )
        except Exception as exc:
            raise ErrorAnclajeTransitorio(f"No se pudo buscar el evento: {exc}") from exc
        for log in logs:
            recibo = self._validar_recibo(
                log["transactionHash"].hex(), lote_id_bytes32, hash_raiz_bytes32
            )
            if recibo is not None:
                return recibo
        return None

    # ---------------------------------------------------------------- nonce

    def reservar_nonce(self) -> int:
        self._verificar_red()
        try:
            return int(
                self._w3.eth.get_transaction_count(self._cuenta.address, "pending")
            )
        except Exception as exc:
            raise ErrorAnclajeTransitorio(f"No se pudo reservar nonce: {exc}") from exc

    # ------------------------------------------------------------ transmisión

    def enviar_ancla(
        self, lote_id_bytes32: str, hash_raiz_bytes32: str, nonce: int
    ) -> str:
        from web3.exceptions import ContractLogicError

        self._verificar_red()
        try:
            funcion = self._contrato.functions.anchorHash(
                _a_bytes32(lote_id_bytes32), _a_bytes32(hash_raiz_bytes32)
            )
            gas = int(funcion.estimate_gas({"from": self._cuenta.address}) * 1.2)
            base_fee = int(
                self._w3.eth.get_block("latest").get("baseFeePerGas")
                or self._w3.eth.gas_price
            )
            prioridad = self._w3.to_wei(1, "gwei")
            max_fee = base_fee * 2 + prioridad
            tx = funcion.build_transaction(
                {
                    "from": self._cuenta.address,
                    "nonce": nonce,
                    "chainId": self._chain_id,
                    "gas": gas,
                    "maxFeePerGas": max_fee,
                    "maxPriorityFeePerGas": prioridad,
                }
            )
            firmada = self._cuenta.sign_transaction(tx)
            enviada = self._w3.eth.send_raw_transaction(firmada.raw_transaction)
            return enviada.hex()
        except ContractLogicError as exc:
            raise ErrorAnclajePermanente(
                f"Revert del contrato: {exc}", codigo="REVERT"
            ) from exc
        except ErrorAnclajePermanente:
            raise
        except Exception as exc:
            raise ErrorAnclajeTransitorio(
                f"No se pudo transmitir el anclaje: {exc}", codigo="BROADCAST_INCIERTO"
            ) from exc

    # ------------------------------------------------------------ confirmación

    def confirmar_ancla(
        self, tx_hash: str, lote_id_bytes32: str, hash_raiz_bytes32: str
    ) -> ReciboAncla | None:
        return self._validar_recibo(tx_hash, lote_id_bytes32, hash_raiz_bytes32)

    def _validar_recibo(
        self, tx_hash: str, lote_id_bytes32: str, hash_raiz_bytes32: str
    ) -> ReciboAncla | None:
        from web3.exceptions import TransactionNotFound

        self._verificar_red()
        try:
            tx = self._w3.eth.get_transaction(tx_hash)
            recibo = self._w3.eth.get_transaction_receipt(tx_hash)
        except TransactionNotFound:
            return None
        except Exception as exc:
            raise ErrorAnclajeTransitorio(f"No se pudo leer el recibo: {exc}") from exc

        if (tx.get("to") or "").lower() != self._direccion.lower():
            raise ErrorAnclajePermanente(
                "La transacción no apunta al contrato de anclaje.",
                codigo="CONTRATO_INCORRECTO",
            )
        if (tx.get("from") or "").lower() != self._cuenta.address.lower():
            raise ErrorAnclajePermanente(
                "El remitente de la transacción no es la wallet caliente.",
                codigo="CONTRATO_INCORRECTO",
            )
        if recibo.get("status") != 1:
            raise ErrorAnclajePermanente(
                "La transacción revirtió.", codigo="RECIBO_REVERTIDO"
            )
        confirmaciones = self._w3.eth.block_number - recibo["blockNumber"] + 1
        if confirmaciones < self._confirmaciones:
            return None

        hash_objetivo = _a_bytes32(hash_raiz_bytes32)
        lote_objetivo = _a_bytes32(lote_id_bytes32)
        for log in self._contrato.events.HashAnchored().process_receipt(recibo):
            args = log["args"]
            if args["loteId"] == lote_objetivo and args["hashRaiz"] == hash_objetivo:
                if args["actor"].lower() != self._cuenta.address.lower():
                    raise ErrorAnclajePermanente(
                        "El actor del evento no es la wallet caliente.",
                        codigo="EVENTO_INVALIDO",
                    )
                return ReciboAncla(
                    tx_hash=tx_hash,
                    bloque=int(recibo["blockNumber"]),
                    lote_id_bytes32=lote_id_bytes32,
                    hash_raiz=hash_raiz_bytes32,
                    actor=args["actor"],
                )
        raise ErrorAnclajePermanente(
            "El recibo no contiene el evento HashAnchored esperado.",
            codigo="EVENTO_INVALIDO",
        )

    # ------------------------------------------------------------------ red

    def _verificar_red(self) -> None:
        try:
            cadena = self._w3.eth.chain_id
        except Exception as exc:
            raise ErrorAnclajeTransitorio(f"RPC inalcanzable: {exc}") from exc
        if cadena != self._chain_id:
            raise ErrorAnclajePermanente(
                f"La cadena respondió {cadena} en lugar de {self._chain_id}.",
                codigo="CADENA_INCORRECTA",
            )


def construir_gateway_web3(**kwargs) -> Web3GatewayTrazabilidad:
    """Fábrica perezosa (evita importar `web3` cuando el modo está apagado)."""
    return Web3GatewayTrazabilidad(**kwargs)
