#!/usr/bin/env bash
# Captura la identidad del despliegue y valida roles/retardo (solo lectura).
# Emite únicamente variables NO secretas para pegar en Backend/.env.
#
# Requiere: CONTRACT_ADDRESS, DEPLOY_TX, DEFAULT_ADMIN_ADDRESS,
#           BACKEND_ANCHOR_ADDRESS y (opcional) PAUSER_ADDRESS, RPC.
#
# Uso:
#   cd contracts
#   set -a; source .env; set +a
#   CONTRACT_ADDRESS=0x... DEPLOY_TX=0x... ./scripts/post-deploy.sh
set -euo pipefail

RPC="${BASE_SEPOLIA_RPC_URL:-https://sepolia.base.org}"
CHAIN_ID_ESPERADO="${EXPECTED_CHAIN_ID:-84532}"
CONTRATO="${CONTRACT_ADDRESS:?Falta CONTRACT_ADDRESS}"
DEPLOY_TX="${DEPLOY_TX:?Falta DEPLOY_TX}"
ADMIN="${DEFAULT_ADMIN_ADDRESS:?Falta DEFAULT_ADMIN_ADDRESS}"
ANCHOR="${BACKEND_ANCHOR_ADDRESS:?Falta BACKEND_ANCHOR_ADDRESS}"
PAUSER="${PAUSER_ADDRESS:-$ADMIN}"
DELAY_ESPERADO="${ADMIN_DELAY_SECONDS:-172800}"

fallar() { echo "[FALLA] $*" >&2; exit 1; }

chain_id="$(cast chain-id --rpc-url "$RPC")"
[ "$chain_id" = "$CHAIN_ID_ESPERADO" ] || fallar "chain id $chain_id != $CHAIN_ID_ESPERADO"
echo "[ok] chain id $chain_id"

codigo="$(cast code "$CONTRATO" --rpc-url "$RPC")"
[ "$codigo" != "0x" ] || fallar "sin bytecode en $CONTRATO"
echo "[ok] bytecode presente"

estado="$(cast receipt "$DEPLOY_TX" status --rpc-url "$RPC")"
case "$estado" in
  1|true) ;;
  *) fallar "el deploy revirtió (status=$estado)" ;;
esac
bloque="$(cast receipt "$DEPLOY_TX" blockNumber --rpc-url "$RPC")"
echo "[ok] deploy status 1, bloque $bloque"

tiene_rol() {
  cast call "$CONTRATO" "hasRole(bytes32,address)(bool)" \
    "$(cast keccak "$1")" "$2" --rpc-url "$RPC"
}

[ "$(tiene_rol ANCHOR_ROLE "$ANCHOR")" = "true" ] || fallar "ANCHOR_ROLE ausente en $ANCHOR"
[ "$(tiene_rol PAUSER_ROLE "$PAUSER")" = "true" ] || fallar "PAUSER_ROLE ausente en $PAUSER"
[ "$(tiene_rol ANCHOR_ROLE "$ADMIN")" = "false" ] || fallar "la admin no debe tener ANCHOR_ROLE"
[ "$(tiene_rol PAUSER_ROLE "$ANCHOR")" = "false" ] || fallar "la wallet caliente no debe tener PAUSER_ROLE"
echo "[ok] roles mínimos (admin no ancla; wallet caliente no pausa)"

delay="$(cast call "$CONTRATO" "defaultAdminDelay()(uint48)" --rpc-url "$RPC" | awk '{print $1}')"
[ "$delay" = "$DELAY_ESPERADO" ] || fallar "retardo admin $delay != $DELAY_ESPERADO"
echo "[ok] retardo admin $delay s"

topic="$(cast keccak "HashAnchored(bytes32,bytes32,address,uint256)")"
echo "[ok] topic HashAnchored $topic"

code_hash="$(cast keccak "$codigo")"

cat <<EOF

# Pega en Backend/.env (no son secretos):
BEAN_WEB3_CONTRACT_ADDRESS=$CONTRATO
BEAN_WEB3_DEPLOYMENT_BLOCK=$bloque
BEAN_WEB3_CONTRACT_CODE_HASH=$code_hash
BEAN_WEB3_PAUSER_ADDRESS=$PAUSER
EOF

echo
echo "Explorer: ${BEAN_WEB3_EXPLORER_BASE_URL:-https://sepolia.basescan.org}/address/$CONTRATO"
echo "Deploy tx: ${BEAN_WEB3_EXPLORER_BASE_URL:-https://sepolia.basescan.org}/tx/$DEPLOY_TX"
