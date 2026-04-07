#!/usr/bin/env bash
set -euo pipefail

TAG=""
REGISTRY=${REGISTRY:-}
ENV_FILE="${ENV_FILE:-.env.prod}"
VERSION_PREFIX="${VERSION_PREFIX:-v}"
service_filters=()
published_env_updates=()
docker_push_config_dir=""

usage() {
  cat <<'EOF'
Usage: scripts/build-and-push.sh [--service name[,name...]] [--tag vN]

Options:
  --service  Build/push only the named service(s). Repeat or comma-separate.
  --tag      Explicit version tag to publish. If omitted, increments IMAGE_TAG from .env.prod.
  -h, --help Show this help.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --service)
      shift
      if [[ -z "${1:-}" ]]; then
        echo "Error: --service requires a value"
        usage
        exit 1
      fi
      IFS=',' read -r -a services <<<"$1"
      service_filters+=("${services[@]}")
      ;;
    --tag)
      shift
      if [[ -z "${1:-}" ]]; then
        echo "Error: --tag requires a value"
        usage
        exit 1
      fi
      TAG="$1"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Error: unknown argument '$1'"
      usage
      exit 1
      ;;
  esac
  shift
done

if [[ -f "$ENV_FILE" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" ]] && continue
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    key=${line%%=*}
    value=${line#*=}
    export "$key=$value"
  done < "$ENV_FILE"
else
  echo "Warning: env file not found at $ENV_FILE"
fi

REGISTRY=${REGISTRY:-delishad21}

images=(
  "gateway:fyp-gateway:./nginx:Dockerfile.gateway:GATEWAY_IMAGE"
  "user-service:fyp-user-service:./services/user-service::USER_SERVICE_IMAGE"
  "class-service:fyp-class-service:./services/class-service::CLASS_SERVICE_IMAGE"
  "quiz-service:fyp-quiz-service:./services/quiz-service::QUIZ_SERVICE_IMAGE"
  "ai-service:fyp-ai-service:./services/ai-service::AI_SERVICE_IMAGE"
  "game-service:fyp-game-service:./services/game-service::GAME_SERVICE_IMAGE"
  "web-app:fyp-web-app:./web-app::WEB_APP_IMAGE"
  "phone-frame:fyp-phone-frame:./phone-app:Dockerfile.frame:PHONE_FRAME_IMAGE"
  "phone-web-app:fyp-phone-web-app:./phone-app:Dockerfile.web-app:PHONE_WEB_APP_IMAGE"
)

matches_filter() {
  local name=$1
  if [[ ${#service_filters[@]} -eq 0 ]]; then
    return 0
  fi
  for s in "${service_filters[@]}"; do
    if [[ "$name" == "$s" ]]; then
      return 0
    fi
  done
  return 1
}

resolve_next_tag() {
  local current_tag=${IMAGE_TAG:-}

  if [[ -n "$TAG" ]]; then
    echo "$TAG"
    return
  fi

  if [[ "$current_tag" =~ ^${VERSION_PREFIX}([0-9]+)$ ]]; then
    echo "${VERSION_PREFIX}$((BASH_REMATCH[1] + 1))"
    return
  fi

  if [[ "$current_tag" =~ ^([0-9]+)$ ]]; then
    echo "$((BASH_REMATCH[1] + 1))"
    return
  fi

  echo "${VERSION_PREFIX}1"
}

resolve_repository() {
  local image_var=$1
  local fallback_repo=$2
  local configured_image=${!image_var:-}

  if [[ -n "$configured_image" ]]; then
    echo "${configured_image%:*}"
    return
  fi

  echo "$fallback_repo"
}

cleanup() {
  if [[ -n "$docker_push_config_dir" && -d "$docker_push_config_dir" ]]; then
    rm -rf "$docker_push_config_dir"
  fi
}

trap cleanup EXIT

upsert_env_value() {
  local key=$1
  local value=$2

  if [[ ! -f "$ENV_FILE" ]]; then
    return
  fi

  local tmp
  tmp=$(mktemp)

  if grep -q "^${key}=" "$ENV_FILE"; then
    awk -F= -v key="$key" -v value="$value" '
      BEGIN { updated = 0 }
      $1 == key {
        print key "=" value
        updated = 1
        next
      }
      { print }
      END {
        if (!updated) {
          print key "=" value
        }
      }
    ' "$ENV_FILE" > "$tmp"
  else
    cat "$ENV_FILE" > "$tmp"
    printf '%s=%s\n' "$key" "$value" >> "$tmp"
  fi

  mv "$tmp" "$ENV_FILE"
}

ensure_push_config() {
  if [[ -n "$docker_push_config_dir" ]]; then
    return
  fi

  local docker_config_file=${HOME}/.docker/config.json
  if [[ ! -f "$docker_config_file" ]]; then
    return
  fi

  if ! grep -q '"credsStore"[[:space:]]*:[[:space:]]*"desktop.exe"' "$docker_config_file"; then
    return
  fi

  if ! command -v docker-credential-desktop.exe >/dev/null 2>&1; then
    return
  fi

  local creds_json docker_user docker_secret
  creds_json=$(printf 'https://index.docker.io/v1/\n' | docker-credential-desktop.exe get 2>/dev/null || true)
  docker_user=$(printf '%s' "$creds_json" | sed -n 's/.*"Username":"\([^"]*\)".*/\1/p')
  docker_secret=$(printf '%s' "$creds_json" | sed -n 's/.*"Secret":"\([^"]*\)".*/\1/p')

  if [[ -z "$docker_user" || -z "$docker_secret" ]]; then
    return
  fi

  docker_push_config_dir=$(mktemp -d)
  printf '%s' "$docker_secret" | docker --config "$docker_push_config_dir" login -u "$docker_user" --password-stdin >/dev/null
}

push_image() {
  local image=$1

  ensure_push_config
  if [[ -n "$docker_push_config_dir" ]]; then
    docker --config "$docker_push_config_dir" push "$image"
    return
  fi

  docker push "$image"
}

buildx_push() {
  ensure_push_config
  if [[ -n "$docker_push_config_dir" ]]; then
    DOCKER_CONFIG="$docker_push_config_dir" docker buildx build "$@" --push
    return
  fi

  docker buildx build "$@" --push
}

TAG=$(resolve_next_tag)

phone_web_user_url=${PHONE_WEB_USER_SVC_URL:-${EXPO_PUBLIC_USER_SVC_URL:-}}
phone_web_quiz_url=${PHONE_WEB_QUIZ_SVC_URL:-${EXPO_PUBLIC_QUIZ_SVC_URL:-}}
phone_web_class_url=${PHONE_WEB_CLASS_SVC_URL:-${EXPO_PUBLIC_CLASS_SVC_URL:-}}
phone_web_game_url=${PHONE_WEB_GAME_SVC_URL:-${EXPO_PUBLIC_GAME_SVC_URL:-}}

platform_args=()
if [[ -n "${DOCKER_PLATFORM:-}" ]]; then
  platform_args=(--platform "$DOCKER_PLATFORM")
fi

build_args=(
  --build-arg EXPO_PUBLIC_USER_SVC_URL="$phone_web_user_url"
  --build-arg EXPO_PUBLIC_QUIZ_SVC_URL="$phone_web_quiz_url"
  --build-arg EXPO_PUBLIC_CLASS_SVC_URL="$phone_web_class_url"
  --build-arg EXPO_PUBLIC_GAME_SVC_URL="$phone_web_game_url"
)

echo "Publishing image version: $TAG"

for entry in "${images[@]}"; do
  IFS=':' read -r name repo_name context dockerfile image_var <<<"$entry"

  if ! matches_filter "$name"; then
    continue
  fi

  repository=$(resolve_repository "$image_var" "$REGISTRY/$repo_name")
  version_image="${repository}:${TAG}"
  latest_image="${repository}:latest"
  published_env_updates+=("${image_var}:${version_image}")

  if [[ -z "$dockerfile" ]]; then
    echo "Building $version_image and $latest_image from $context"
    if [[ ${#platform_args[@]} -gt 0 ]]; then
      buildx_push \
        "${platform_args[@]}" \
        "${build_args[@]}" \
        -t "$version_image" \
        -t "$latest_image" \
        "$context"
    else
      docker build "${build_args[@]}" -t "$version_image" -t "$latest_image" "$context"
      echo "Pushing $version_image"
      push_image "$version_image"
      echo "Pushing $latest_image"
      push_image "$latest_image"
    fi
  else
    echo "Building $version_image and $latest_image from $context (Dockerfile: $dockerfile)"
    if [[ ${#platform_args[@]} -gt 0 ]]; then
      buildx_push \
        "${platform_args[@]}" \
        "${build_args[@]}" \
        -t "$version_image" \
        -t "$latest_image" \
        -f "$context/$dockerfile" \
        "$context"
    else
      docker build "${build_args[@]}" -t "$version_image" -t "$latest_image" -f "$context/$dockerfile" "$context"
      echo "Pushing $version_image"
      push_image "$version_image"
      echo "Pushing $latest_image"
      push_image "$latest_image"
    fi
  fi
done

if [[ -f "$ENV_FILE" ]]; then
  upsert_env_value "IMAGE_TAG" "$TAG"

  for entry in "${published_env_updates[@]}"; do
    IFS=':' read -r image_var published_image <<<"$entry"
    upsert_env_value "$image_var" "$published_image"
  done
fi

echo "Done. Published version tag: $TAG"
