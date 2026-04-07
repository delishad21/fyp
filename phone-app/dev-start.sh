#!/bin/sh
set -eu

LOCKFILE="/app/package-lock.json"
NODE_MODULES="/app/node_modules"
STAMP_FILE="$NODE_MODULES/.package-lock.sha256"
DATETIMEPICKER_DIR="$NODE_MODULES/@react-native-community/datetimepicker"

mkdir -p "$NODE_MODULES"

CURRENT_HASH="$(sha256sum "$LOCKFILE" | awk '{print $1}')"
STORED_HASH=""

if [ -f "$STAMP_FILE" ]; then
  STORED_HASH="$(cat "$STAMP_FILE")"
fi

if [ "$CURRENT_HASH" != "$STORED_HASH" ] || [ ! -d "$DATETIMEPICKER_DIR" ]; then
  echo "[phone-app] syncing node_modules with package-lock.json"
  npm ci
  printf '%s' "$CURRENT_HASH" > "$STAMP_FILE"
fi

exec npm run start -- --host lan --port 8081
