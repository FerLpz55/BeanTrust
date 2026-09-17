# Reporte · Anclaje blockchain del Pasaporte (Fase A)

Fecha: 2026-09-16 · Estado: **contrato desplegado en Base Sepolia; backend preparado en `disabled`** (checkpoint seguro: sin wallet caliente cargada y sin anclas reales)

Este reporte resume el trabajo de la base de anclaje del Pasaporte de Café
(ADR-11) sobre Base Sepolia. No se implementan pagos on-chain: `CoffeePayments`
sigue en pausa y el MVP de pagos corre con `FakeGatewayPagos`.

---

## 1. Resumen ejecutivo

Se cerró una base de anclaje **segura y desplegable sin usar ninguna private
key**: contrato probado, cola durable, worker confiable, cron real, API/móvil
configurables y E2E con Anvil. Las claves se agregarán en una fase posterior.

Dos inconsistencias detectadas contra la arquitectura quedaron cerradas:

1. El scheduler de Vercel invoca con `GET` + `Authorization: Bearer` (antes
   había un `POST` con `X-Cron-Secret`).
2. El reconciliador ahora serializa nonce, confirma por transacción + recibo +
   evento + dos confirmaciones, y conserva evidencia antes de declarar éxito.

---

## 1.b Cierre 2026-09-16 · checkpoint seguro

**Objetivo:** terminar el día con el contrato desplegado y validado, Supabase
listo, Vercel configurado en modo seguro y documentación actualizada, **sin
cargar la clave de la wallet caliente ni activar anclajes reales**.

### Despliegue (Base Sepolia, `chain_id` 84532)

| Dato | Valor |
|---|---|
| Contrato | `0x083475298d32724d85E17Dd48f9a9Bd2550035C9` |
| Deploy tx | `0xd6f1990f6e25f7a493a38e246b2684b6dd0f5e633c1a03bf52f0c7af3d3d8110` |
| Bloque | `46926492` |
| Runtime code hash | `0x07746f4c5c883f10bc2904690dd2a4969f1945f91e5be55689a5676e01def3d8` |
| `DEFAULT_ADMIN_ROLE` / `PAUSER_ROLE` | `0x032c4f6186c394e2eC3671Fe786047C957Edc532` |
| `ANCHOR_ROLE` | `0x42cC953Bd37cb100074ab9e20AD950D7c0add656` |

Comprobado on-chain por RPC (sin firmar nada): `receipt.status = true`,
`cast code` != `0x`, balance del contrato = `0`, `paused = false`,
`ANCHOR_ROLE` solo en la wallet caliente y `PAUSER_ROLE` solo en la admin (sin
privilegios cruzados). **No se volvió a ejecutar el script de deploy.**

- **Verificación en BaseScan: pendiente.** Requiere `BASESCAN_API_KEY` (no se
  expone en el repo/chat). Comando de solo lectura para publicar el código ya
  desplegado (sin `--broadcast`):
  ```bash
  cd contracts
  forge verify-contract 0x083475298d32724d85E17Dd48f9a9Bd2550035C9 \
    src/CoffeeTraceability.sol:CoffeeTraceability \
    --chain 84532 \
    --compiler-version 0.8.28 \
    --optimizer-runs 200 \
    --constructor-args "$(cast abi-encode 'constructor(address,address,address)' \
      0x032c4f6186c394e2eC3671Fe786047C957Edc532 \
      0x032c4f6186c394e2eC3671Fe786047C957Edc532 \
      0x42cC953Bd37cb100074ab9e20AD950D7c0add656)" \
    --verifier etherscan \
    --verifier-url https://api-sepolia.basescan.org/api \
    --etherscan-api-key "$BASESCAN_API_KEY"
  ```

### Supabase (proyecto `yvczofwzfljuubxnmakj`)

- **Preflight:** `qr_certificado` = 9 filas y **0 duplicados de `lote_id`** →
  la unicidad de `012` puede aplicarse. `blockchain_anclas` no existía.
- **Bug encontrado y corregido antes de la primera aplicación:** la `011`
  insertaba `lower(hash_sha256)` en `hash_raiz`, pero el check exige
  `^0x[0-9a-f]{64}$` y `qr_certificado.hash_sha256` es el `hexdigest` de 64
  caracteres **sin `0x`** (igual que lo escribe `QrService.hash_lote` y como lo
  normaliza `hash_a_bytes32` al leer). El primer `db push` falló y **revirtió
  011 completa** (`begin/commit`, historial intacto). Se corrigió el trigger y
  el backfill de `011` a `'0x' || lower(...)` y se reaplicó con éxito. No se
  creó ninguna migración nueva.
- **Aplicadas** `011_blockchain_anchors.sql` y
  `012_blockchain_anchor_hardening.sql`; historial local == remoto.
- **Backfill:** 9 anclas creadas, **todas `PENDIENTE`** (no se activó el worker,
  así que no hay gasto ni anclas reales).
- **Validación post-migración** (todo `true`/correcto): RLS activa en
  `blockchain_anclas`; `qr_certificado.lote_id` con `UNIQUE`; índice
  `blockchain_anclas_worker_idx`; `anon`/`authenticated` sin privilegios sobre
  la cola ni sobre RPCs internos; RPCs `SECURITY DEFINER` con
  `search_path = ''` y `EXECUTE` solo para `service_role`; lease global con
  `lock_token`; `hash_raiz` con prefijo `0x`. El QR público
  (`GET /v1/verificar/{codigo}` en producción) sigue respondiendo `200`.
- **`supabase db advisors`:** 6 WARN. Cinco son preexistentes y ajenos a
  blockchain (`function_search_path_mutable` en `set_actualizado_en`,
  `rls_auto_enable` ejecutable por `anon`/`authenticated`, y dos de Auth). El
  único nuevo es `duplicate_index`: `blockchain_anclas_cola_idx` (011) y
  `blockchain_anclas_worker_idx` (012) son idénticos. **No se tocó el esquema
  fuera de migración**; se deja como deuda con la migración forward recomendada
  (`013`: `drop index public.blockchain_anclas_cola_idx`). Es un WARN de
  rendimiento, no de seguridad.

### Vercel (`beantrust-api`, Production)

- Cargadas en **Production** solo variables públicas: `BEAN_WEB3_MODE=disabled`,
  `CHAIN_ID`, `NETWORK_NAME`, `RPC_URL`, `CONTRACT_ADDRESS`,
  `CONTRACT_CODE_HASH`, `DEPLOYMENT_BLOCK`, `CONFIRMATIONS=2`,
  `EXPLORER_BASE_URL`, `EXPLORER_LABEL`, `PAUSER_ADDRESS` y `CRON_SECRET`
  (generado localmente y enviado por stdin; nunca impreso ni versionado).
- **No** se cargó `BEAN_WEB3_BACKEND_PRIVATE_KEY` (wallet caliente
  `0x42cC…d656`).
- Se añadió `BEAN_RATE_LIMIT_HMAC_SECRET` a **Preview** (faltaba y el preview no
  arrancaba porque `BEAN_ENVIRONMENT=production` lo exige); secreto distinto del
  de producción.
- **Smoke de preview** (`disabled`): `/health` = `200`; `GET
  /v1/verificar/{codigo}` = `200`; el OpenAPI expone
  `/v1/blockchain/reconciliar` y `/v1/blockchain/anclas/{lote_id}/reintentar`;
  el reintento admin sin token = `401`; sin secretos en los logs.
  - Nota de contrato: con `BEAN_WEB3_MODE=disabled` el cron es un **no-op
    público** (`200`, `habilitado=false`), por diseño y cubierto por
    `test_sin_ancla_cuando_web3_desactivado`. El `401` sin bearer se aplica
    cuando el modo es `anchor` (`test_reconciliar_exige_bearer`). No se modificó
    ese contrato testeado durante el cierre.
- **Deploy a Production: pendiente de confirmación explícita** (el plan lo
  exige). La identidad pública del contrato ya vive en Vercel.

### Documentación y plantilla

- Nueva plantilla `Backend/.env.production.example` (públicas reales,
  `BEAN_WEB3_MODE=disabled`, secretos como `__CONFIGURAR_EN_VERCEL__`, sin
  private keys ni API keys); `Backend/.gitignore` permite versionarla.
- Actualizados `docs/ARCHITECTURE.md` §9, `docs/06-contratos.md` y
  `docs/guia-blockchain-testnet.md` con el despliegue real y el estado actual.

### Lista exacta para mañana

1. Verificar/publicar el código en BaseScan con `BASESCAN_API_KEY` (comando
   arriba; reintentar solo la verificación si falla, **nunca redeployar**).
2. Confirmar el deploy a Production (`vercel deploy --prod`) y validar
   `/health`, `/v1/verificar`, cron sin bearer (`disabled` = no-op) y reintento
   admin (`401`/`403`).
3. Cargar `BEAN_WEB3_BACKEND_PRIVATE_KEY` en Vercel Production y cambiar
   `BEAN_WEB3_MODE=anchor`.
4. Ejecutar un lote canario y comprobar `PENDIENTE → CONFIRMADA` con `tx_hash`,
   bloque y ≥ 2 confirmaciones en BaseScan.
5. (Opcional) Migración `013` para eliminar el índice duplicado.

---

## 2. Decisión de red y scheduler

| Dato | Valor |
|---|---|
| Red | Base Sepolia (`chain_id` 84532) |
| RPC | `https://sepolia.base.org` |
| Explorer | `https://sepolia.basescan.org` (etiqueta `BaseScan`) |
| Cron | `0 3 * * *` (diario) |

`vercel project inspect` confirmó el proyecto `beantrust-api` en una cuenta
**Hobby** (sin Pro), por lo que el cron corre **una vez al día** según
`Backend/vercel.json`. Si se pasa a Pro, basta cambiar el schedule a
`*/5 * * * *`. El reintento manual (`POST /v1/blockchain/anclas/{lote_id}/reintentar`)
queda disponible para demos.

Divergencia deliberada y documentada: Base Sepolia se eligió por disponibilidad
de ETH de prueba. El contrato no tiene dependencias de Base y conserva
portabilidad EVM a Polygon Amoy como alternativa futura.

---

## 3. Arquitectura del flujo

```
POST /v1/lotes/{id}/eventos (TOSTADO)
  → LoteService emite el Pasaporte QR y encola en blockchain_anclas (PENDIENTE)
GET /v1/blockchain/reconciliar  (Bearer CRON_SECRET, Vercel Cron)
  → lease global + fencing token
  → preflight: chain_id, bytecode, runtime hash, ANCHOR_ROLE
  → reserva nonce (pending) → firma anchorHash (EIP-1559)
  → confirma por tx + recibo + evento HashAnchored + 2 confirmaciones
  → CONFIRMADA (tx_hash + bloque reales)
GET /v1/verificar/{codigo} → Pasaporte + anclaje_onchain
```

Principios: FastAPI conserva las reglas de negocio; Solidity solo ancla
evidencia; Supabase es la fuente de verdad operativa; el móvil nunca conoce RPC,
ABI, contrato ni claves; una falla de RPC jamás bloquea el QR.

---

## 4. Cambios por capa

### 4.1 Contrato (`contracts/`)

- `src/CoffeeTraceability.sol`: no actualizable, `AccessControlDefaultAdminRules`
  (retardo 48 h) + `Pausable`; roles `DEFAULT_ADMIN_ROLE`, `PAUSER_ROLE`,
  `ANCHOR_ROLE`; `anchorHash` rechaza cero/duplicado/pausa; evento
  `HashAnchored`; sin ETH ni funciones `payable`.
- Conversión canónica: UUID → 16 bytes hex rellenados a la derecha hasta
  `bytes32`; `hash_sha256` → sus 64 hex como `bytes32`; **sin `keccak256`**.
- Pruebas: roles, transferencia admin retrasada, pausa, duplicados, fuzz,
  revocación de roles, ETH, selectores ABI y topic del evento.
- Dependencias reproducibles: `DEPENDENCIES.lock` (SHA fijo) +
  `scripts/bootstrap-deps.sh` + `remappings.txt`.
- `abi/CoffeeTraceability.json` versionada para el backend.

### 4.2 Base de datos

- `011_blockchain_anchors.sql`: cola `blockchain_anclas`, trigger de encolado al
  emitir QR, backfill, unicidad por certificado y RLS solo `service_role`.
- `012_blockchain_anchor_hardening.sql` (no reescribe la 011):
  - unicidad `qr_certificado.lote_id` que **aborta y reporta IDs** si hay
    duplicados, sin borrar trazabilidad;
  - estado `ENVIANDO`, `nonce`, `enviada_en`, `confirmada_en`,
    `ultimo_chequeo_en`, `runtime_code_hash`, `codigo_error`, `lock_token`;
  - check: una fila `CONFIRMADA` exige `tx_hash` y bloque real (> 0);
  - lease global `app_private.blockchain_worker_locks` y RPCs
    `bean_adquirir/renovar/liberar_lock_anclaje`, `bean_reclamar_ancla`
    (`security definer`, `search_path = ''`).

### 4.3 Backend

- `core/config.py`: `BEAN_WEB3_*` tipado con validaciones (URL, address 20 bytes,
  runtime hash 32 bytes, private key 32 bytes, confirmaciones 1–12, secreto cron
  ≥ 32 bytes) y alias `CRON_SECRET`. En producción con `anchor` exige todo.
- `repositories/interfaces.py`: `GatewayTrazabilidad` y `RepositorioAnclas` con
  lease/fencing.
- `repositories/web3_trazabilidad.py`: preflight, nonce `pending`, EIP-1559,
  confirmación por tx/recibo/evento y recuperación por logs.
- `repositories/in_memory.py`: `FakeGatewayTrazabilidad` (mina al enviar, tx
  pendiente, respuesta perdida, fallo de nonce, fallo de preflight) y
  `InMemoryAnclaRepo` con lock global y fencing.
- `repositories/supabase.py`: `SupabaseAnclaRepo` contra los RPCs y transiciones
  con `.eq("lock_token", token)`.
- `services/trazabilidad_service.py`: worker con lease global, máquina de
  estados, TTL, backoff exponencial, recuperación y reintento admin seguro.
- `api/v1/endpoints/blockchain.py`: `GET /reconciliar` (Bearer, `no-store`) y
  `POST /anclas/{lote_id}/reintentar` (admin).
- `schemas/anclaje.py` + `verificacion.py`: `anclaje_onchain` con `red_nombre`,
  `explorer_etiqueta` y `confirmada_en`.
- `vercel.json`: cron diario.
- `scripts/smoke_base_sepolia.py`: runbook para la fase de despliegue.

### 4.4 Móvil

- `src/api/types.ts`: `AnclajeOnchain` con `red_nombre`, `explorer_etiqueta`,
  `confirmada_en` y estado `ENVIANDO`.
- `app/verificar/[codigo].tsx`: elimina textos fijos “Base Sepolia”/“BaseScan”;
  renderiza nombre/estado/URL del backend; abre el explorer solo si
  `CONFIRMADA` + `tx_hash` + bloque + URL.

### 4.5 CI y seguridad

- `.github/workflows/blockchain.yml`: secret scan (gitleaks), Foundry
  (fmt/build/test/coverage), Slither y Anvil E2E.
- `.gitleaks.toml`: allowlist de las claves públicas de Anvil del E2E.

---

## 5. Máquina de estados del ancla

| Estado | Significado |
|---|---|
| `PENDIENTE` | Encolado; puede firmarse |
| `ENVIANDO` | Nonce reservado, transmisión incierta; **no se reenvía a ciegas** |
| `ENVIADA` | `tx_hash` persistido; solo se consulta recibo |
| `CONFIRMADA` | Recibo + evento + confirmaciones; `tx_hash` y bloque reales |
| `FALLIDA` | Error definitivo, TTL excedido o reintentos agotados |

- Reintento admin solo para causas reintentables y si la cadena no ancló el lote.
- `HASH_ONCHAIN_DISTINTO` y `ANCLA_PREVIA` son **definitivos**: no se reintentan.
- El reintento limpia `tx_hash`, nonce, bloque y `enviada_en` antes de volver a
  `PENDIENTE`.

---

## 6. Direcciones y claves (fase posterior)

### Direcciones públicas confirmadas (Base Sepolia, `chain_id` 84532)

| Rol | Dirección | Saldo | Nonce |
|---|---|---|---|
| Admin / deploy / pausa | `0x032c4f6186c394e2eC3671Fe786047C957Edc532` | 0.0001 ETH | 0 |
| Wallet caliente / `ANCHOR_ROLE` | `0x42cC953Bd37cb100074ab9e20AD950D7c0add656` | 0.0001 ETH | 0 |

Ambas direcciones son checksums EIP-55 válidos (verificado con
`cast to-check-sum-address`). El deploy se estimó en **~0.0000126 ETH**
(1 142 242 gas · `maxFeePerGas` 0.011 gwei), por lo que el saldo de la admin
alcanza con margen; la wallet caliente necesita ETH para las anclas posteriores.

### Dónde va cada clave

- **Cuenta admin/deploy**: nunca en `.env`; se importa cifrada al keystore:
  ```bash
  cd contracts && cast wallet import beanst-admin --interactive
  cast wallet address --account beanst-admin   # 0x032c...c532
  ```
- **Wallet caliente del backend**: private key **solo** en `Backend/.env`
  (`BEAN_WEB3_BACKEND_PRIVATE_KEY`) o Vercel; su dirección pública en
  `contracts/.env` (`BACKEND_ANCHOR_ADDRESS`).
- Nunca en Git, Supabase, logs, capturas ni chat.

---

## 7. Verificación ejecutada

```bash
cd contracts && forge fmt --check && forge build && forge test -vvv && forge coverage
cd Backend   && .venv/bin/ruff check app tests && .venv/bin/pytest
cd mobile    && pnpm exec tsc --noEmit && pnpm exec expo lint && pnpm test
```

Resultados:

| Suite | Resultado |
|---|---|
| Foundry | 21 tests OK · `CoffeeTraceability.sol` 100% líneas |
| Backend | `ruff` limpio · 224 tests OK (incluye **E2E Anvil** con contrato real) |
| Móvil | `tsc` OK · `expo lint --max-warnings=0` OK · 54 tests OK |
| Contrato API | `test_contrato_api.py` sincronizado (GET `/blockchain/reconciliar`) |

Cobertura de tests de anclaje: conversiones UUID↔bytes32, sanitización de
errores, settings inválidos, lock global concurrente, fencing vencido, nonce,
`ENVIANDO` tras broadcast incierto, recuperación por evento, hash distinto,
ancla previa, dos confirmaciones y reintento admin.

---

## 8. Fases

| Fase | Alcance | Estado |
|---|---|---|
| A | Base sin keys: contrato, migraciones, worker, cron, móvil, E2E | ✅ cerrada |
| B | `contracts/.env` con direcciones, deps bloqueadas, fmt/build/test/coverage | ✅ cerrada |
| C | Importar admin al keystore + deploy + verificación en BaseScan | 🟡 deploy hecho; verificación BaseScan pendiente (requiere `BASESCAN_API_KEY`) |
| D | Migraciones en Supabase, secretos en Vercel, activar `anchor` | 🟡 migraciones 011/012 aplicadas y Vercel en `disabled`; falta cargar la wallet caliente y pasar a `anchor` |
| E | Smoke real end-to-end (lote → ancla `CONFIRMADA` en BaseScan) | ⏳ pendiente |

El detalle operativo ajustado a las dos direcciones públicas está en el
**§11 Plan operativo Fase B–E** (sin private keys).

---

## 9. Rollback

| Incidente | Acción |
|---|---|
| RPC caído | El QR sigue funcionando; el worker reprograma |
| Error de contrato/config | `BEAN_WEB3_MODE=disabled` + pausar contrato |
| Key comprometida | Pausar, revocar `ANCHOR_ROLE`, crear wallet nueva |
| Hash distinto on-chain | No reintentar; auditoría manual |
| Cron no corre | Ejecutar el endpoint autenticado a mano y corregir Vercel |

Nunca borrar lotes, QR, eventos ni anclas históricas para “arreglar” una falla.

---

## 10. Notas y deuda

- `011` no se reescribe; todo el endurecimiento vive en `012`.
- El smoke real en Base Sepolia queda pendiente hasta la Fase C/D: por eso el
  estado se reporta como “implementado en local/Anvil, pendiente smoke real”.
- Slither corre en CI (`fail-on: high`); localmente no está instalado.
- `CoffeePayments`, propinas on-chain y wallets de productores siguen fuera de
  alcance.

---

## 11. Plan operativo Fase B–E (ajustado a las dos direcciones públicas)

> Sin private keys. Las claves se introducen solo en el prompt de Foundry o en
> los secretos de Vercel. Nunca en archivos del repo, chat ni capturas.

### Fase B — Preparación (✅ ejecutada)

1. `contracts/.env` creado con las direcciones públicas confirmadas (fuera de Git).
2. Dependencias fijadas por SHA (`./scripts/bootstrap-deps.sh`).
3. Verificación local:

```bash
cd contracts
./scripts/bootstrap-deps.sh
forge fmt --check && forge build && forge test -vvv && forge coverage
```

Resultado: `fmt` OK · 21 tests OK · `CoffeeTraceability.sol` 100% líneas.
Pendiente de tu lado: crear `BASESCAN_API_KEY` como secreto local (no va al repo).

### Fase C — Deploy (requiere tu key, terminal privada)

```bash
cd contracts
cast wallet import beanst-admin --interactive
cast wallet address --account beanst-admin      # debe dar 0x032c...c532

set -a; source .env; set +a

# 1) Dry-run (sin broadcast)
forge script script/DeployCoffeeTraceability.s.sol \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" --account beanst-admin

# 2) Broadcast + verificación
forge script script/DeployCoffeeTraceability.s.sol \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" --account beanst-admin \
  --broadcast --verify \
  --verifier etherscan \
  --verifier-url https://api-sepolia.basescan.org/api \
  --etherscan-api-key "$BASESCAN_API_KEY"
```

Registrar el resultado (no secreto) con el script post-deploy, que valida
bytecode, receipt, roles mínimos, retardo de 48 h y emite las tres variables:

```bash
CONTRACT_ADDRESS=0x... DEPLOY_TX=0x... ./scripts/post-deploy.sh
# -> BEAN_WEB3_CONTRACT_ADDRESS / BEAN_WEB3_DEPLOYMENT_BLOCK /
#    BEAN_WEB3_CONTRACT_CODE_HASH / BEAN_WEB3_PAUSER_ADDRESS
```

Validado end-to-end contra Anvil (deploy real → script → roles y retardo
correctos). El `CODE_HASH` del script coincide con el que calcula el gateway
(`keccak256` del runtime bytecode).

Smoke de anclaje (reutiliza el mismo gateway que el worker):

```bash
cd Backend && .venv/bin/python scripts/smoke_base_sepolia.py
```

Comprobaciones manuales opcionales:

```bash
cast chain-id --rpc-url https://sepolia.base.org        # 84532
cast code <CONTRATO> --rpc-url https://sepolia.base.org # != 0x
cast call <CONTRATO> "hasRole(bytes32,address)(bool)" \
  "$(cast keccak ANCHOR_ROLE)" 0x42cC953Bd37cb100074ab9e20AD950D7c0add656 \
  --rpc-url https://sepolia.base.org                     # true
```

### Fase D — Supabase y Vercel

1. Aplicar `011_blockchain_anchors.sql` y `012_blockchain_anchor_hardening.sql`.
2. Desplegar el backend con `BEAN_WEB3_MODE=disabled` y verificar: QR `200`,
   filas `PENDIENTE` en `blockchain_anclas` y ninguna transacción.
3. Cargar en Vercel (solo secretos):

```bash
BEAN_WEB3_MODE=anchor
BEAN_WEB3_CHAIN_ID=84532
BEAN_WEB3_NETWORK_NAME=Base Sepolia
BEAN_WEB3_RPC_URL=https://sepolia.base.org
BEAN_WEB3_CONTRACT_ADDRESS=0x...
BEAN_WEB3_CONTRACT_CODE_HASH=0x...
BEAN_WEB3_DEPLOYMENT_BLOCK=<numero>
BEAN_WEB3_BACKEND_PRIVATE_KEY=<private key de Backend Anchor>
BEAN_WEB3_CONFIRMATIONS=2
BEAN_WEB3_EXPLORER_BASE_URL=https://sepolia.basescan.org
BEAN_WEB3_EXPLORER_LABEL=BaseScan
CRON_SECRET=<aleatorio de 32+ bytes>
```

4. `Backend/vercel.json` ya trae el cron diario de Hobby (`0 3 * * *`).
   Invocación manual para demo:

```bash
curl https://beantrust-api.vercel.app/v1/blockchain/reconciliar \
  -H "Authorization: Bearer $CRON_SECRET"
```

### Fase E — Smoke real end-to-end

1. Lote de prueba hasta `TOSTADO`.
2. `GET /v1/verificar/{codigo}` → `anclaje_onchain.estado = PENDIENTE`.
3. Cron manual o diario → `PENDIENTE → ENVIANDO → ENVIADA → CONFIRMADA`.
4. Validar en la API: `CONFIRMADA`, `chain_id=84532`, `tx_hash`, `bloque > 0`,
   `explorer_url`.
5. En BaseScan: contrato correcto, emisor `0x42cC…d656`, evento `HashAnchored`,
   lote/hash iguales a la API y ≥ 2 confirmaciones.
6. Resiliencia: desactivar `BEAN_WEB3_MODE` → QR sigue `200`; restaurar `anchor`
   → la cola se recupera sin duplicar anclas.

### Criterio de terminado

Contrato desplegado/verificado · roles correctos · ancla real firmada por la
wallet caliente · evento en BaseScan · API y móvil muestran el estado · QR
funciona aunque Base falle · cron configurado · sin secretos en Git · pagos 97/3
y propinas fuera de alcance.

---

## 12. Corrección §0 y plan de continuación C–G

### §0 Corrección obligatoria del smoke (✅ hecha)

- `Backend/scripts/smoke_base_sepolia.py` ahora **reutiliza
  `Web3GatewayTrazabilidad`**: preflight (cadena, bytecode, huella y
  `ANCHOR_ROLE`), nonce `pending`, y confirmación por recibo + evento + 2
  confirmaciones (mismas reglas que el worker).
- `PAUSER_ROLE` se valida contra `BEAN_WEB3_PAUSER_ADDRESS` (la admin), **no**
  contra la wallet caliente; además el smoke exige que la wallet caliente **no**
  tenga `PAUSER_ROLE` (mínimo privilegio).
- Nueva variable `BEAN_WEB3_PAUSER_ADDRESS` (validada 0x + 40 hex; requerida en
  producción con `anchor`).
- `contracts/scripts/post-deploy.sh` (C4): solo lectura, valida cadena, bytecode,
  receipt, roles mínimos, retardo 48 h y topic del evento; emite las variables no
  secretas. Probado end-to-end contra Anvil.

### Fase C — Deploy (requiere tu key)

1. Preflight local: `forge fmt --check`, `build`, `test -vv`, `coverage`,
   `cast chain-id` = 84532 y `.env` ignorado por Git.
2. `cast wallet import beanst-admin --interactive` → debe derivar
   `0x032c4f6186c394e2eC3671Fe786047C957Edc532`.
3. Dry-run del `forge script` (sin `--broadcast`) y luego broadcast + `--verify`.
4. `./scripts/post-deploy.sh` y pegar las cuatro variables en `Backend/.env`.

### Fase D — Supabase (CLI, sin asumir proyecto)

1. Inspección: `supabase --version`, `supabase status`,
   `supabase migration list --linked`, `supabase db --help`; confirmar el
   proyecto piloto antes de tocar la base.
2. **Bloqueante**: comprobar duplicados antes de aplicar 012:
   ```sql
   select lote_id, count(*) from qr_certificado group by lote_id having count(*) > 1;
   ```
   Si hay resultados, detenerse y resolver conservando el certificado válido.
3. Aplicar `011` y `012` con el flujo del CLI.
4. Validación de lectura: historial remoto == local, índice único de
   `qr_certificado.lote_id`, RLS activa, sin `EXECUTE` público en RPCs sensibles,
   `SECURITY DEFINER` con `search_path = ''`, un lote nuevo crea una tarea
   pendiente, reintentar no duplica, y el fencing impide que un worker vencido
   confirme una tarea tomada por otro.

### Fase E — Vercel (secretos por panel/interactivo)

Variables en Production (root `Backend`), con `BEAN_WEB3_MODE=disabled` primero:
`BEAN_WEB3_CHAIN_ID`, `BEAN_WEB3_NETWORK_NAME`, `BEAN_WEB3_RPC_URL`,
`BEAN_WEB3_CONTRACT_ADDRESS`, `BEAN_WEB3_CONTRACT_CODE_HASH`,
`BEAN_WEB3_DEPLOYMENT_BLOCK`, `BEAN_WEB3_EXPLORER_BASE_URL`,
`BEAN_WEB3_EXPLORER_LABEL`, `BEAN_WEB3_CONFIRMATIONS`,
`BEAN_WEB3_PAUSER_ADDRESS`, `BEAN_WEB3_BACKEND_PRIVATE_KEY` (deriva
`0x42cC…d656`) y `CRON_SECRET`. **No** cargar la key admin.

- `Backend/vercel.json`: cron diario `0 3 * * *` (Hobby).
- Endpoint `GET /reconciliar`: `Bearer`, `no-store`, idempotente, sin filtrar
  errores internos.
- Preview con `disabled`: QR `200`, cron sin bearer 401/403, reintento solo admin.
  Solo entonces se habilita Production.

### Fase F — Activación y smoke real

Cambiar `BEAN_WEB3_MODE=anchor`, desplegar Production y ejecutar el flujo
`PENDIENTE → ENVIANDO → ENVIADA → CONFIRMADA` con un lote real; validar en
BaseScan el evento `HashAnchored` (mismo `loteId`/`hashRaiz`) y ≥ 2
confirmaciones. Resiliencia: RPC caído no rompe el QR; clave que deriva otra
dirección es rechazada; wallet sin `ANCHOR_ROLE` queda reintentable; receipt
revertido/evento ausente no confirman; dos workers no duplican tx; pausa bloquea
anclajes y al despausar se reanuda.

### Fase G — Cierre documental

Actualizar `docs/ARCHITECTURE.md`, `docs/06-contratos.md`,
`docs/guia-blockchain-testnet.md`, `Backend/README.md`,
`Backend/tests/integration/test_contrato_api.py` y este reporte con la dirección
del contrato, bloque, code hash, tx de deploy, migraciones aplicadas y fecha del
smoke. Verificación final con la suite completa (Foundry, ruff+pytest, móvil) y
`git status --short` sin secretos.

### Estado de esta entrega

| Elemento | Estado |
|---|---|
| Corrección §0 del smoke + `BEAN_WEB3_PAUSER_ADDRESS` | ✅ hecho y probado |
| `contracts/scripts/post-deploy.sh` (C4) | ✅ hecho y probado en Anvil |
| Fases C–F (deploy, Supabase, Vercel, smoke real) | ⏳ requieren tus claves/acceso |
| Fase G (docs con datos reales) | ⏳ al cerrar el smoke |
