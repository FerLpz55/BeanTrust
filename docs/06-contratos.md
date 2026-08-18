# 06 · Contratos y pagos on-chain (CoffeePayments)

> Contexto: B7 del milestone Backend MVP. La **implementación web3 está en
> pausa** por decisión de producto (falta proyecto Supabase real y wallet de la
> cooperativa). Este documento es la especificación de referencia que el
> backend ya respeta a través del `GatewayPagos` y que se implementará en el
> milestone de blockchain.

## Responsabilidad

`CoffeePayments.sol` tiene una única responsabilidad (patrón *única
responsabilidad*, skill Solidity): **ejecutar y dejar constancia inmutable del
pago justo** de un lote. No conoce estados del café ni reglas de trazabilidad.

- Recibe una venta firmada por el backend: `lote_id`, `productor`, `peso_kg`,
  `monto_total`.
- Retiene **3%** hacia la tesorería de la cooperativa.
- Envía **97%** a la wallet del productor (patrón *pull-over-push*).
- Emite `PaymentPaid(loteId, productorAddr, monto)` para auditoría on-chain.
- Opcionalmente ancla el `hash_sha256` del Certificado de Origen (§8).

## Interfaz (borrador v0)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title CoffeePayments
/// @notice Pago justo del lote: 3% cooperativa, 97% productor.
contract CoffeePayments is ReentrancyGuard {
    struct Venta {
        bytes32 loteId;
        address productor;
        uint256 pesoKg;
        uint256 montoTotal;
    }

    error SoloBackend();
    error VentaYaRegistrada(bytes32 loteId);
    error ProductorInvalido();

    address public immutable backend;
    mapping(bytes32 => bool) public ventasPagadas;
    event PaymentPaid(bytes32 indexed loteId, address indexed productor, uint256 montoProductor);
    event HashAnclado(bytes32 indexed loteId, bytes32 hashOrigen);

    constructor(address _backend) {
        backend = _backend;
    }

    /// @notice Dispara el pago de una venta firmada por el backend (checks-effects-interactions).
    function pay(bytes32 loteId, address productor, uint256 pesoKg, uint256 montoTotal) external nonReentrant {
        if (msg.sender != backend) revert SoloBackend();
        if (ventasPagadas[loteId]) revert VentaYaRegistrada(loteId);
        if (productor == address(0)) revert ProductorInvalido();
        ventasPagadas[loteId] = true;
        // 3% -> cooperativa, 97% -> productor (pull-over-push)
        uint256 comision = (montoTotal * 3) / 100;
        uint256 neto = montoTotal - comision;
        (bool ok, ) = productor.call{value: neto}("");
        require(ok, "transfer productor fallida");
        emit PaymentPaid(loteId, productor, neto);
    }

    /// @notice Ancla el hash del Certificado de Origen (inmutabilidad §8).
    function anclarHash(bytes32 loteId, bytes32 hashOrigen) external {
        if (msg.sender != backend) revert SoloBackend();
        emit HashAnclado(loteId, hashOrigen);
    }
}
```

## Flujo backend → contrato (diagrama)

```mermaid
sequenceDiagram
    autonumber
    participant CO as Cooperativa (móvil)
    participant API as Backend FastAPI
    participant W as Wallet del backend (firma)
    participant SC as CoffeePayments (Polygon)
    participant PR as Wallet del productor
    participant DB as Supabase (pago)

    CO->>API: POST /v1/pagos (lote, comprador, monto) + Idempotency-Key
    API->>API: Calcula 3% / 97% y firma la venta con la wallet del backend
    API->>SC: pay(loteId, productor, peso, monto)
    SC->>SC: checks-effects-interactions; retiene 3%; envía 97%
    SC-->>PR: 97% (transfer)
    SC-->>API: tx_hash
    API->>DB: pago PENDIENTE + tx_hash + idempotency_key UNIQUE
    API-->>CO: 202 Accepted (async)
    Note over SC,DB: Poller (pausado): evento PaymentPaid -> PENDIENTE→CONFIRMADO
```

## Anclaje on-chain del QR (inmutabilidad del certificado)

El Certificado de Origen (§8) es verificable off-chain (hash SHA-256 contra el
historial). Para que la evidencia sea **independiente de la plataforma**, el
backend puede llamar a `anclarHash` al emitir el certificado: el `hash_sha256`
queda en el evento `HashAnclado` y cualquier auditor compara el QR contra el
valor on-chain. Esta llamada es opcional y no bloquea la verificación.

## Estado de la implementación

| Pieza | Estado | Dónde vive |
|---|---|---|
| `GatewayPagos` (interfaz) | ✅ listo | `Backend/app/repositories/interfaces.py` |
| `FakeGatewayPagos` (dev/tests) | ✅ listo | `Backend/app/repositories/in_memory.py` |
| `PagoService` (3%/97%, idempotencia) | ✅ listo | `Backend/app/services/pagos_service.py` |
| `POST /v1/pagos` | ✅ listo | `Backend/app/api/v1/endpoints/pagos.py` |
| `PAGO.idempotency_key UNIQUE` | ✅ listo | `Backend/db/migrations/001_esquema_inicial.sql` |
| `CoffeePayments.sol` | ⏸️ pausado | `contracts/` (futuro) |
| Poller de confirmación | ⏸️ pausado | servicio futuro (listener `PaymentPaid`) |
| Wallet de la cooperativa | ⏸️ pausado | registro del productor (futuro) |

> Decisión registrada en el tablero (B7): el contrato y el web3 se implementan
> en el milestone de blockchain, no en el MVP. El MVP queda probado de punta a
> punta con `FakeGatewayPagos`.