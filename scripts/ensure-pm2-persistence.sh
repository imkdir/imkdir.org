#!/usr/bin/env bash
set -euo pipefail

# Ensure PM2 process list is saved and PM2 is configured to start on boot.
#
# Optional env vars:
#   PM2_SYSTEM_USER   default: current user (or SUDO_USER when set)
#   PM2_SYSTEM_HOME   default: resolved home directory of PM2_SYSTEM_USER
#
# Usage:
#   bash scripts/ensure-pm2-persistence.sh

TARGET_USER="${PM2_SYSTEM_USER:-${SUDO_USER:-$USER}}"
if command -v getent >/dev/null 2>&1; then
  TARGET_HOME_DEFAULT="$(getent passwd "${TARGET_USER}" | cut -d: -f6)"
else
  TARGET_HOME_DEFAULT="$(awk -F: -v user="${TARGET_USER}" '$1 == user { print $6 }' /etc/passwd | head -n 1)"
fi
TARGET_HOME="${PM2_SYSTEM_HOME:-${TARGET_HOME_DEFAULT:-$HOME}}"
SERVICE_NAME="pm2-${TARGET_USER}"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "ERROR: pm2 not found in PATH."
  exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
  echo "INFO: systemctl not found; skipping startup service setup."
  pm2 save
  exit 0
fi

echo "==> Saving PM2 process list"
pm2 save

if systemctl is-enabled "${SERVICE_NAME}" >/dev/null 2>&1; then
  echo "==> PM2 startup service already enabled: ${SERVICE_NAME}"
else
  echo "==> Enabling PM2 startup service: ${SERVICE_NAME}"
  if [[ "${EUID}" -eq 0 ]]; then
    pm2 startup systemd -u "${TARGET_USER}" --hp "${TARGET_HOME}"
  elif command -v sudo >/dev/null 2>&1; then
    sudo pm2 startup systemd -u "${TARGET_USER}" --hp "${TARGET_HOME}"
  else
    echo "ERROR: Need root privileges (or sudo) to enable systemd service."
    exit 1
  fi
fi

echo "==> Saving PM2 process list again"
pm2 save

if systemctl is-enabled "${SERVICE_NAME}" >/dev/null 2>&1; then
  echo "PM2 persistence ready (${SERVICE_NAME} enabled)."
else
  echo "WARNING: ${SERVICE_NAME} is still not enabled. Check systemd logs."
fi
