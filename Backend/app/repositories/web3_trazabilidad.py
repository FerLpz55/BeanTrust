"""Gateway de anclaje contra Base Sepolia con `web3.py` (ADR-11).

Frontera de infraestructura: el servicio habla con `GatewayTrazabilidad`, no con
`web3`. Importa `web3` de forma perezosa para que el backend arranque aunque la
dependencia no esté instalada cuando el anclaje está desactivado.

Endurecimiento (fase de hardening):
- normalización de hashes con `Web3.to_hex` (nunca `HexBytes.hex()`, que omite
  el prefijo `0x` en la versión instalada);
- preflight de cadena, bytecode, huella del runtime, contrato no pausado,
  dirección de anclaje derivada y roles de privilegio mínimo antes de firmar;
- nonce reservado con `eth_getTransactionCount(..., "pending")`;
- EIP-1559 con sugerencia `eth_maxPriorityFeePerGas` y techos configurables;
- separación `preparar_ancla` (firma en memoria) / `transmitir_ancla` (broadcast);
- confirmación por tx (remitente/contrato) + recibo + evento + confirmaciones;
- recuperación por `getAnchor` y, solo como respaldo, por logs fragmentados.

La ABI versionada vive en `contracts/abi/CoffeeTraceability.json`; si el backend
se despliega sin ese archivo se usa una ABI mínima embebida.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from app.models.dominio import (
    AnclaOnchain,
    ErrorAnclaje,
    ErrorAnclajePermanente,
    ErrorAnclajeTransitorio,
    ReciboAncla,
    TransaccionPreparada,
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
        "name": "paused",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"name": "", "type": "bool"}],
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

_ROLE_ANCHOR = "ANCHOR_ROLE"
_ROLE_PAUSER = "PAUSER_ROLE"
_DEFAULT_ADMIN_ROLE = "0x" + "00" * 32


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


@dataclass(frozen=True)
class _PoliticaTarifas:
    """Techo de prioridad y de `maxFeePerGas` (wei) más la reserva mínima."""

    max_priority_fee_wei: int
    max_fee_wei: int
    min_balance_wei: int


class Web3GatewayTrazabilidad:
    """Implementación real: EIP-1559 desde la wallet caliente del backend."""

    def __init__(
        self,
        *,
        rpc_url: str,
        private_key: str,
        contract_address: str,
        contract_code_hash: str,
        anchor_address: str = "",
        chain_id: int,
        confirmations: int,
        timeout_seconds: int = 10,
        max_priority_fee_gwei: float = 0.01,
        max_fee_gwei: float = 0.05,
        min_balance_wei: int = 20_000_000_000_000,
        log_block_range: int = 10_000,
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
        self._anchor_address = (
            Web3.to_checksum_address(anchor_address) if anchor_address else ""
        )
        self._confirmaciones = confirmations
        self._tarifas = _PoliticaTarifas(
            max_priority_fee_wei=self._w3.to_wei(max_priority_fee_gwei, "gwei"),
            max_fee_wei=self._w3.to_wei(max_fee_gwei, "gwei"),
            min_balance_wei=min_balance_wei,
        )
        self._log_block_range = log_block_range
        self._preflight_ok = False
        self._to_hex = Web3.to_hex

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

        codigo = self._rpc(
            lambda: self._w3.eth.get_code(self._direccion), "RPC inalcanzable"
        )
        if not codigo:
            raise ErrorAnclajePermanente(
                "El contrato no tiene bytecode en la cadena.",
                codigo="BYTECODE_INCORRECTO",
            )
        huella = self._to_hex(self._w3.keccak(bytes(codigo))).lower()
        if self._code_hash and huella != self._code_hash:
            raise ErrorAnclajePermanente(
                "La huella del runtime no coincide con BEAN_WEB3_CONTRACT_CODE_HASH.",
                codigo="BYTECODE_INCORRECTO",
            )

        if self._anchor_address and self._anchor_address != self._cuenta.address:
            raise ErrorAnclajePermanente(
                "BEAN_WEB3_ANCHOR_ADDRESS no coincide con la private key.",
                codigo="ANCHOR_ADDRESS_INCORRECTA",
            )

        pausado = self._rpc(
            lambda: bool(self._contrato.functions.paused().call()),
            "RPC inalcanzable",
        )
        if pausado:
            raise ErrorAnclajePermanente(
                "El contrato de anclaje está pausado.",
                codigo="CONTRATO_PAUSADO",
            )

        roles = self._leer_roles()
        if not roles["anchor"]:
            raise ErrorAnclajePermanente(
                "La wallet caliente no tiene ANCHOR_ROLE.",
                codigo="ROL_FALTANTE",
            )
        if roles["admin"] or roles["pauser"]:
            raise ErrorAnclajePermanente(
                "La wallet caliente tiene roles de administración o pausa.",
                codigo="ROL_EXCESIVO",
            )

        saldo = self._rpc(
            lambda: int(self._w3.eth.get_balance(self._cuenta.address)),
            "RPC inalcanzable",
        )
        if saldo < self._tarifas.min_balance_wei:
            raise ErrorAnclajePermanente(
                "La wallet caliente no alcanza la reserva operativa mínima.",
                codigo="SALDO_INSUFICIENTE",
            )
        self._preflight_ok = True

    def _leer_roles(self) -> dict[str, bool]:
        def consultar() -> dict[str, bool]:
            return {
                "anchor": bool(
                    self._contrato.functions.hasRole(
                        self._w3.keccak(text=_ROLE_ANCHOR), self._cuenta.address
                    ).call()
                ),
                "admin": bool(
                    self._contrato.functions.hasRole(
                        _a_bytes32(_DEFAULT_ADMIN_ROLE), self._cuenta.address
                    ).call()
                ),
                "pauser": bool(
                    self._contrato.functions.hasRole(
                        self._w3.keccak(text=_ROLE_PAUSER), self._cuenta.address
                    ).call()
                ),
            }

        return self._rpc(consultar, "RPC inalcanzable")

    def _rpc(self, funcion, mensaje: str):
        """Ejecuta una lectura RPC: los errores de dominio pasan, el resto es transitorio."""
        try:
            return funcion()
        except ErrorAnclaje:
            raise
        except Exception as exc:
            raise ErrorAnclajeTransitorio(f"{mensaje}: {exc}") from exc

    # -------------------------------------------------- diagnóstico (smoke)

    def tiene_rol(self, rol: str, direccion: str) -> bool:
        """Consulta `hasRole(keccak256(rol), direccion)` para el smoke."""
        from web3 import Web3

        self._verificar_red()

        def consultar() -> bool:
            return bool(
                self._contrato.functions.hasRole(
                    self._w3.keccak(text=rol), Web3.to_checksum_address(direccion)
                ).call()
            )

        return self._rpc(consultar, "No se pudo consultar el rol")

    def retardo_admin_segundos(self) -> int:
        """`defaultAdminDelay()` (48 h = 172800 s) para el smoke."""
        self._verificar_red()
        return self._rpc(
            lambda: int(self._contrato.functions.defaultAdminDelay().call()),
            "No se pudo leer el retardo admin",
        )

    # ----------------------------------------------------------------- lecturas

    def leer_ancla(self, lote_id_bytes32: str) -> AnclaOnchain | None:
        self._verificar_red()

        def leer():
            anclado = self._contrato.functions.isAnchored(
                _a_bytes32(lote_id_bytes32)
            ).call()
            if not anclado:
                return None
            hash_raiz, actor, anchored_at = self._contrato.functions.getAnchor(
                _a_bytes32(lote_id_bytes32)
            ).call()
            return AnclaOnchain(
                hash_raiz=_de_bytes32(hash_raiz), actor=actor, anchored_at=int(anchored_at)
            )

        return self._rpc(leer, "No se pudo leer el anclaje")

    def buscar_ancla_por_evento(
        self, lote_id_bytes32: str, hash_raiz_bytes32: str, desde_bloque: int
    ) -> ReciboAncla | None:
        """Recupera el recibo de un anclaje cuyo `tx_hash` no se persistió.

        Primero consulta `getAnchor`; si el anclaje exacto existe, recorre los
        logs hacia atrás en ventanas de `log_block_range` y solo acepta eventos
        del contrato. Se detiene al hallar el evento exacto confirmado.
        """
        self._verificar_red()
        onchain = self.leer_ancla(lote_id_bytes32)
        if onchain is None or onchain.hash_raiz.lower() != hash_raiz_bytes32.lower():
            return None

        ultimo = self._rpc(lambda: int(self._w3.eth.block_number), "RPC inalcanzable")
        objetivo = _a_bytes32(hash_raiz_bytes32)
        lote = _a_bytes32(lote_id_bytes32)
        desde = max(int(desde_bloque), 0)
        fin = ultimo
        while fin >= desde:
            inicio = max(desde, fin - self._log_block_range + 1)
            logs = self._rpc(
                lambda inicio=inicio, fin=fin: self._contrato.events.HashAnchored().get_logs(
                    from_block=inicio,
                    to_block=fin,
                    argument_filters={"loteId": lote, "hashRaiz": objetivo},
                ),
                "No se pudo buscar el evento",
            )
            for log in reversed(logs):
                if (log.get("address") or "").lower() != self._direccion.lower():
                    continue
                recibo = self._validar_recibo(
                    self._to_hex(log["transactionHash"]),
                    lote_id_bytes32,
                    hash_raiz_bytes32,
                )
                if recibo is not None:
                    return recibo
            if inicio == desde:
                break
            fin = inicio - 1
        return None

    # ---------------------------------------------------------------- nonce

    def reservar_nonce(self) -> int:
        self._verificar_red()
        return self._rpc(
            lambda: int(self._w3.eth.get_transaction_count(self._cuenta.address, "pending")),
            "No se pudo reservar nonce",
        )

    # ------------------------------------------------------------ preparación

    def preparar_ancla(
        self, lote_id_bytes32: str, hash_raiz_bytes32: str, nonce: int
    ) -> TransaccionPreparada:
        """Estima gas, aplica la política de tarifas y firma en memoria.

        No transmite: cualquier fallo aquí (saldo, tarifa, estimación) deja la
        fila en su estado previo, nunca en `ENVIANDO` con transmisión incierta.
        """
        from web3.exceptions import ContractLogicError

        self._verificar_red()
        funcion = self._contrato.functions.anchorHash(
            _a_bytes32(lote_id_bytes32), _a_bytes32(hash_raiz_bytes32)
        )
        try:
            gas = int(funcion.estimate_gas({"from": self._cuenta.address}) * 1.2)
        except ContractLogicError as exc:
            raise ErrorAnclajePermanente(
                f"Revert del contrato: {exc}", codigo="REVERT"
            ) from exc
        except ErrorAnclaje:
            raise
        except Exception as exc:
            raise ErrorAnclajeTransitorio(
                f"No se pudo estimar el gas: {exc}", codigo="GAS_ESTIMACION"
            ) from exc

        base_fee, prioridad, max_fee = self._calcular_tarifas()
        if max_fee < base_fee + prioridad:
            raise ErrorAnclajeTransitorio(
                "El techo de tarifa no cubre baseFee + priorityFee.",
                codigo="FEE_CAP_TOO_LOW",
            )

        saldo = self._rpc(
            lambda: int(self._w3.eth.get_balance(self._cuenta.address)),
            "RPC inalcanzable",
        )
        if saldo < gas * max_fee + self._tarifas.min_balance_wei:
            raise ErrorAnclajeTransitorio(
                "Saldo insuficiente para cubrir gas y reserva operativa.",
                codigo="SALDO_INSUFICIENTE",
            )

        try:
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
        except ErrorAnclaje:
            raise
        except Exception as exc:
            raise ErrorAnclajeTransitorio(
                f"No se pudo firmar el anclaje: {exc}", codigo="FIRMA_FALLIDA"
            ) from exc
        raw = firmada.raw_transaction
        return TransaccionPreparada(
            tx_hash=self._to_hex(self._w3.keccak(raw)),
            raw_transaction=raw,
        )

    def _calcular_tarifas(self) -> tuple[int, int, int]:
        """Devuelve `(base_fee, priority_fee, max_fee)` en wei con los techos."""
        base_fee = self._rpc(
            lambda: int(
                self._w3.eth.get_block("latest").get("baseFeePerGas")
                or self._w3.eth.gas_price
            ),
            "No se pudo leer la tarifa base",
        )
        try:
            sugerida = int(self._w3.eth.max_priority_fee)
        except Exception:
            sugerida = self._w3.to_wei(1, "gwei")
        prioridad = max(1, min(sugerida, self._tarifas.max_priority_fee_wei))
        max_fee = min(base_fee * 2 + prioridad, self._tarifas.max_fee_wei)
        return base_fee, prioridad, max_fee

    # ------------------------------------------------------------ transmisión

    def transmitir_ancla(self, transaccion: TransaccionPreparada) -> str:
        """Difunde la transacción ya firmada y devuelve su `tx_hash` normalizado."""
        self._verificar_red()
        try:
            self._w3.eth.send_raw_transaction(transaccion.raw_transaction)
        except ErrorAnclaje:
            raise
        except Exception as exc:
            raise ErrorAnclajeTransitorio(
                f"No se pudo transmitir el anclaje: {exc}", codigo="BROADCAST_INCIERTO"
            ) from exc
        return transaccion.tx_hash

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
