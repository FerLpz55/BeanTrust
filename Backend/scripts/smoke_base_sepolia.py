#!/usr/bin/env python3
"""Smoke operativo del anclaje on-chain en Base Sepolia (ADR-11).

Reutiliza el mismo `Web3GatewayTrazabilidad` que el worker, de modo que el smoke
no firma con reglas distintas: preflight (cadena, bytecode, huella del runtime y
`ANCHOR_ROLE`), nonce `pending`, y confirmación por recibo + evento + 2
confirmaciones.

Comprueba además el **mínimo privilegio**: la wallet caliente solo tiene
`ANCHOR_ROLE`; `PAUSER_ROLE` se valida contra `BEAN_WEB3_PAUSER_ADDRESS` (la
cuenta admin), nunca contra la wallet caliente.

No lleva secretos embebidos: todo entra por variables de entorno (el `.env` del
backend). Solo imprime direcciones públicas, hashes y el link del explorer.

    BEAN_WEB3_MODE=anchor
    BEAN_WEB3_CHAIN_ID=84532
    BEAN_WEB3_RPC_URL=https://sepolia.base.org
    BEAN_WEB3_CONTRACT_ADDRESS=0x...
    BEAN_WEB3_CONTRACT_CODE_HASH=0x...
    BEAN_WEB3_BACKEND_PRIVATE_KEY=0x...
    BEAN_WEB3_PAUSER_ADDRESS=0x...
    BEAN_WEB3_CONFIRMATIONS=2

Opcionales (si no se dan, se usan lote/hash canarios):
    BEAN_SMOKE_LOTE_ID=<uuid>
    BEAN_SMOKE_HASH=<sha256 hex de 64>

Ejecución:  cd Backend && .venv/bin/python scripts/smoke_base_sepolia.py
Sale con 0 si todo cuadra y != 0 si algo falla.
"""

from __future__ import annotations

import hashlib
import os
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import Settings
from app.repositories.web3_trazabilidad import construir_gateway_web3
from app.services.trazabilidad_service import (
    hash_a_bytes32,
    lote_id_a_bytes32,
)

RETARDO_ADMIN_ESPERADO = 48 * 60 * 60  # 172800 s


def _fallar(mensaje: str) -> int:
    print(f"[FALLA] {mensaje}")
    return 1


def main() -> int:
    settings = Settings()
    if settings.web3_mode != "anchor":
        return _fallar("BEAN_WEB3_MODE debe ser 'anchor' para este smoke.")
    requeridos = {
        "BEAN_WEB3_CONTRACT_ADDRESS": settings.web3_contract_address,
        "BEAN_WEB3_CONTRACT_CODE_HASH": settings.web3_contract_code_hash,
        "BEAN_WEB3_BACKEND_PRIVATE_KEY": settings.web3_backend_private_key,
        "BEAN_WEB3_PAUSER_ADDRESS": settings.web3_pauser_address,
    }
    faltan = [nombre for nombre, valor in requeridos.items() if not valor]
    if faltan:
        return _fallar(f"Faltan variables: {', '.join(faltan)}")

    gateway = construir_gateway_web3(
        rpc_url=settings.web3_rpc_url,
        private_key=settings.web3_backend_private_key,
        contract_address=settings.web3_contract_address,
        contract_code_hash=settings.web3_contract_code_hash,
        chain_id=settings.web3_chain_id,
        confirmations=settings.web3_confirmations,
        timeout_seconds=settings.web3_rpc_timeout_seconds,
    )

    gateway.preflight()
    print(f"[ok] preflight: cadena {gateway.chain_id}, bytecode y ANCHOR_ROLE")

    if not gateway.tiene_rol("ANCHOR_ROLE", gateway.direccion):
        return _fallar("La wallet caliente no tiene ANCHOR_ROLE.")
    if not gateway.tiene_rol("PAUSER_ROLE", settings.web3_pauser_address):
        return _fallar("La cuenta PAUSER no tiene PAUSER_ROLE.")
    if gateway.tiene_rol("PAUSER_ROLE", gateway.direccion):
        return _fallar("La wallet caliente NO debe tener PAUSER_ROLE (mínimo privilegio).")
    if gateway.retardo_admin_segundos() != RETARDO_ADMIN_ESPERADO:
        return _fallar("El retardo de administración no es de 48 h.")
    print("[ok] roles mínimos y retardo admin de 48 h")

    lote_id = uuid.UUID(os.environ.get("BEAN_SMOKE_LOTE_ID", str(uuid.uuid4())))
    lote_bytes32 = lote_id_a_bytes32(lote_id)
    hash_hex = os.environ.get(
        "BEAN_SMOKE_HASH", hashlib.sha256(os.urandom(16)).hexdigest()
    )
    hash_bytes32 = hash_a_bytes32(hash_hex)

    onchain = gateway.leer_ancla(lote_bytes32)
    if onchain is not None:
        if onchain.hash_raiz.lower() != hash_bytes32:
            return _fallar("El lote canario ya tiene una raíz distinta (auditoría manual).")
        print("[ok] el lote canario ya estaba anclado (reconciliación)")
    else:
        nonce = gateway.reservar_nonce()
        tx_hash = gateway.enviar_ancla(lote_bytes32, hash_bytes32, nonce)
        print(f"[ok] ancla transmitida (nonce pending {nonce}) {tx_hash}")

        recibo = None
        for _ in range(60):
            recibo = gateway.confirmar_ancla(tx_hash, lote_bytes32, hash_bytes32)
            if recibo is not None:
                break
            time.sleep(2)
        if recibo is None:
            return _fallar("La transacción no alcanzó las confirmaciones exigidas.")
        print(f"[ok] recibo validado: bloque {recibo.bloque}, actor {recibo.actor}")

    onchain = gateway.leer_ancla(lote_bytes32)
    if onchain is None or onchain.hash_raiz.lower() != hash_bytes32:
        return _fallar("getAnchor no devuelve la raíz esperada.")
    print(f"[ok] hash_raiz on-chain {hash_bytes32}")
    print(f"[ok] contrato {gateway.contrato}")
    print(f"[ok] explorer {settings.web3_explorer_base_url}/address/{gateway.contrato}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
