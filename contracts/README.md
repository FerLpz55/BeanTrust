# contracts/ · CoffeeTraceability (Base Sepolia)

Módulo Foundry con el contrato de **anclaje inmutable del Pasaporte de Café**.
No implementa pagos, ERC-20, propinas ni funciones `payable`; `CoffeePayments`
sigue siendo una fase posterior (`docs/06-contratos.md`).

## Contrato

`src/CoffeeTraceability.sol`: no actualizable, hereda
`AccessControlDefaultAdminRules` y `Pausable`.

| Rol | Quién | Puede |
|---|---|---|
| `DEFAULT_ADMIN_ROLE` | `DEFAULT_ADMIN_ADDRESS` (cuenta de despliegue) | Administrar roles, transferir admin con 48 h de retardo |
| `PAUSER_ROLE` | `PAUSER_ADDRESS` | `pause()` / `unpause()` |
| `ANCHOR_ROLE` | `BACKEND_ANCHOR_ADDRESS` (wallet del backend) | `anchorHash(loteId, hashRaiz)` |

Interfaz:

```solidity
function anchorHash(bytes32 loteId, bytes32 hashRaiz) external;
function isAnchored(bytes32 loteId) external view returns (bool);
function getAnchor(bytes32 loteId)
    external view returns (bytes32 hashRaiz, address actor, uint256 anchoredAt);
function pause() external;
function unpause() external;

event HashAnchored(
    bytes32 indexed loteId,
    bytes32 indexed hashRaiz,
    address indexed actor,
    uint256 anchoredAt
);
```

`anchorHash` exige `ANCHOR_ROLE`, rechaza `bytes32(0)` en cualquiera de los dos
argumentos, respeta la pausa y revierte con `LoteYaAnclado` en un segundo anclaje
del mismo lote. `getAnchor` revierte con `AnchorNoEncontrado` si el lote no está
anclado. El contrato no recibe ETH (sin `receive`/`fallback` ni funciones
`payable`).

## Conversión canónica (probada en ambos lados)

- UUID de `lotes.id` → 16 bytes hexadecimales **rellenados a la derecha** hasta `bytes32`.
- `qr_certificado.hash_sha256` → sus 64 caracteres hexadecimales como `bytes32`.
- **No** se aplica `keccak256` a UUIDs, texto ni JSON: el hash ya es el SHA-256
  canónico del Pasaporte.

El backend expone el mismo mapeo en `app/services/trazabilidad_service.py`.

## Dónde va la private key (nunca en Git)

- **Cuenta admin/deploy**: se importa cifrada al keystore de Foundry. No se escribe en `.env`:
  ```bash
  cast wallet import beanst-admin --interactive
  cast wallet address --account beanst-admin   # debe coincidir con DEFAULT_ADMIN_ADDRESS
  ```
- **Wallet de anclaje del backend**: su private key vive **solo** en el `.env` del
  backend (`BEAN_WEB3_BACKEND_PRIVATE_KEY`), nunca aquí. En `contracts/.env` solo
  se registra su dirección pública (`BACKEND_ANCHOR_ADDRESS`).

## Comandos

```bash
# Dependencias (no versionadas: contracts/lib/ está en .gitignore)
mkdir -p lib && \
  git clone --depth 1 --branch v5.1.0 https://github.com/OpenZeppelin/openzeppelin-contracts.git lib/openzeppelin-contracts && \
  git clone --depth 1 --branch v1.9.6 https://github.com/foundry-rs/forge-std.git lib/forge-std

forge fmt --check
forge build
forge test -vvv
forge coverage
forge script script/DeployCoffeeTraceability.s.sol --rpc-url "$BASE_SEPOLIA_RPC_URL"
```

### Despliegue en Base Sepolia

```bash
cp .env.example .env      # completa las tres direcciones; .env no se commitea
set -a; source .env; set +a

forge script script/DeployCoffeeTraceability.s.sol \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" --account beanst-admin --broadcast \
  --verify --verifier etherscan --verifier-url https://api-sepolia.basescan.org/api \
  --etherscan-api-key "$BASESCAN_API_KEY"
```

Post-deploy (sustituye `<CONTRATO>` y `BACKEND_ANCHOR_ADDRESS`):

```bash
cast chain-id --rpc-url https://sepolia.base.org            # 84532
cast code <CONTRATO> --rpc-url https://sepolia.base.org     # bytecode != 0x
cast call <CONTRATO> "hasRole(bytes32,address)(bool)" \
  "$(cast keccak ANCHOR_ROLE)" "$BACKEND_ANCHOR_ADDRESS" --rpc-url https://sepolia.base.org
```

La ABI versionada para el backend vive en `abi/CoffeeTraceability.json`
(generada con `forge inspect src/CoffeeTraceability.sol:CoffeeTraceability abi --json`).
