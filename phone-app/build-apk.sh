#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

presentation_env=".env.presentation"
active_env=".env"
backup_env=""

if [[ ! -f "$presentation_env" ]]; then
  echo "Missing $presentation_env"
  exit 1
fi

cleanup() {
  if [[ -n "$backup_env" && -f "$backup_env" ]]; then
    mv "$backup_env" "$active_env"
  else
    rm -f "$active_env"
  fi
}

trap cleanup EXIT

if [[ -f "$active_env" ]]; then
  backup_env="$(mktemp .env.backup.XXXXXX)"
  cp "$active_env" "$backup_env"
fi

cp "$presentation_env" "$active_env"

# Android Gradle plugin (Expo SDK 54 toolchain) requires Java 17.
if [[ -d "/usr/lib/jvm/java-17-openjdk-amd64" ]]; then
  export JAVA_HOME="/usr/lib/jvm/java-17-openjdk-amd64"
elif [[ -d "/usr/lib/jvm/java-1.17.0-openjdk-amd64" ]]; then
  export JAVA_HOME="/usr/lib/jvm/java-1.17.0-openjdk-amd64"
fi
if [[ -n "${JAVA_HOME:-}" ]]; then
  export PATH="$JAVA_HOME/bin:$PATH"
fi

local_requested=0
for arg in "$@"; do
  if [[ "$arg" == "--local" ]]; then
    local_requested=1
    break
  fi
done

detect_android_sdk() {
  local candidates=(
    "${ANDROID_SDK_ROOT:-}"
    "${ANDROID_HOME:-}"
    "$HOME/Android/Sdk"
    "$HOME/Android/sdk"
    /mnt/c/Users/*/AppData/Local/Android/Sdk
  )

  local sdk_path
  for sdk_path in "${candidates[@]}"; do
    if [[ -n "$sdk_path" && -d "$sdk_path" ]]; then
      echo "$sdk_path"
      return 0
    fi
  done
  return 1
}

if sdk_path="$(detect_android_sdk)"; then
  export ANDROID_HOME="$sdk_path"
  export ANDROID_SDK_ROOT="$sdk_path"
  export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
elif [[ "$local_requested" -eq 1 ]]; then
  echo "Android SDK not found. Install Android SDK and set ANDROID_HOME/ANDROID_SDK_ROOT, then rerun."
  echo "Checked: \$HOME/Android/Sdk, \$HOME/Android/sdk, and /mnt/c/Users/*/AppData/Local/Android/Sdk"
  exit 1
fi

npx eas-cli build --platform android --profile presentation "$@"
