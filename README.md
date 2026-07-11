# Badam Satti

This repository hosts a phone-first card-games site with Badam 7 (Badam Satti) and King’s Corner. Each game has a React + TypeScript client and Node/Express + Socket.io server. Badam also uses SQLite persistence for rooms, players, reconnect state, and rate-limit data.

The public root is a lightweight game chooser. Badam runs at `/badam7/`; King’s Corner runs at `/kings-corner/`. See [`deploy/ROUTING.md`](deploy/ROUTING.md) for the reverse-proxy, SPA fallback, Socket.io, PWA, and backward-compatibility design.

## Requirements

- Node.js 22. The repo includes `.nvmrc`, so `nvm use` is the easiest path.
- npm
- SQLite support through the `sqlite3` npm package

```bash
nvm install
nvm use
npm --prefix client install --include=dev
npm --prefix server install --omit=dev
```

## Local Development

Run the backend and frontend in separate terminals:

```bash
npm --prefix server run dev
```

```bash
npm --prefix client run dev
```

Open `http://localhost:5001/badam7/` for Badam. King’s Corner development runs separately with `npm run dev --prefix kings-corner` and opens at `http://localhost:5101/kings-corner/`.

In this mode Vite serves the React app on port `5001` and proxies `/socket.io` to the backend on `http://localhost:3000`. The backend defaults to port `3000` unless `PORT` is set.

## Running the Built App on Port 5001

To test the production shape locally, build the client and run the Express server on port `5001`:

```bash
npm --prefix client run build
npm --prefix server run start:v2
```

Open `http://localhost:5001` for the landing page or `http://localhost:5001/badam7/` for Badam. This serves `client/dist` from Express and handles Badam Socket.io from the same origin.

To run the complete production shape locally, also build and start King’s Corner:

```bash
npm --prefix kings-corner/client run build
HOST=127.0.0.1 PORT=5100 npm --prefix kings-corner/server start
```

Health check:

```bash
curl http://127.0.0.1:5001/health
```

## LAN Testing

Both dev scripts bind to `0.0.0.0`, so other devices on the same network can connect to your machine.

For Vite development:

```bash
npm --prefix server run dev
npm --prefix client run dev
```

Then open:

```text
http://YOUR_LAN_IP:5001
```

For the built app:

```bash
npm --prefix client run build
npm --prefix server run start:v2
```

Then open the LAN URL printed by the server, usually:

```text
http://YOUR_LAN_IP:5001
```

The server allows localhost, the configured production domains, and private IPv4 LAN origins. If you test from a non-private hostname, add it to `ALLOWED_ORIGINS`.

## Simulation Route

The app includes a local simulation lab at:

```text
/simulation
```

Use `http://localhost:5001/simulation` in development or production. It runs in the frontend and is useful for inspecting deal flow, turn progression, board placement, and winner behavior without creating a multiplayer room.

## Environment Variables

The backend reads environment variables at process start. Copy the production example when deploying. The deploy script loads `.env.production` and then `.env`; for the simple root VPS setup, `.env` is fine:

```bash
cp .env.production.example .env
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | Set to `production` on the VPS. Enables production security headers. |
| `HOST` | `0.0.0.0` | Address the Express server binds to. Use `127.0.0.1` when Caddy is the only public entrypoint. |
| `PORT` | `3000` | Express server port. The production deploy path uses `5001`. |
| `APP_NAME` | `badam-satti` | pm2 process name used by `scripts/deploy-vps.sh`. |
| `APP_URL` | `http://127.0.0.1:5001` | URL used by the deploy script health check. |
| `DB_PATH` | `server/badam-satti.db` | SQLite database location. Use a persistent path such as `/opt/apps/badam-satti/data/badam-satti.db` in production. |
| `KINGS_APP_NAME` | `kings-corner` | King’s Corner PM2 process name. |
| `KINGS_APP_URL` | `http://127.0.0.1:5100/kings-corner/health` | King’s Corner deploy health check. |
| `KINGS_HOST` | `127.0.0.1` | King’s Corner bind address used by the deploy script. |
| `KINGS_PORT` | `5100` | King’s Corner internal port. |
| `ALLOWED_ORIGINS` | empty | Comma-separated extra browser origins allowed by Socket.io/CORS. |
| `IP_HASH_SALT` | random per process | Salt for hashing client IPs in rate-limit records. Set a stable long random value in production. |
| `ADMIN_KEY` | unset | Required for `GET /health/admin` via the `x-admin-key` header. |

Generate secrets with:

```bash
openssl rand -hex 32
```

Example admin health check:

```bash
curl -H "x-admin-key: $ADMIN_KEY" http://127.0.0.1:5001/health/admin
```

## VPS Deployment with nvm, pm2, and Caddy

This is the primary production path for a small VPS.

1. Install system dependencies:

```bash
sudo apt update
sudo apt install -y git curl build-essential caddy
```

1. Install `nvm` for the deploy user, then reopen the shell:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
```

1. Clone the repo:

```bash
sudo mkdir -p /opt/apps
sudo chown "$USER:$USER" /opt/apps
git clone https://github.com/aakashb95/badam-satti.git /opt/apps/badam-satti
cd /opt/apps/badam-satti
```

1. Configure production environment:

```bash
cp .env.production.example .env
nano .env
```

Use values like:

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=5001
APP_NAME=badam-satti
APP_URL=http://127.0.0.1:5001
DB_PATH=/opt/apps/badam-satti/data/badam-satti.db
ALLOWED_ORIGINS=https://badam7.aakashb.xyz,https://www.badam7.aakashb.xyz
IP_HASH_SALT=replace-with-a-long-random-string
ADMIN_KEY=replace-with-a-long-random-string
```

1. Deploy:

```bash
chmod +x scripts/deploy-vps.sh
./scripts/deploy-vps.sh
```

The script runs `git pull --ff-only`, installs Node from `.nvmrc`, installs dependencies, builds the client, starts or restarts `server/index.js` with pm2, saves the pm2 process list, and checks `/health`.

1. Configure pm2 startup after the first successful deploy:

```bash
pm2 startup
```

Run the command that pm2 prints, then:

```bash
pm2 save
```

1. Configure Caddy:

```bash
sudo cp deploy/Caddyfile.example /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

The example routes King’s Corner to `127.0.0.1:5100` and everything else (landing, Badam, and legacy Badam links) to `127.0.0.1:5001`:

```caddyfile
badam7.aakashb.xyz {
  encode zstd gzip
  handle /kings-corner* {
    reverse_proxy 127.0.0.1:5100
  }
  handle {
    reverse_proxy 127.0.0.1:5001
  }
}
```

For future deploys:

```bash
cd /opt/apps/badam-satti
./scripts/deploy-vps.sh
```

## GitHub Actions Deployment

The repo includes `.github/workflows/deploy.yml`. Pull requests build and test both games without deploying. A push to `master` (or a manual dispatch) deploys only after those checks pass.

Required repository secrets:

| Secret | Value |
| --- | --- |
| `VPS_HOST` | VPS IP or hostname, for example `157.180.81.97` |
| `VPS_USER` | SSH user, for example `deploy` |
| `VPS_PORT` | SSH port, usually `22` |
| `VPS_APP_DIR` | App directory on the VPS, for example `/opt/apps/badam-satti` |
| `VPS_SSH_KEY` | Private SSH key allowed to log in as `VPS_USER` |

The deploy job SSHes into the VPS and runs:

```bash
cd "$VPS_APP_DIR"
git fetch origin
git reset --hard origin/master
./scripts/deploy-vps.sh
```

The VPS script builds both clients and manages the `badam-satti` and `kings-corner` PM2 processes. Useful operations:

```bash
pm2 status
pm2 logs badam-satti --lines 100
pm2 logs kings-corner --lines 100
curl http://127.0.0.1:5001/health
curl http://127.0.0.1:5100/kings-corner/health
```

## Security and Deployment Notes

- Keep `HOST=127.0.0.1` in production when Caddy is reverse proxying to Node. Do not expose the Node port directly unless you mean to.
- Set stable production values for `IP_HASH_SALT` and `ADMIN_KEY`. Do not rely on the random per-process fallback for production.
- Keep `ALLOWED_ORIGINS` limited to your real HTTPS domains. Localhost and private LAN origins are allowed separately for development and LAN testing.
- Persist `DB_PATH` outside transient build directories and back up the SQLite file before destructive server maintenance.
- Terminate TLS at Caddy and let it manage certificates.
- The public `/health` endpoint only returns minimal status. Use `/health/admin` with `x-admin-key` for detailed diagnostics.

## Optional Docker Path

Docker is available, but the nvm + pm2 + Caddy flow above is the primary VPS deployment path.

Build and run with Compose:

```bash
docker compose up --build -d
```

The container listens on port `5001` and stores SQLite data in `./data` through the Compose volume.

Check it:

```bash
curl http://127.0.0.1:5001/health
docker compose logs -f
```

For production Docker use, replace the placeholder `IP_HASH_SALT` and `ADMIN_KEY` values in `docker-compose.yml` or pass them through a deployment-specific environment file.

## Checks

```bash
npm --prefix client run lint
npm --prefix client run build
git diff --check
```
