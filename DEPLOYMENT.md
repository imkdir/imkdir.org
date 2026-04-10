# Deployment Plan

This project is best deployed as:

- a static frontend build (`frontend/dist`)
- a Node.js backend process (`backend/dist/src/index.js`)
- a persistent SQLite database file (`backend/dev.db`)

The current backend uses `better-sqlite3` with a local SQLite file and is designed for single-node deployment.

## Recommended Architecture

Use one Linux VM/VPS for both frontend and backend:

- `Node.js 22+`
- `npm 10+`
- `pm2` for backend process management
- `nginx` or `Caddy` as reverse proxy

Recommended paths:

- app root: `/var/www/imkdir-org`
- frontend build: `/var/www/imkdir-org/frontend/dist`
- backend app: `/var/www/imkdir-org/backend`
- sqlite db: `/var/www/imkdir-org/backend/dev.db`

Notes:

- VPS deploy flow is scripted in [`scripts/deploy.sh`](/Users/imkdir/Projects/imkdir.org/scripts/deploy.sh).
- `backend/dev.db` remains on VPS and persists across deploys.

## Environment Variables

Backend supports:

- `PORT` (optional, default `3001`)
- `OWNER_SECRET_KEY` (required for owner-mode auth in production)
- `SQLITE_PATH` (optional, default `./dev.db`)
- `DATABASE_URL` (used by Prisma tooling/migrations; runtime currently uses `./dev.db`)

Suggested backend `.env` on VPS (`/var/www/imkdir-org/backend/.env`):

```env
PORT=3001
OWNER_SECRET_KEY=replace-with-a-long-random-secret
SQLITE_PATH="./dev.db"
DATABASE_URL="file:./dev.db"
```

Frontend currently calls API at `http://localhost:3001/api` in source code.  
In production, use reverse proxy so browser requests stay same-origin.

## First-Time Server Setup

1. Install system packages:

```bash
sudo apt update
sudo apt install -y nginx rsync
```

2. Install Node.js (22+) and npm (10+).
3. Install PM2 globally:

```bash
sudo npm i -g pm2
```

4. Create deploy directory:

```bash
sudo mkdir -p /var/www/imkdir-org
sudo chown -R $USER:$USER /var/www/imkdir-org
```

5. Clone repo on VPS:

```bash
cd /var/www
git clone <your-repo-url> imkdir-org
cd /var/www/imkdir-org
```

6. On VPS, create backend `.env`:

```bash
cd /var/www/imkdir-org/backend
cp .env.example .env 2>/dev/null || true
cat > .env <<'EOF'
PORT=3001
OWNER_SECRET_KEY=replace-with-a-long-random-secret
SQLITE_PATH="./dev.db"
DATABASE_URL="file:./dev.db"
EOF
```

7. Run deploy script on VPS:

```bash
bash scripts/deploy.sh
```

8. Configure Nginx on VPS using the helper script:

```bash
sudo DOMAIN=imkdir.org BACKEND_PORT=3001 ./scripts/setup-nginx.sh
```

## Release Procedure

For each deploy on VPS:

```bash
cd /var/www/imkdir-org
git pull
bash scripts/deploy.sh
```

Optional variables:

- `PM2_NAME` (default `imkdir-backend`)
- `HEALTHCHECK_URL` (default `http://127.0.0.1:$PORT/api/health`)
- `PORT` via `backend/.env` (default `3001`)

What script does:

1. Loads backend env from `backend/.env` (if present).
2. Installs dependencies (`npm ci`) for frontend/backend.
3. Runs Prisma generate and migrations.
4. Builds frontend and backend.
5. Restarts/starts backend via PM2.
6. Verifies `/api/health`.

## Reverse Proxy (Nginx)

You can configure Nginx automatically:

```bash
sudo DOMAIN=imkdir.org BACKEND_PORT=3001 ./scripts/setup-nginx.sh
```

Optional vars for this script:

- `DEPLOY_DIR` (default `/var/www/imkdir-org`)
- `SITE_NAME` (default `imkdir-org`)
- `INCLUDE_WWW` (default `true`)

Example single-domain config (`imkdir.org`) with API proxy:

```nginx
server {
    listen 80;
    server_name imkdir.org www.imkdir.org;

    root /var/www/imkdir-org/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri /index.html;
    }
}
```

Then enable and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## If Backend Port Is Already Taken

Yes, this is common when multiple projects share one VPS.

1. Pick a free port (example `3011`).
2. Deploy backend with that port:

```bash
cd /var/www/imkdir-org
git pull
PORT=3011 bash scripts/deploy.sh
```

3. Configure Nginx to proxy `/api` to the same port:

```bash
sudo DOMAIN=imkdir.org BACKEND_PORT=3011 ./scripts/setup-nginx.sh
```

4. Check which process currently uses a port:

```bash
sudo ss -ltnp | rg ':3001|:3011'
```

Important:

- backend `PORT` in `.env` (or shell env) controls PM2 runtime port for this app.
- `BACKEND_PORT` in `setup-nginx.sh` must match backend `PORT`.

## Can One VPS Host Multiple Vite Projects?

Yes. A single VPS can host multiple Vite-built apps.

Common patterns:

- separate domains/subdomains per app:
  - `app1.example.com` -> `/var/www/app1/dist`
  - `app2.example.com` -> `/var/www/app2/dist`
- or same domain with path prefixes:
  - `/app1` and `/app2` (requires base path config in each frontend build)

For multiple backends, run each on a different local port (`3001`, `3002`, etc.) and route with Nginx by domain or path.

## Post-Deploy Verification

Check after each deploy:

1. Frontend loads from domain.
2. `GET /api/health` responds.
3. Owner login works using `OWNER_SECRET_KEY`.
4. CRUD works for folders/prompts in owner mode.
5. Viewer mode only sees public items.

## Backup Plan

Back up:

- `/var/www/imkdir-org/backend/dev.db`
- `/var/www/imkdir-org/backend/.env`

Minimum recommendation:

- daily DB backup
- keep at least 7 restore points

SQLite note:

- for safest backups, briefly stop backend process or use SQLite online backup tooling.

Automated backup script is available:

```bash
sudo DEPLOY_DIR=/var/www/imkdir-org BACKUP_DIR=/var/backups/imkdir-org RETENTION_DAYS=7 ./scripts/backup-backend.sh
```

Example cron (daily at 03:15):

```cron
15 3 * * * DEPLOY_DIR=/var/www/imkdir-org BACKUP_DIR=/var/backups/imkdir-org RETENTION_DAYS=7 /var/www/imkdir-org/scripts/backup-backend.sh >> /var/log/imkdir-backup.log 2>&1
```

## Known Deployment Constraints

- SQLite is suitable for single-node deployments, not multi-writer horizontal scale.

## Recommended Follow-Ups

- move frontend API base URL to env for multi-environment builds
- add restore script companion for backup archives
- consider managed Postgres if horizontal scale is needed
