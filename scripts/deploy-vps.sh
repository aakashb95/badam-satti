#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
APP_ROOT="$(pwd)"

set -a
[ -f "$APP_ROOT/.env.production" ] && . "$APP_ROOT/.env.production"
[ -f "$APP_ROOT/.env" ] && . "$APP_ROOT/.env"
set +a

APP_NAME="${APP_NAME:-badam-satti}"
APP_URL="${APP_URL:-http://127.0.0.1:5001}"
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-5001}"
NODE_ENV="${NODE_ENV:-production}"
NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
DB_PATH="${DB_PATH:-$APP_ROOT/data/badam-satti.db}"

log() {
  printf '\n==> %s\n' "$1"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_command curl
require_command git

mkdir -p "$APP_ROOT/data" "$APP_ROOT/logs"

if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  log "Installing nvm"
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
fi

# shellcheck source=/dev/null
. "$NVM_DIR/nvm.sh"

log "Updating code"
git pull --ff-only

log "Using Node via nvm"
nvm install
nvm use

log "Installing client build dependencies"
(
  unset NODE_ENV
  npm --prefix client install --include=dev --package-lock=false --no-audit --no-fund
)

log "Building client"
(
  unset NODE_ENV
  npm --prefix client run build
)

log "Installing server runtime dependencies"
npm --prefix server install --omit=dev --package-lock=false --no-audit --no-fund

if ! command -v pm2 >/dev/null 2>&1; then
  log "Installing pm2"
  npm install -g pm2
fi

export NODE_ENV HOST PORT DB_PATH

log "Restarting $APP_NAME with pm2"
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 restart "$APP_NAME" --update-env
else
  pm2 start "$APP_ROOT/server/index.js" \
    --name "$APP_NAME" \
    --cwd "$APP_ROOT" \
    --time \
    --output "$APP_ROOT/logs/$APP_NAME.out.log" \
    --error "$APP_ROOT/logs/$APP_NAME.err.log"
fi

pm2 save

log "Waiting for health check"
for attempt in {1..20}; do
  if curl -fsS "$APP_URL/health" >/dev/null; then
    log "Deployed: $APP_URL"
    exit 0
  fi

  sleep 1
done

echo "Deployment finished, but health check failed: $APP_URL/health" >&2
pm2 logs "$APP_NAME" --lines 80 --nostream >&2
exit 1
