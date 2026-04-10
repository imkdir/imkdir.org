#!/usr/bin/env bash
set -euo pipefail

# Install/update an idempotent daily cron job for backend backups.
#
# Optional env vars:
#   APP_ROOT         default: repo root (parent of this script)
#   BACKUP_DIR       default: /var/backups/imkdir-org
#   RETENTION_DAYS   default: 7
#   CRON_SCHEDULE    default: 15 3 * * *
#   LOG_PATH         default: /var/log/imkdir-backup.log
#
# Usage:
#   bash scripts/install-backup-cron.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="${APP_ROOT:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/imkdir-org}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
CRON_SCHEDULE="${CRON_SCHEDULE:-15 3 * * *}"
LOG_PATH="${LOG_PATH:-/var/log/imkdir-backup.log}"
MARKER="# imkdir-org-backup"

if ! command -v crontab >/dev/null 2>&1; then
  echo "ERROR: crontab command not found."
  exit 1
fi

BACKUP_SCRIPT="${APP_ROOT}/scripts/backup-backend.sh"
if [[ ! -x "${BACKUP_SCRIPT}" ]]; then
  echo "ERROR: backup script not executable: ${BACKUP_SCRIPT}"
  exit 1
fi

JOB_LINE="${CRON_SCHEDULE} APP_ROOT=${APP_ROOT} BACKUP_DIR=${BACKUP_DIR} RETENTION_DAYS=${RETENTION_DAYS} /bin/bash ${BACKUP_SCRIPT} >> ${LOG_PATH} 2>&1 ${MARKER}"

TMP_FILE="$(mktemp)"
cleanup() {
  rm -f "${TMP_FILE}"
}
trap cleanup EXIT

if crontab -l >/dev/null 2>&1; then
  crontab -l | grep -vF "${MARKER}" > "${TMP_FILE}" || true
fi

echo "${JOB_LINE}" >> "${TMP_FILE}"
crontab "${TMP_FILE}"

echo "Installed cron job:"
echo "${JOB_LINE}"
