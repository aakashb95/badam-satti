# Game Desk — Badam Satti, King’s Corner & Kitchen Clash

A phone-first multiplayer games site hosted under one roof, with private room codes, no accounts, and a lightweight static game chooser at `/`.

Each game runs as a React + TypeScript + Vite frontend paired with a Node/Express + Socket.io backend. Badam 7 also uses SQLite to persist rooms, players, reconnection state, and rate limits.

## Games

| Game | Path | Players | Notes |
| --- | --- | --- | --- |
| **Badam 7** (Badam Satti / Sevens) | `/badam7/` | 3–11 (plus solo practice with 3–10 bots) | 7-round cumulative play, SQLite persistence, scoped PWA. |
| **King’s Corner** | `/kings-corner/` | 2–4 | Independent client & server under [`kings-corner/`](kings-corner/README.md). |
| **Kitchen Clash** | `/kitchen-clash/` | 1–6 (solo + real-time multiplayer) | Independent client & server under [`kitchen-clash/`](kitchen-clash/README.md). |

See [`PRODUCT_PRINCIPLES.md`](PRODUCT_PRINCIPLES.md) before changing gameplay, card layout, timers, or connection behavior, and [`deploy/ROUTING.md`](deploy/ROUTING.md) for the reverse-proxy, SPA fallback, Socket.io, PWA, and backward-compatibility design.

## Repository Layout

```text
.
├── landing/             # Static Game Desk chooser served at /
├── client/              # Badam 7 React + TypeScript client (Vite base: /badam7/)
├── server/              # Badam 7 Express + Socket.io + SQLite server
├── kings-corner/        # King’s Corner client, server, and e2e tests
├── kitchen-clash/       # Kitchen Clash client and server
├── deploy/              # Caddyfile.example and ROUTING.md
└── scripts/             # VPS deployment script (deploy-vps.sh)
```

## Requirements

- **Node.js 22** (pinned in `.nvmrc`; `nvm use` is the easiest path)
- **npm**
- **SQLite** (via the `sqlite3` npm package for Badam 7)

Install dependencies for the game(s) you are working on:

```bash
nvm install
nvm use

# Badam 7
npm --prefix client install
npm --prefix server install

# King’s Corner (optional)
npm --prefix kings-corner install
npm --prefix kings-corner/client install
npm --prefix kings-corner/server install

# Kitchen Clash (optional)
npm --prefix kitchen-clash install
npm --prefix kitchen-clash/client install
npm --prefix kitchen-clash/server install
```

## Local Development

### Badam 7

Run the backend and frontend in separate terminals:

```bash
npm --prefix server run dev
```

```bash
npm --prefix client run dev
```

Open `http://localhost:5001/badam7/`. Vite serves the React app on port `5001` and proxies `/socket.io` to the backend on `http://localhost:3000` (the default `PORT`).

### King’s Corner

```bash
npm --prefix kings-corner run dev
```

Runs the server on `5100` and Vite on `5101`. Open `http://localhost:5101/kings-corner/`.

### Kitchen Clash

```bash
npm --prefix kitchen-clash run dev
```

Runs the server on `5200` and Vite on `5201`. Open `http://localhost:5201/kitchen-clash/`.

### Badam Simulation Route

Badam 7 includes a frontend-only simulation lab at `/badam7/simulation` for inspecting deal flow, turn progression, board placement, and winner behavior without creating a multiplayer room. (When running the Express server, `/simulation` also redirects to `/badam7/simulation`.)

## Running the Built Site Locally

To test the production shape locally, build the clients and start each server:

```bash
# Landing page + Badam 7 (port 5001)
npm --prefix client run build
npm --prefix server run start:v2
```

Open `http://localhost:5001` for the landing page or `http://localhost:5001/badam7/` for Badam 7. Express serves `landing/`, `client/dist` at `/badam7/`, Badam Socket.io at `/socket.io`, and proxies `/kings-corner/*` and `/kitchen-clash/*` to their local servers when running.

To run King’s Corner and Kitchen Clash alongside it:

```bash
# King’s Corner (port 5100)
npm --prefix kings-corner/client run build
HOST=127.0.0.1 PORT=5100 npm --prefix kings-corner/server start

# Kitchen Clash (port 5200)
npm --prefix kitchen-clash/client run build
HOST=127.0.0.1 PORT=5200 npm --prefix kitchen-clash/server start
```

Health checks:

```bash
curl http://127.0.0.1:5001/health
curl http://127.0.0.1:5100/kings-corner/health
curl http://127.0.0.1:5200/kitchen-clash/health
```

## LAN Testing

Dev and built server scripts bind to `0.0.0.0`, so phones and tablets on the same Wi-Fi can connect directly:

- **Vite dev (Badam 7):** `http://YOUR_LAN_IP:5001/badam7/`
- **Built app (all games via Badam server):** `http://YOUR_LAN_IP:5001` (also printed by the server on startup)

The Badam server allows `localhost`, configured production domains, and private IPv4 LAN origins (`10.x`, `172.16–31.x`, `192.168.x`). Add any non-private test hostnames to `ALLOWED_ORIGINS`.

## Environment Variables

Copy the production example when deploying. `scripts/deploy-vps.sh` loads `.env.production` and then `.env`:

```bash
cp .env.production.example .env
```

### Badam 7 Server & Shared Settings

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | Set to `production` on the VPS to enable HTTPS redirects and production security headers. |
| `HOST` | `0.0.0.0` | Bind address for the Badam Express server. Use `127.0.0.1` behind Caddy. |
| `PORT` | `3000` | Badam Express port (`5001` in `start:v2` and production). |
| `DB_PATH` | `server/badam-satti.db` | SQLite file path. Use a persistent path such as `/opt/apps/badam-satti/data/badam-satti.db` in production. |
| `ALLOWED_ORIGINS` | empty | Comma-separated extra browser origins allowed by CORS and Socket.io. |
| `IP_HASH_SALT` | random per process | Salt for hashing client IPs in rate-limit records. Set a stable random value in production. |
| `ADMIN_KEY` | unset | Required in the `x-admin-key` header for `GET /health/admin`. |
| `KINGS_CORNER_ORIGIN` | `http://127.0.0.1:5100` | Upstream target used by the Badam server’s fallback proxy for `/kings-corner/*`. |
| `KITCHEN_CLASH_ORIGIN` | `http://127.0.0.1:5200` | Upstream target used by the Badam server’s fallback proxy for `/kitchen-clash/*`. |

### Deploy Script (`scripts/deploy-vps.sh`) Settings

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_NAME` | `badam-satti` | PM2 process name for the Badam 7 / landing server. |
| `APP_URL` | `http://127.0.0.1:5001` | Loopback base URL checked after deploy. |
| `KINGS_APP_NAME` | `kings-corner` | PM2 process name for King’s Corner. |
| `KINGS_HOST` / `KINGS_PORT` | `127.0.0.1` / `5100` | Bind address and port for King’s Corner. |
| `KINGS_APP_URL` | `http://127.0.0.1:5100/kings-corner/health` | King’s Corner health check URL. |
| `KITCHEN_APP_NAME` | `kitchen-clash` | PM2 process name for Kitchen Clash. |
| `KITCHEN_HOST` / `KITCHEN_PORT` | `127.0.0.1` / `5200` | Bind address and port for Kitchen Clash. |
| `KITCHEN_APP_URL` | `http://127.0.0.1:5200/kitchen-clash/health` | Kitchen Clash health check URL. |

Generate strong secrets with:

```bash
openssl rand -hex 32
```

Admin health check:

```bash
curl -H "x-admin-key: $ADMIN_KEY" http://127.0.0.1:5001/health/admin
```

## VPS Deployment (nvm, pm2, and Caddy)

This is the primary production path for a small VPS.

1. **Install system dependencies:**

   ```bash
   sudo apt update
   sudo apt install -y git curl build-essential caddy
   ```

2. **Install `nvm` for the deploy user**, then reopen the shell:

   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
   ```

3. **Clone the repository:**

   ```bash
   sudo mkdir -p /opt/apps
   sudo chown "$USER:$USER" /opt/apps
   git clone https://github.com/aakashb95/badam-satti.git /opt/apps/badam-satti
   cd /opt/apps/badam-satti
   ```

4. **Configure production environment:**

   ```bash
   cp .env.production.example .env
   nano .env
   ```

   Example `.env`:

   ```env
   NODE_ENV=production
   HOST=127.0.0.1
   PORT=5001
   APP_NAME=badam-satti
   APP_URL=http://127.0.0.1:5001
   DB_PATH=/opt/apps/badam-satti/data/badam-satti.db
   ALLOWED_ORIGINS=https://games.aakashb.xyz,https://badam7.aakashb.xyz,https://www.badam7.aakashb.xyz
   IP_HASH_SALT=replace-with-a-long-random-string
   ADMIN_KEY=replace-with-a-long-random-string
   ```

5. **Run the deploy script:**

   ```bash
   chmod +x scripts/deploy-vps.sh
   ./scripts/deploy-vps.sh
   ```

   The script pulls `master` (`git pull --ff-only`), activates Node from `.nvmrc`, installs dependencies and builds all three clients, installs production server dependencies, starts or restarts the `badam-satti`, `kings-corner`, and `kitchen-clash` PM2 processes, saves the PM2 process list, and verifies all loopback health endpoints.

6. **Enable PM2 on reboot** after the first deploy:

   ```bash
   pm2 startup
   # Run the command printed by pm2, then:
   pm2 save
   ```

7. **Configure Caddy:**

   ```bash
   sudo cp deploy/Caddyfile.example /etc/caddy/Caddyfile
   sudo nano /etc/caddy/Caddyfile
   sudo caddy validate --config /etc/caddy/Caddyfile
   sudo systemctl reload caddy
   ```

   `deploy/Caddyfile.example` routes each game directly to its own loopback port:

   ```caddyfile
   games.aakashb.xyz, badam7.aakashb.xyz {
     encode zstd gzip

     handle /kings-corner* {
       reverse_proxy 127.0.0.1:5100
     }

     handle /kitchen-clash* {
       reverse_proxy 127.0.0.1:5200
     }

     handle {
       reverse_proxy 127.0.0.1:5001
     }
   }
   ```

### GitHub Actions Deployment

`.github/workflows/deploy.yml` builds all three clients and runs server and client test suites on every pull request and push to `master`. Pushes to `master` (or manual `workflow_dispatch`) deploy to the VPS only after verification passes.

Repository secrets:

| Secret | Required | Purpose |
| --- | --- | --- |
| `VPS_HOST` | Yes | VPS IP address or hostname |
| `VPS_USER` | Yes | SSH user (e.g. `deploy`) |
| `VPS_APP_DIR` | Yes | Checkout directory on the VPS (e.g. `/opt/apps/badam-satti`) |
| `VPS_SSH_KEY` | Yes | Private SSH key authorized for `VPS_USER` |
| `VPS_PORT` | No | SSH port (defaults to `22`) |

Useful operations on the VPS:

```bash
pm2 status
pm2 logs badam-satti --lines 100
pm2 logs kings-corner --lines 100
pm2 logs kitchen-clash --lines 100
curl http://127.0.0.1:5001/health
curl http://127.0.0.1:5100/kings-corner/health
curl http://127.0.0.1:5200/kitchen-clash/health
```

### Security Notes

- Bind Node processes to `127.0.0.1` in production so Caddy is the sole public entrypoint and TLS terminator.
- Set stable production values for `IP_HASH_SALT` and `ADMIN_KEY` rather than relying on per-process defaults.
- Restrict `ALLOWED_ORIGINS` to your real HTTPS domains.
- Keep `DB_PATH` in a persistent directory outside build artifacts and back up the SQLite file before maintenance.
- Public `/health` returns minimal status only; use `/health/admin` with `x-admin-key` for diagnostics.

## Optional Docker Path

`Dockerfile` and `docker-compose.yml` are available for running **Badam 7** (`127.0.0.1:5001`, SQLite mounted at `./data`) and **King’s Corner** (`127.0.0.1:5100`) in containers (Kitchen Clash is not yet wired into Compose):

```bash
docker compose up --build -d
curl http://127.0.0.1:5001/health
curl http://127.0.0.1:5100/kings-corner/health
docker compose logs -f
```

Replace the placeholder `IP_HASH_SALT` and `ADMIN_KEY` values in `docker-compose.yml` (or pass them via an environment file) before running in production.

## Checks & Tests

```bash
# Badam 7
npm --prefix server test
npm --prefix client test
npm --prefix client run lint
npm --prefix client run build
npm --prefix client run test:e2e

# King’s Corner
npm --prefix kings-corner test
npm --prefix kings-corner run build
npm --prefix kings-corner run test:e2e

# Kitchen Clash
npm --prefix kitchen-clash test
npm --prefix kitchen-clash run build
```
