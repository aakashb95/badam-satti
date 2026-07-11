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

if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  echo "nvm not found at $NVM_DIR/nvm.sh" >&2
  echo "Install it first: https://github.com/nvm-sh/nvm#installing-and-updating" >&2
  exit 1
fi

mkdir -p "$APP_ROOT/data" "$APP_ROOT/logs"

# shellcheck source=/dev/null
. "$NVM_DIR/nvm.sh"

echo "==> Updating code"
git pull --ff-only

echo "==> Using Node via nvm"
nvm install
nvm use

echo "==> Installing dependencies"
npm --prefix client install --include=dev
npm --prefix server install --omit=dev

echo "==> Building client"
npm --prefix client run build

if ! command -v pm2 >/dev/null 2>&1; then
  echo "==> Installing pm2"
  npm install -g pm2
fi

export NODE_ENV HOST PORT DB_PATH

echo "==> Restarting $APP_NAME with pm2"
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

echo "==> Waiting for health check"
for attempt in {1..20}; do
  if curl -fsS "$APP_URL/health" >/dev/null; then
    echo "==> Deployed: $APP_URL"
    exit 0
  fi

  sleep 1
done

echo "Deployment finished, but health check failed: $APP_URL/health" >&2
pm2 logs "$APP_NAME" --lines 80 --nostream >&2
exit 1
