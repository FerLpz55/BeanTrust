#!/usr/bin/env bash
# Descarga las dependencias de Foundry fijadas por SHA y regenera remappings.txt.
# Uso: contracts/scripts/bootstrap-deps.sh   (idempotente)
set -euo pipefail

raiz="$(cd "$(dirname "$0")/.." && pwd)"
cd "$raiz"

mkdir -p lib

while IFS='=' read -r nombre referencia; do
  [ -z "${nombre:-}" ] && continue
  url="${referencia%@*}"
  sha="${referencia##*@}"
  destino="lib/$nombre"

  if [ -d "$destino/.git" ] && [ "$(git -C "$destino" rev-parse HEAD)" = "$sha" ]; then
    echo "ok $nombre@$sha (ya presente)"
    continue
  fi

  echo "clonando $nombre@$sha"
  rm -rf "$destino"
  git clone --quiet --filter=blob:none "$url" "$destino"
  git -C "$destino" checkout --quiet "$sha"

  actual="$(git -C "$destino" rev-parse HEAD)"
  if [ "$actual" != "$sha" ]; then
    echo "ERROR: $nombre está en $actual, se esperaba $sha" >&2
    exit 1
  fi
done < DEPENDENCIES.lock

cat > remappings.txt <<'EOF'
@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/
forge-std/=lib/forge-std/src/
EOF

echo "dependencias listas; remappings.txt regenerado"
