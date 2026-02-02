#!/bin/sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${ROOT_DIR}/logtool/.env"
DEST="${ROOT_DIR}/deploy/helm/logsearch/files/app.env"

if [[ ! -f "$SRC" ]]; then
  echo "Missing source .env at ${SRC}" >&2
  exit 1
fi

mkdir -p "$(dirname "$DEST")"
cp "$SRC" "$DEST"
echo "Synced ${SRC} -> ${DEST}"
