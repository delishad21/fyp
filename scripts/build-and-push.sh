#!/usr/bin/env bash
set -euo pipefail

TAG="latest"
REGISTRY=${REGISTRY:-delishad21}
service_filters=()

usage() {
  cat <<'EOF'
Usage: scripts/build-and-push.sh [tag] [--service name[,name...]] [--tag tag]

Options:
  --service  Build/push only the named service(s). Repeat or comma-separate.
  --tag      Explicit image tag (overrides positional tag).
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
      if [[ "$TAG" == "latest" ]]; then
        TAG="$1"
      else
        echo "Error: unknown argument '$1'"
        usage
        exit 1
      fi
      ;;
  esac
  shift
done

ENV_FILE="${ENV_FILE:-.env.prod}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
else
  echo "Warning: env file not found at $ENV_FILE"
fi

build_args=(
  --build-arg EXPO_PUBLIC_USER_SVC_URL="${EXPO_PUBLIC_USER_SVC_URL:-}"
  --build-arg EXPO_PUBLIC_QUIZ_SVC_URL="${EXPO_PUBLIC_QUIZ_SVC_URL:-}"
  --build-arg EXPO_PUBLIC_CLASS_SVC_URL="${EXPO_PUBLIC_CLASS_SVC_URL:-}"
  --build-arg EXPO_PUBLIC_AI_SVC_URL="${EXPO_PUBLIC_AI_SVC_URL:-}"
)

# Build each service image and push it to the configured registry/tag.
images=(
  "class-service:./services/class-service"
  "quiz-service:./services/quiz-service"
  "user-service:./services/user-service"
  "ai-service:./services/ai-service"
  "web-app:./web-app"
  "phone-app:./phone-app"
  "phone-frame:./phone-app:Dockerfile.frame"
  "phone-web-app:./phone-app:Dockerfile.web-app"
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

for entry in "${images[@]}"; do
  name=${entry%%:*}
  rest=${entry#*:}
  context=${rest%%:*}
  dockerfile=${rest#*:}
  image="$REGISTRY/$name:$TAG"

  if ! matches_filter "$name"; then
    continue
  fi

  if [[ "$dockerfile" == "$context" ]]; then
    echo "Building $image from $context"
    docker build "${build_args[@]}" -t "$image" "$context"
  else
    echo "Building $image from $context (Dockerfile: $dockerfile)"
    docker build "${build_args[@]}" -t "$image" -f "$context/$dockerfile" "$context"
  fi

  echo "Pushing $image"
  docker push "$image"
done

echo "Done."
