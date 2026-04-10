#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"

RUN_INSTALL=1
RUN_LINT=0
RUN_RESTART=1
RUN_HEALTHCHECK=1
PM2_NAME="${PM2_NAME:-imkdir-backend}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-}"

usage() {
  cat <<'EOF'
Usage: scripts/deploy.sh [options]

Run this script directly on the VPS after pulling latest git changes.

Options:
  --skip-install        Skip npm ci for frontend/backend
  --lint                Run frontend lint during deploy
  --skip-restart        Skip PM2 restart/start
  --skip-healthcheck    Skip GET health check after restart
  --pm2-name NAME       PM2 process name (default: imkdir-backend)
  --health-url URL      Health URL (default: http://127.0.0.1:$PORT/api/health)
  --help                Show this help

Environment:
  PM2_NAME              Same as --pm2-name
  HEALTHCHECK_URL       Same as --health-url

Notes:
  - If backend/.env exists, it is loaded automatically.
  - Backend port uses PORT from backend/.env or environment variables.
EOF
}

log() {
  printf '\n==> %s\n' "$1"
}

fail() {
  printf '\nERROR: %s\n' "$1" >&2
  exit 1
}

check_health_with_retry() {
  local url="$1"
  local attempts="${2:-20}"
  local sleep_seconds="${3:-1}"
  local i

  for ((i = 1; i <= attempts; i++)); do
    if curl --fail --silent --show-error "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$sleep_seconds"
  done

  return 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-install)
      RUN_INSTALL=0
      ;;
    --lint)
      RUN_LINT=1
      ;;
    --skip-restart)
      RUN_RESTART=0
      ;;
    --skip-healthcheck)
      RUN_HEALTHCHECK=0
      ;;
    --pm2-name)
      [[ $# -ge 2 ]] || fail "--pm2-name requires a value"
      PM2_NAME="$2"
      shift
      ;;
    --health-url)
      [[ $# -ge 2 ]] || fail "--health-url requires a value"
      HEALTHCHECK_URL="$2"
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown option: $1"
      ;;
  esac
  shift
done

if [[ -f "$BACKEND_DIR/.env" ]]; then
  log "Loading backend environment from backend/.env"
  set -a
  # shellcheck disable=SC1091
  source "$BACKEND_DIR/.env"
  set +a
fi

[[ -n "${PORT:-}" ]] || fail "PORT is required (set in backend/.env or env vars)"
BACKEND_PORT="${PORT}"
if [[ -z "$HEALTHCHECK_URL" ]]; then
  HEALTHCHECK_URL="http://127.0.0.1:${BACKEND_PORT}/api/health"
fi

cd "$ROOT_DIR"

if [[ $RUN_INSTALL -eq 1 ]]; then
  log "Installing frontend dependencies"
  npm ci --prefix frontend

  log "Installing backend dependencies"
  npm ci --prefix backend
else
  log "Skipping dependency install"
fi

log "Generating Prisma client"
npx prisma generate --schema "$BACKEND_DIR/prisma/schema.prisma"

log "Applying Prisma migrations"
npx prisma migrate deploy --schema "$BACKEND_DIR/prisma/schema.prisma" || true

log "Building frontend"
npm run build --prefix frontend

if [[ $RUN_LINT -eq 1 ]]; then
  log "Linting frontend"
  npm run lint --prefix frontend
fi

log "Building backend"
npm run build --prefix backend

if [[ $RUN_RESTART -eq 1 ]]; then
  if ! command -v pm2 >/dev/null 2>&1; then
    fail "pm2 is not installed. Install pm2 or start backend manually."
  fi

  log "Restarting backend with PM2 (${PM2_NAME}) on PORT=${BACKEND_PORT}"
  if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
    PORT="$BACKEND_PORT" pm2 restart "$PM2_NAME" --update-env
  else
    PORT="$BACKEND_PORT" pm2 start "$BACKEND_DIR/dist/src/index.js" --name "$PM2_NAME"
  fi
  pm2 save
fi

if [[ $RUN_HEALTHCHECK -eq 1 ]]; then
  log "Checking health endpoint: ${HEALTHCHECK_URL}"
  if check_health_with_retry "$HEALTHCHECK_URL" 30 1; then
    curl --fail --silent --show-error "$HEALTHCHECK_URL"
    printf '\n'
  else
    printf '\nHealth check failed after retries.\n' >&2
    if command -v pm2 >/dev/null 2>&1; then
      pm2 status "$PM2_NAME" || true
      pm2 logs "$PM2_NAME" --lines 80 --nostream || true
    fi
    fail "Backend did not become healthy at ${HEALTHCHECK_URL}"
  fi
fi

log "Deployment complete"
