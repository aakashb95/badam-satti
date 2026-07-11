# Production routing

## Repository-backed architecture

`badam7.aakashb.xyz` is documented and configured as a single Caddy site. Caddy terminates TLS and proxies to loopback-only Node processes managed by PM2:

| Public path | Upstream | Purpose |
| --- | --- | --- |
| `/` | `127.0.0.1:5001` | Static card-games landing page |
| `/badam7/*` | `127.0.0.1:5001` | Badam 7 React SPA and scoped PWA assets |
| `/r/:roomCode` | `127.0.0.1:5001` | Permanent compatibility redirect to `/badam7/r/:roomCode` |
| `/socket.io/*` | `127.0.0.1:5001` | Badam 7 Socket.io transport (legacy path retained) |
| `/kings-corner/*` | `127.0.0.1:5100` | King’s Corner React SPA, assets, health check, and Socket.io transport |
| `/kings-corner/socket.io/*` | `127.0.0.1:5100` | King’s Corner Socket.io transport |

The order of the two Caddy `handle` blocks matters: `/kings-corner*` must be selected before the catch-all upstream. `reverse_proxy` supports WebSocket upgrades, so no separate WebSocket directive is required.

The Badam server also proxies `/kings-corner/*` (including Socket.io upgrades)
to `KINGS_CORNER_ORIGIN`, which defaults to `http://127.0.0.1:5100`. This is a
deployment safety net: King's Corner still works when the live Caddyfile only
contains the historical catch-all proxy to port 5001. The path-specific Caddy
rule remains preferred because it removes one internal hop.

## SPA and asset behavior

Both Vite builds have explicit base paths. Express serves each build at the same path used at build time and returns that game’s `index.html` only for routes inside its prefix. This prevents a missing King’s Corner route from accidentally returning the Badam app, and prevents either build’s `/assets`, card images, or fonts from colliding with the other.

- Badam’s `BrowserRouter` uses `/badam7/` as its basename. `/badam7/r/:roomCode` and `/badam7/simulation` therefore survive reloads through the Badam Express fallback.
- King’s Corner currently has no client-side deep routes, but its prefix fallback allows future routes to reload safely.
- The landing page unregisters only a legacy root-scoped service worker. Each game now registers its own worker with a path-limited scope, so one game cannot cache or answer navigations for the other.
- Badam’s manifest, start URL, icons, fonts, cards, and offline shell live below `/badam7/`. King’s Corner’s worker, fonts, cards, and offline shell live below `/kings-corner/`.

## Backward compatibility

Existing Badam invite URLs such as `https://badam7.aakashb.xyz/r/ABC123` receive a `308` redirect to `https://badam7.aakashb.xyz/badam7/r/ABC123`. The room code and query string are preserved by Express. Badam Socket.io remains at `/socket.io`, so installed clients and proxy behavior do not change at the transport layer.

The former Badam home URL `/` necessarily becomes the chooser. There is no room identity in that URL to preserve; Badam remains one tap away at `/badam7/`.

## Deployment flow and known unknowns

The checked-in GitHub Actions workflow verifies both clients and both server test suites on pull requests. Deployment runs only after verification on `master` pushes or manual dispatch. It SSHes to the configured VPS, resets the checkout to `origin/master`, and runs `scripts/deploy-vps.sh`. That script builds both clients, installs both servers, restarts two PM2 processes, and checks both loopback health endpoints.

Repository history shows successful production workflow runs, but the repository cannot prove the VPS’s current live state. In particular, these require VPS or repository-admin access to confirm:

- the values of `VPS_HOST`, `VPS_USER`, `VPS_PORT`, and `VPS_APP_DIR` (Actions does not expose secret values);
- the live `/etc/caddy/Caddyfile` and whether another proxy sits in front of Caddy;
- the active PM2 process list and environment files;
- firewall rules, Cloudflare settings, and whether port `5100` is already occupied.

Before an approved deployment, compare `deploy/Caddyfile.example` with the live Caddyfile, confirm `127.0.0.1:5100` is available, run `caddy validate --config /etc/caddy/Caddyfile`, and back up the Badam SQLite database. No DNS change is required for this path-based design.
