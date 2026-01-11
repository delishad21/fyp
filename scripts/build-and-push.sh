#!/usr/bin/env bash
set -euo pipefail

TAG=${1:-latest}
REGISTRY=${REGISTRY:-delishad21}

# Build each service image and push it to the configured registry/tag.
images=(
  "class-service:./services/class-service"
  "quiz-service:./services/quiz-service"
  "user-service:./services/user-service"
  "web-app:./web-app"
  "phone-app:./phone-app"
  "phone-web:./phone-app:Dockerfile.web"
)

for entry in "${images[@]}"; do
  name=${entry%%:*}
  rest=${entry#*:}
  context=${rest%%:*}
  dockerfile=${rest#*:}
  image="$REGISTRY/$name:$TAG"

  if [[ "$dockerfile" == "$context" ]]; then
    echo "Building $image from $context"
    docker build -t "$image" "$context"
  else
    echo "Building $image from $context (Dockerfile: $dockerfile)"
    docker build -t "$image" -f "$context/$dockerfile" "$context"
  fi

  echo "Pushing $image"
  docker push "$image"
done

echo "Done."
