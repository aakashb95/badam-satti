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
KINGS_APP_NAME="${KINGS_APP_NAME:-kings-corner}"
KINGS_APP_URL="${KINGS_APP_URL:-http://127.0.0.1:5100/kings-corner/health}"
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-5001}"
KINGS_HOST="${KINGS_HOST:-127.0.0.1}"
KINGS_PORT="${KINGS_PORT:-5100}"
KINGS_CORNER_ORIGIN="${KINGS_CORNER_ORIGIN:-http://127.0.0.1:${KINGS_PORT}}"
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

log "Installing and building King's Corner client"
(
  unset NODE_ENV
  npm --prefix kings-corner/client install --include=dev --package-lock=false --no-audit --no-fund
  npm --prefix kings-corner/client run build
)

log "Installing server runtime dependencies"
npm --prefix server install --omit=dev --package-lock=false --no-audit --no-fund

log "Installing King's Corner runtime dependencies"
npm --prefix kings-corner/server install --omit=dev --package-lock=false --no-audit --no-fund

if ! command -v pm2 >/dev/null 2>&1; then
  log "Installing pm2"
  npm install -g pm2
fi

export NODE_ENV HOST PORT DB_PATH KINGS_CORNER_ORIGIN

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

log "Restarting $KINGS_APP_NAME with pm2"
if pm2 describe "$KINGS_APP_NAME" >/dev/null 2>&1; then
  HOST="$KINGS_HOST" PORT="$KINGS_PORT" pm2 restart "$KINGS_APP_NAME" --update-env
else
  HOST="$KINGS_HOST" PORT="$KINGS_PORT" pm2 start "$APP_ROOT/kings-corner/server/index.js" \
    --name "$KINGS_APP_NAME" \
    --cwd "$APP_ROOT/kings-corner" \
    --time \
    --output "$APP_ROOT/logs/$KINGS_APP_NAME.out.log" \
    --error "$APP_ROOT/logs/$KINGS_APP_NAME.err.log"
fi

pm2 save

log "Waiting for health check"
for attempt in {1..30}; do
  if curl -fsS "$APP_URL/health" >/dev/null &&
     curl -fsS "$KINGS_APP_URL" >/dev/null &&
     curl -fsS "$APP_URL/kings-corner/health" >/dev/null; then
    log "Deployed: $APP_URL and $KINGS_APP_URL"
    exit 0
  fi

  sleep 1
done

echo "Deployment finished, but a health check failed: $APP_URL/health, $KINGS_APP_URL, or $APP_URL/kings-corner/health" >&2
pm2 logs "$APP_NAME" --lines 80 --nostream >&2
pm2 logs "$KINGS_APP_NAME" --lines 80 --nostream >&2
exit 1
