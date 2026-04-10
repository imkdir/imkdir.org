#!/usr/bin/env bash
set -euo pipefail

# Backup backend SQLite DB + .env with retention.
#
# Optional env vars:
#   APP_ROOT         default: repo root (parent of this script)
#   DEPLOY_DIR       legacy alias for APP_ROOT
#   BACKUP_DIR       default: /var/backups/imkdir-org
#   RETENTION_DAYS   default: 7
#
# Usage:
#   sudo ./scripts/backup-backend.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

APP_ROOT="${APP_ROOT:-${DEPLOY_DIR:-$PROJECT_ROOT}}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/imkdir-org}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
BACKEND_DIR="${APP_ROOT}/backend"
DB_PATH="${BACKEND_DIR}/dev.db"
ENV_PATH="${BACKEND_DIR}/.env"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE_PATH="${BACKUP_DIR}/imkdir-backup-${TIMESTAMP}.tar.gz"

mkdir -p "${BACKUP_DIR}"

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

if [[ -f "${DB_PATH}" ]]; then
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "${DB_PATH}" ".backup '${TMP_DIR}/dev.db'"
  else
    cp "${DB_PATH}" "${TMP_DIR}/dev.db"
  fi
else
  echo "Warning: DB file not found at ${DB_PATH}"
fi

if [[ -f "${ENV_PATH}" ]]; then
  cp "${ENV_PATH}" "${TMP_DIR}/.env"
else
  echo "Warning: .env file not found at ${ENV_PATH}"
fi

tar -czf "${ARCHIVE_PATH}" -C "${TMP_DIR}" .

find "${BACKUP_DIR}" \
  -maxdepth 1 \
  -type f \
  -name "imkdir-backup-*.tar.gz" \
  -mtime +"${RETENTION_DAYS}" \
  -delete

echo "Backup created: ${ARCHIVE_PATH}"
