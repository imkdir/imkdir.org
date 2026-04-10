# Deployment Plan

This project deploys as:

- static frontend (`frontend/dist`)
- Node.js backend (`backend/dist/src/index.js`)
- SQLite database (`backend/dev.db`)
- Caddy reverse proxy (shared with other apps on same VPS)

Primary workflow:

1. SSH into VPS
2. `cd <APP_ROOT>`
3. `git pull`
4. `bash scripts/deploy.sh`

## Paths

Use `<APP_ROOT>` as your repo directory on VPS.

Example:

- `<APP_ROOT>=/srv/imkdir-org/current`

Important runtime paths:

- `<APP_ROOT>/frontend/dist`
- `<APP_ROOT>/backend`
- `<APP_ROOT>/backend/dev.db`

## Environment Variables

Backend (`backend/.env`):

- `PORT` (required)
- `OWNER_SECRET_KEY` (required)
- `SQLITE_PATH` (recommended, default `./dev.db` if omitted)
- `DATABASE_URL` (used by Prisma CLI)

Suggested `backend/.env`:

```env
PORT=3011
OWNER_SECRET_KEY=replace-with-a-long-random-secret
SQLITE_PATH="./dev.db"
DATABASE_URL="file:./dev.db"
```

Frontend:

- `VITE_API_BASE_URL` (optional)

Behavior:

- If `VITE_API_BASE_URL` is not set, frontend uses `/api` (same-origin).
- This is ideal when Caddy proxies `/api` to backend.

## First-Time VPS Setup

1. Install dependencies:

```bash
sudo apt update
sudo apt install -y rsync
sudo npm i -g pm2
```

2. Ensure Caddy is already installed/running (shared server setup).
3. Clone repo:

```bash
git clone <your-repo-url> <APP_ROOT>
cd <APP_ROOT>
```

4. Configure backend env:

```bash
cd <APP_ROOT>/backend
cp .env.example .env
# edit .env values
```

5. First deploy:

```bash
cd <APP_ROOT>
bash scripts/deploy.sh
```

## Deploy Script

Run on VPS:

```bash
cd <APP_ROOT>
git pull
bash scripts/deploy.sh
```

Options:

- `--skip-install`
- `--lint`
- `--skip-restart`
- `--skip-healthcheck`
- `--pm2-name <name>`
- `--health-url <url>`

Environment overrides:

- `PORT=3011` (if not set in `backend/.env`)
- `PM2_NAME=imkdir-backend`
- `HEALTHCHECK_URL=http://127.0.0.1:3011/api/health`

What script does:

1. Loads `backend/.env` if present
2. Installs frontend/backend dependencies (`npm ci`)
3. Runs Prisma generate and migrations
4. Builds frontend and backend
5. Restarts backend with PM2
6. Checks `/api/health`

## Caddy Configuration (Shared VPS)

If Caddy already serves another project on `:80`, keep using Caddy and add an additional site block.

Example Caddy block for this app:

```caddy
imkdir.org, www.imkdir.org {
    root * <APP_ROOT>/frontend/dist

    handle /api/* {
        reverse_proxy 127.0.0.1:3011
    }

    handle {
        try_files {path} /index.html
        file_server
    }
}
```

Apply config:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

## If Port Is Already Taken

Pick another backend port and keep it consistent between backend and Caddy.

Example using `3011`:

```bash
cd <APP_ROOT>
git pull
PORT=3011 bash scripts/deploy.sh
```

Then update Caddy `reverse_proxy 127.0.0.1:3011`.

Check listeners:

```bash
sudo ss -ltnp | rg ':80|:3011'
```

## Health Check

Backend endpoint:

- `GET /api/health`

## Backups

Use `scripts/backup-backend.sh`:

```bash
sudo APP_ROOT=<APP_ROOT> BACKUP_DIR=/var/backups/imkdir-org RETENTION_DAYS=7 ./scripts/backup-backend.sh
```

Backs up:

- `<APP_ROOT>/backend/dev.db`
- `<APP_ROOT>/backend/.env`

Example cron:

```cron
15 3 * * * APP_ROOT=<APP_ROOT> BACKUP_DIR=/var/backups/imkdir-org RETENTION_DAYS=7 <APP_ROOT>/scripts/backup-backend.sh >> /var/log/imkdir-backup.log 2>&1
```

## Constraints

- SQLite is suitable for single-node deployments, not multi-writer horizontal scale.

## Future Improvements

- add restore script for backup archives
- move to managed Postgres if horizontal scaling is required
