# Guía blockchain de BeanTrust (Base Sepolia)

Fecha de referencia: 2026-09-16.

Esta guía activa el **anclaje on-chain del Pasaporte de Café** (ADR-11) sin
gastar dinero. El objetivo es probar en una red de prueba que el contrato
`CoffeeTraceability` puede anclar la raíz SHA-256 de un certificado, emitir
eventos auditables y conectarse al backend FastAPI sin romper el MVP.

`CoffeePayments` (pagos 97/3 y propinas on-chain) **no** forma parte de este
frente: sigue en pausa y el MVP corre con `FakeGatewayPagos`.

## Estado real (2026-09-16)

- `CoffeeTraceability` **desplegado** en Base Sepolia:
  `0x083475298d32724d85E17Dd48f9a9Bd2550035C9` (deploy tx
  `0xd6f1990f6e25f7a493a38e246b2684b6dd0f5e633c1a03bf52f0c7af3d3d8110`, bloque
  `46926492`, runtime `0x07746f4c…def3d8`). El contrato no recibió ETH.
- Roles verificados on-chain: `DEFAULT_ADMIN_ROLE` + `PAUSER_ROLE` en
  `0x032c4f61…c532`; `ANCHOR_ROLE` en la wallet caliente `0x42cC953B…d656`
  (sin privilegios cruzados, `paused=false`).
- Migraciones `011` y `012` **aplicadas** en el proyecto Supabase
  (`yvczofwzfljuubxnmakj`); el backfill creó **9 anclas `PENDIENTE`**.
- Backend en `BEAN_WEB3_MODE=disabled`: no se firma nada. La private key de la
  wallet caliente **no** está cargada en Vercel.
- Pendiente: verificación del código fuente en BaseScan y smoke real end-to-end
  (cargar la wallet caliente, pasar a `anchor` y anclar un lote canario).

## Red elegida y por qué

**Base Sepolia** (EVM, testnet de la L2 de Coinbase):

| Dato | Valor |
|---|---|
| RPC | `https://sepolia.base.org` |
| Chain ID | `84532` |
| Gas | ETH de prueba |
| Explorer | `https://sepolia.basescan.org` |
| Faucet | https://www.alchemy.com/faucets/base-sepolia |

**Divergencia deliberada y documentada**: `docs/ARCHITECTURE.md` y
`docs/06-contratos.md` mencionaban Polygon. Se elige Base Sepolia por
**disponibilidad de ETH de prueba** para la cuenta administradora. El contrato
no tiene dependencias de Base y **conserva portabilidad EVM a Polygon Amoy**
(`80002`, RPC `https://polygon-amoy.drpc.org`, explorer
`https://amoy.polygonscan.com`) como alternativa futura. Cambiar de red es
cambiar `--rpc-url`, `chain_id` y faucet; el Solidity no cambia.

## Cuentas: dónde va cada clave

Hay **dos cuentas** y solo se comparten direcciones públicas.

### 1. Cuenta admin/deploy (dueña del contrato)

Dirección pública de referencia:

```bash
DEFAULT_ADMIN_ADDRESS=0x032c4f6186c394e2eC3671Fe786047C957Edc532
PAUSER_ADDRESS=0x032c4f6186c394e2eC3671Fe786047C957Edc532
```

La private key **no se escribe en ningún `.env`**. Se importa cifrada al keystore
de Foundry y se firma con `--account`:

```bash
cast wallet import beanst-admin --interactive
cast wallet address --account beanst-admin   # debe dar 0x032c...c532
```

### 2. Wallet caliente del backend (ancla las raíces)

Es una cuenta **distinta** de la admin. Genera una nueva con:

```bash
cast wallet new
```

De esa cuenta:
- La **dirección pública** va en `contracts/.env` como `BACKEND_ANCHOR_ADDRESS`.
- La **private key** va **solo** en `Backend/.env` como
  `BEAN_WEB3_BACKEND_PRIVATE_KEY` (o en Vercel env en producción). Nunca en Git,
  Supabase, logs, capturas ni chat.

```bash
# Backend/.env  (NO commitear)
BEAN_WEB3_MODE=anchor
BEAN_WEB3_CHAIN_ID=84532
BEAN_WEB3_NETWORK_NAME=Base Sepolia
BEAN_WEB3_RPC_URL=https://sepolia.base.org
BEAN_WEB3_CONTRACT_ADDRESS=0x...
BEAN_WEB3_CONTRACT_CODE_HASH=0x...      # keccak256 del runtime bytecode
BEAN_WEB3_DEPLOYMENT_BLOCK=123456
BEAN_WEB3_BACKEND_PRIVATE_KEY=0x...
BEAN_WEB3_CONFIRMATIONS=2
BEAN_WEB3_EXPLORER_BASE_URL=https://sepolia.basescan.org
BEAN_WEB3_EXPLORER_LABEL=BaseScan
# Vercel inyecta CRON_SECRET; el backend acepta ambos nombres.
BEAN_WEB3_CRON_SECRET=<secreto-de-32-bytes-minimo>
```

En producción (`BEAN_ENVIRONMENT=production`) con `BEAN_WEB3_MODE=anchor` el
arranque exige todas las variables anteriores.

## Fondos de prueba

Pide ETH de testnet para **las dos** cuentas:

- cuenta admin: paga el deploy, pausas y roles;
- wallet de anclaje: paga el gas de cada `anchorHash`.

Faucets: https://www.alchemy.com/faucets/base-sepolia ·
https://portal.cdp.coinbase.com/products/faucet

## Foundry y `contracts/`

```bash
curl -L https://foundry.paradigm.xyz | bash
~/.foundry/bin/foundryup

cd contracts
# Dependencias (no versionadas: contracts/lib/ está en .gitignore)
mkdir -p lib
git clone --depth 1 --branch v5.1.0 https://github.com/OpenZeppelin/openzeppelin-contracts.git lib/openzeppelin-contracts
git clone --depth 1 --branch v1.9.6 https://github.com/foundry-rs/forge-std.git lib/forge-std

forge fmt --check
forge build
forge test -vvv
forge coverage
```

## Despliegue

```bash
cd contracts
cp .env.example .env       # completa las tres direcciones; .env no se commitea
set -a; source .env; set +a

forge script script/DeployCoffeeTraceability.s.sol \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" --account beanst-admin --broadcast \
  --verify --verifier etherscan --verifier-url https://api-sepolia.basescan.org/api \
  --etherscan-api-key "$BASESCAN_API_KEY"
```

El script valida que las tres direcciones no sean cero y despliega con la cuenta
`beanst-admin`.

### Comprobaciones post-deploy

```bash
cast chain-id --rpc-url https://sepolia.base.org            # 84532
cast code <CONTRATO> --rpc-url https://sepolia.base.org     # bytecode != 0x
cast call <CONTRATO> "hasRole(bytes32,address)(bool)" \
  "$(cast keccak ANCHOR_ROLE)" "$BACKEND_ANCHOR_ADDRESS" --rpc-url https://sepolia.base.org
cast call <CONTRATO> "hasRole(bytes32,address)(bool)" \
  "$(cast keccak PAUSER_ROLE)" "$PAUSER_ADDRESS" --rpc-url https://sepolia.base.org
```

Registra en documentación (sin secretos): dirección del contrato, bloque, hash de
despliegue, ABI (`contracts/abi/CoffeeTraceability.json`) y URL del explorer.

## Migración y worker

Aplica `Backend/db/migrations/011_blockchain_anchors.sql` y luego
`012_blockchain_anchor_hardening.sql` en Supabase. La 012 añade la unicidad de
`qr_certificado.lote_id` (aborta si hay duplicados, sin borrar trazabilidad),
las columnas de hardening, el estado `ENVIANDO` y el **lease global con fencing
token** (`app_private.blockchain_worker_locks` + RPCs `bean_*_lock_anclaje` y
`bean_reclamar_ancla`).

El worker se dispara por Vercel Cron contra el endpoint protegido (Vercel envía
`Authorization: Bearer $CRON_SECRET`):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://<backend>/v1/blockchain/reconciliar
```

`Backend/vercel.json` define el cron. En **Vercel Hobby** corre **diario**
(`0 3 * * *`); en Pro se puede cambiar a `*/5 * * * *`. El endpoint reclama
trabajos con el lease global, valida cadena/bytecode/rol, reserva nonce
(`pending`), transmite una tx EIP-1559, confirma por tx + recibo + evento +
confirmaciones y recupera por logs `HashAnchored` si el `tx_hash` no se
persistió. Un revert, cadena/contrato equivocado o hash distinto marca `FALLIDA`;
el admin puede reintentar (solo causas reintentables) con
`POST /v1/blockchain/anclas/{lote_id}/reintentar`.

## Fases

1. **Base sin keys** ✅: contrato probado, migraciones, worker, cron y móvil.
   `BEAN_WEB3_MODE=disabled`; verificable con `forge` + `pytest` + Anvil E2E.
2. **Cuentas** ✅: wallet admin importada al keystore y wallet caliente creada.
3. **Deploy** ✅: `CoffeeTraceability` desplegado y roles verificados on-chain.
   Falta publicar el código en BaseScan (requiere `BASESCAN_API_KEY`).
4. **Activación** (en curso): migraciones `011/012` aplicadas y Vercel con la
   identidad pública del contrato en `disabled`. Falta cargar la private key de
   la wallet caliente y pasar a `BEAN_WEB3_MODE=anchor`.

## Rollback

- RPC caído: el QR sigue funcionando; el worker reprograma.
- Error de contrato/configuración: volver a `BEAN_WEB3_MODE=disabled` y pausar el
  contrato (`PAUSER_ROLE`); el Pasaporte y la cola quedan intactos.
- Key comprometida: pausar, revocar `ANCHOR_ROLE`, crear wallet nueva y otorgar
  el rol nuevo.
- Nunca borrar lotes, QR, eventos ni anclas para “arreglar” una falla.

## Verificación end-to-end

1. Crea un lote y avánzalo hasta `TOSTADO` (se emite el Pasaporte y se encola el ancla).
2. `GET /v1/verificar/{codigo}` debe devolver `anclaje_onchain` con
   `estado: PENDIENTE`.
3. Dispara el cron; el ancla pasa a `CONFIRMADA` con `tx_hash`, `bloque` y
   `explorer_url`.
4. Abre `explorer_url` en `https://sepolia.basescan.org` y comprueba el evento
   `HashAnchored`.
5. Apaga el RPC (`BEAN_WEB3_MODE=disabled` o un RPC inválido): el QR debe seguir
   verificando `200` y el anclaje no debe bloquear nada.

## Checklist

- [ ] Tengo la dirección admin `0x032c...c532` importada en `cast wallet`.
- [ ] Tengo una wallet de anclaje separada con ETH de Base Sepolia.
- [ ] `forge --version` funciona y `forge test` pasa.
- [ ] No voy a commitear `.env` ni compartir ninguna private key.
- [ ] `BEAN_WEB3_MODE=disabled` deja el QR intacto.
- [ ] El ancla confirmada expone `tx_hash` y `explorer_url`.

## Fuentes

- Base RPC overview: https://docs.base.org/base-chain/api-reference/rpc-overview
- Base Sepolia faucet: https://www.alchemy.com/faucets/base-sepolia
- BaseScan Sepolia: https://sepolia.basescan.org
- Foundry deployment: https://getfoundry.sh/forge/deploying/
- OpenZeppelin AccessControlDefaultAdminRules: https://docs.openzeppelin.com/contracts/5.x/api/access
- Polygon Amoy (alternativa EVM): https://docs.polygon.technology/pos/reference/rpc-endpoints
