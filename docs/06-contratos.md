# 06 · Contratos y pagos on-chain

> Contexto: B7 del milestone Backend MVP. El **anclaje on-chain del Pasaporte
> (ADR-11) está implementado**: `contracts/src/CoffeeTraceability.sol` (Foundry,
> Base Sepolia) + cola `blockchain_anclas` (migración 011) + worker de
> reconciliación. La **implementación de pagos web3 sigue en pausa** por decisión
> de producto (falta la wallet del productor/cooperativa); este documento es la
> especificación de referencia que el backend ya respeta a través del
> `GatewayPagos` y que se implementará en el milestone de blockchain. Además del
> pago justo, cubre la **propina al productor** (bivalente: off-chain en el MVP /
> on-chain futuro, decisión pendiente) y el **anclaje por etapa** del Pasaporte
> de Café.

## CoffeeTraceability (implementado, Base Sepolia)

Contrato de **única responsabilidad**: dejar constancia inmutable de
`(loteId, hashRaiz, actor, timestamp)`, un anclaje por lote.

- No actualizable; hereda `AccessControlDefaultAdminRules` (retardo admin 48 h) y
  `Pausable`. Roles `DEFAULT_ADMIN_ROLE`, `PAUSER_ROLE`, `ANCHOR_ROLE`.
- `anchorHash(bytes32 loteId, bytes32 hashRaiz)` exige `ANCHOR_ROLE`, rechaza
  `bytes32(0)`, respeta la pausa y bloquea un segundo anclaje del mismo lote.
- `isAnchored`, `getAnchor`, `pause`/`unpause`; sin `payable` ni recepción de ETH.
- Evento `HashAnchored(bytes32 indexed loteId, bytes32 indexed hashRaiz, address indexed actor, uint256 anchoredAt)`.
- Conversión canónica (probada en ambos lados): UUID de `lotes.id` → 16 bytes hex
  rellenados a la derecha hasta `bytes32`; `qr_certificado.hash_sha256` → sus 64
  caracteres hex como `bytes32`. **Sin `keccak256`** (el hash ya es SHA-256).
- Detalle de despliegue y comandos: `contracts/README.md` y
  `docs/guia-blockchain-testnet.md`.

**Desplegado en Base Sepolia (2026-09-16):**
`0x083475298d32724d85E17Dd48f9a9Bd2550035C9` · deploy tx
`0xd6f1990f6e25f7a493a38e246b2684b6dd0f5e633c1a03bf52f0c7af3d3d8110` · bloque
`46926492` · runtime `0x07746f4c5c883f10bc2904690dd2a4969f1945f91e5be55689a5676e01def3d8`.
`DEFAULT_ADMIN_ROLE`/`PAUSER_ROLE` en `0x032c4f61…c532` y `ANCHOR_ROLE` en la
wallet caliente `0x42cC953B…d656` (sin privilegios cruzados). El backend queda
en `BEAN_WEB3_MODE=disabled`; **la wallet caliente aún no está cargada y no hay
anclas reales**. El gateway endurecido exige ese privilegio mínimo en el
preflight, normaliza hashes con `Web3.to_hex` y persiste `ENVIANDO + tx_hash`
antes del broadcast. La migración **013** (fencing del worker) está lista,
pendiente de `supabase db push --linked`.

> **Pagos y propinas siguen simulados** (`FakeGatewayPagos`): no hay
> transferencias reales ni custodia de dinero. Lo único real on-chain es el
> anclaje del Pasaporte.

## CoffeePayments (fase posterior)

## Responsabilidad

`CoffeePayments.sol` tiene una única responsabilidad (patrón *única
responsabilidad*, skill Solidity): **ejecutar y dejar constancia inmutable del
pago justo** de un lote. No conoce estados del café ni reglas de trazabilidad.

- Recibe una venta firmada por el backend: `lote_id`, `productor`, `peso_kg`,
  `monto_total`.
- Retiene **3%** hacia la tesorería de la cooperativa.
- Envía **97%** a la wallet del productor (patrón *pull-over-push*).
- Emite `PaymentPaid(loteId, productorAddr, monto)` para auditoría on-chain.
- Opcionalmente ancla el `hash_sha256` del Pasaporte de Café (§8).
- Registra la **propina del comprador al productor** (ADR-10): **100% directa**
  al productor, idempotente y emitida después de la venta. Sigue el mismo
  patrón de única responsabilidad (deja constancia inmutable, no conoce reglas
  de trazabilidad).

## Interfaz (borrador v0)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title CoffeePayments
/// @notice Pago justo del lote: 3% cooperativa, 97% productor + propina directa 100% al productor.
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
    error MontoInvalido();

    address public immutable backend;
    mapping(bytes32 => bool) public ventasPagadas;
    event PaymentPaid(bytes32 indexed loteId, address indexed productor, uint256 montoProductor);
    event HashAnclado(bytes32 indexed loteId, bytes32 hashOrigen);
    event PropinaEnviada(bytes32 indexed loteId, address indexed productor, uint256 monto);

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

    /// @notice Propina voluntaria del comprador al productor (100% directa, pull-over-push).
    function darPropina(bytes32 loteId, address productor, uint256 monto) external nonReentrant {
        if (msg.sender != backend) revert SoloBackend();
        if (monto == 0) revert MontoInvalido();
        (bool ok, ) = productor.call{value: monto}("");
        require(ok, "transfer propina fallida");
        emit PropinaEnviada(loteId, productor, monto);
    }

    /// @notice Ancla el hash de la raíz de la etapa del Pasaporte de Café (inmutabilidad §8).
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
    Note over CO,API: Propina del comprador (opcional, ADR-10)
    CO->>API: POST /v1/propinas (lote, monto) + Idempotency-Key
    API->>SC: darPropina(loteId, productor, monto)
    SC-->>PR: 100% (transfer)
    SC-->>API: tx_hash
    API->>DB: propina REGISTRADA + tx_hash + idempotency_key UNIQUE
    API-->>CO: 202 Accepted
```

## Anclaje on-chain del Pasaporte (hash por etapa)

La trazabilidad del café se construye como una **cadena lineal de hashes** en la
que cada etapa del Pasaporte encadena su hash raíz con el de la etapa anterior
(ver ARCHITECTURE.md §5, §8). Para que la evidencia sea **independiente de la
plataforma**, el backend ancla la raíz del certificado con
`anchorHash(loteId, hashRaiz)` en `CoffeeTraceability`; el hash raíz final queda
en el evento `HashAnchored`. La verificación off-chain (hash SHA-256 contra el
historial) sigue funcionando; el anclaje es asíncrono y no bloquea la
verificación. Cualquier auditor compara el hash raíz contra el valor on-chain.
El anclaje de hitos intermedios por etapa queda como extensión opcional futura.

## Estado de la implementación

| Pieza | Estado | Dónde vive |
|---|---|---|
| `GatewayPagos` (interfaz) | ✅ listo | `Backend/app/repositories/interfaces.py` |
| `FakeGatewayPagos` (dev/tests) | ✅ listo | `Backend/app/repositories/in_memory.py` |
| `PagoService` (3%/97%, idempotencia) | ✅ listo | `Backend/app/services/pagos_service.py` |
| `POST /v1/pagos` | ✅ listo | `Backend/app/api/v1/endpoints/pagos.py` |
| `PAGO.idempotency_key UNIQUE` | ✅ listo | `Backend/db/migrations/001_esquema_inicial.sql` |
| `CoffeeTraceability.sol` (anclaje ADR-11) | ✅ implementado y desplegado | `contracts/src/CoffeeTraceability.sol` |
| `blockchain_anclas` + trigger + backfill | ✅ aplicado (011) | `Backend/db/migrations/011_blockchain_anchors.sql` |
| Hardening (unicidad QR/lote, `ENVIANDO`, nonce, fencing) | ✅ aplicado (012) | `Backend/db/migrations/012_blockchain_anchor_hardening.sql` |
| Fencing real del worker (lease vigente al reclamar, formato `tx_hash`) | 🟡 lista (013, pendiente `db push`) | `Backend/db/migrations/013_blockchain_worker_fencing.sql` |
| `GatewayTrazabilidad` + worker (preflight de roles/pausa/dirección, `Web3.to_hex`, techos EIP-1559, `preparar_ancla`→`ENVIANDO+tx_hash`→`transmitir_ancla`, tx+recibo+evento+2 confirmaciones, recuperación por hash y logs) | ✅ listo | `Backend/app/services/trazabilidad_service.py`, `Backend/app/repositories/web3_trazabilidad.py` |
| `CoffeePayments.sol` | ⏸️ pausado | `contracts/` (fase posterior) |
| Poller de confirmación de pagos | ⏸️ pausado | servicio futuro (listener `PaymentPaid`) |
| Wallet de la cooperativa | ⏸️ pausado | registro del productor (futuro) |
| `POST /v1/propinas` | ✅ listo | `Backend/app/api/v1/endpoints/pagos.py` (router_propinas) |
| `tabla PROPINA (bivalente)` | ✅ listo | `Backend/db/migrations/004_cadena_completa_propina.sql` |
| `darPropina()` en CoffeePayments.sol | ⏸️ pausado | `contracts/` (futuro) |
| Evidencia fotográfica (ADR-14, Storage privado) | ✅ listo (fuera de web3) | `Backend/db/migrations/006` + `007`, `supabase/functions/purge-staged-evidence/` |

> Decisión registrada en el tablero (B7): el contrato y el web3 se implementan
> en el milestone de blockchain, no en el MVP. El MVP queda probado de punta a
> punta con `FakeGatewayPagos`. La **evidencia fotográfica** (ADR-14) ya es
> funcional sobre Supabase Storage y es independiente del web3.