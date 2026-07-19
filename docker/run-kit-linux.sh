#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
env_file=${1:-"${script_dir}/.env"}

read_env_value() {
  local key=$1
  local fallback=${2:-}
  local value

  value=$(sed -n "s/^${key}=//p" "$env_file" | tail -n 1 | tr -d '\r')
  if [[ -z "$value" ]]; then
    value=$fallback
  fi
  printf '%s' "$value"
}

if [[ ! -f "$env_file" ]]; then
  echo "Missing $env_file. Copy docker/.env.demo.example to docker/.env first." >&2
  exit 1
fi

network_name=$(read_env_value SIM2REAL_DOCKER_NETWORK sim2real-demo_default)
database_url=$(read_env_value AIFACTORY_DATABASE_URL)
storage_host=$(read_env_value AIFACTORY_STORAGE_HOST)
kit_image=$(read_env_value KIT_IMAGE fii-houyiming_streaming:latest)

if [[ -z "$database_url" ]]; then
  echo "AIFACTORY_DATABASE_URL is missing in $env_file." >&2
  echo "The Kit image only reads this full URL; DB_HOST/DB_PORT are not supported." >&2
  exit 1
fi

if [[ -z "$storage_host" || ! -d "$storage_host" ]]; then
  echo "AIFACTORY_STORAGE_HOST must point to an existing host directory: ${storage_host:-<unset>}" >&2
  exit 1
fi

if ! docker network inspect "$network_name" >/dev/null 2>&1; then
  echo "Docker network '$network_name' does not exist." >&2
  echo "Start the compose services first: docker compose -f docker/docker-compose.demo.yml up -d" >&2
  exit 1
fi

if docker container inspect sim2real >/dev/null 2>&1; then
  echo "Container 'sim2real' already exists; refusing to replace it automatically." >&2
  echo "Migrate or remove the existing container explicitly, then rerun this script." >&2
  exit 1
fi

container_id=$(docker run -d \
  --name sim2real \
  --network "$network_name" \
  --network-alias sim2real \
  --gpus all \
  --restart unless-stopped \
  --env AIFACTORY_USD_ROOT=/storage \
  --env "AIFACTORY_DATABASE_URL=$database_url" \
  --publish 8233:8233/tcp \
  --publish 12334:12334/tcp \
  --publish 12333:12333/udp \
  --volume "$storage_host:/storage" \
  "$kit_image")

echo "Started Kit container: $container_id"
echo "Kit port 8011 is internal-only at sim2real:8011; Creator reaches it through :8081/ov/."
