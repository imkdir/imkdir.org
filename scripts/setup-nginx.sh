#!/usr/bin/env bash
set -euo pipefail

# Configure Nginx for imkdir.org on a VPS.
#
# Usage:
#   sudo DOMAIN=imkdir.org ./scripts/setup-nginx.sh
#
# Optional env vars:
#   DOMAIN              Required, e.g. imkdir.org
#   DEPLOY_DIR          Default: /var/www/imkdir-org
#   BACKEND_PORT        Default: 3001
#   SITE_NAME           Default: imkdir-org
#   INCLUDE_WWW         Default: true (adds "www.${DOMAIN}")
#
# This script:
# 1) Writes /etc/nginx/sites-available/${SITE_NAME}
# 2) Enables it in /etc/nginx/sites-enabled
# 3) Validates nginx config
# 4) Reloads nginx

DOMAIN="${DOMAIN:-}"
DEPLOY_DIR="${DEPLOY_DIR:-/var/www/imkdir-org}"
BACKEND_PORT="${BACKEND_PORT:-3001}"
SITE_NAME="${SITE_NAME:-imkdir-org}"
INCLUDE_WWW="${INCLUDE_WWW:-true}"

if [[ -z "${DOMAIN}" ]]; then
  echo "Error: DOMAIN is required. Example:"
  echo "  sudo DOMAIN=imkdir.org ./scripts/setup-nginx.sh"
  exit 1
fi

if [[ "${EUID}" -ne 0 ]]; then
  echo "Error: run as root (or with sudo)."
  exit 1
fi

if ! command -v nginx >/dev/null 2>&1; then
  echo "Error: nginx is not installed."
  exit 1
fi

SERVER_NAMES="${DOMAIN}"
if [[ "${INCLUDE_WWW}" == "true" ]]; then
  SERVER_NAMES="${DOMAIN} www.${DOMAIN}"
fi

SITE_AVAILABLE="/etc/nginx/sites-available/${SITE_NAME}"
SITE_ENABLED="/etc/nginx/sites-enabled/${SITE_NAME}"

cat > "${SITE_AVAILABLE}" <<EOF
server {
    listen 80;
    server_name ${SERVER_NAMES};

    root ${DEPLOY_DIR}/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT}/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        try_files \$uri /index.html;
    }
}
EOF

if [[ -L "${SITE_ENABLED}" || -e "${SITE_ENABLED}" ]]; then
  rm -f "${SITE_ENABLED}"
fi
ln -s "${SITE_AVAILABLE}" "${SITE_ENABLED}"

if [[ -e /etc/nginx/sites-enabled/default ]]; then
  rm -f /etc/nginx/sites-enabled/default
fi

nginx -t
systemctl reload nginx

cat <<MSG
Nginx site configured successfully.

Domain(s): ${SERVER_NAMES}
Frontend root: ${DEPLOY_DIR}/frontend/dist
API upstream: http://127.0.0.1:${BACKEND_PORT}/api/

Next:
1) Ensure backend process is running on port ${BACKEND_PORT}.
2) Add HTTPS with certbot (recommended):
   sudo certbot --nginx -d ${DOMAIN}$( [[ "${INCLUDE_WWW}" == "true" ]] && echo " -d www.${DOMAIN}" )
MSG
