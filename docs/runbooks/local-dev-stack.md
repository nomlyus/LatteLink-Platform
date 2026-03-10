# Local Dev Stack (Mobile + APIs)

Last reviewed: `2026-03-10`

## Purpose

Bring up all currently implemented local APIs so the mobile app can exercise auth, gateway reachability, menu/cart, order lifecycle, and loyalty endpoints from:
- localhost (simulator / same machine)
- LAN (Expo Go on a physical device)

## Prerequisites

- Node `>=22`
- `pnpm` available
- Dependencies installed:

```bash
pnpm install
```

## Start Local Services

### Localhost Mode

From repo root:

```bash
pnpm dev:services
```

This starts:
- `identity` on `127.0.0.1:3000`
- `orders` on `127.0.0.1:3001`
- `catalog` on `127.0.0.1:3002`
- `payments` on `127.0.0.1:3003`
- `loyalty` on `127.0.0.1:3004`
- `notifications` on `127.0.0.1:3005`
- `gateway` on `127.0.0.1:8080`

Gateway upstream config is set in-process:
- `IDENTITY_SERVICE_BASE_URL=http://127.0.0.1:3000`
- `ORDERS_SERVICE_BASE_URL=http://127.0.0.1:3001`
- `LOYALTY_SERVICE_BASE_URL=http://127.0.0.1:3004`

Optional worker:

```bash
START_MENU_SYNC_WORKER=1 pnpm dev:services
```

### LAN Mode (Physical Device)

```bash
pnpm dev:services:lan
```

LAN mode:
- binds services and gateway to `0.0.0.0`
- auto-detects your Mac LAN IP (or use `DEV_MACHINE_IP=<ip>`)
- prints a device URL like `http://<your-mac-ip>:8080/health`

Override example:

```bash
DEV_MACHINE_IP=192.168.1.25 pnpm dev:services:lan
```

## Start Mobile App (Second Terminal)

### Localhost Mode

```bash
pnpm dev:mobile:local
```

`dev:mobile:local` forces:
- `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8080/v1`

### LAN Mode (Expo Go on Device)

```bash
pnpm dev:mobile:lan
```

`dev:mobile:lan`:
- auto-detects your Mac LAN IP (or use `DEV_MACHINE_IP=<ip>`)
- sets `EXPO_PUBLIC_API_BASE_URL=http://<your-mac-ip>:8080/v1`

Override example:

```bash
DEV_MACHINE_IP=192.168.1.25 pnpm dev:mobile:lan
```

## Quick Health Checks

```bash
curl -s http://127.0.0.1:8080/health
curl -s http://127.0.0.1:3000/health
curl -s http://127.0.0.1:3001/health
curl -s http://127.0.0.1:3004/health
```

From phone browser (LAN mode):

```text
http://<your-mac-ip>:8080/health
```

If unreachable:
- confirm phone + Mac are on same Wi-Fi
- allow incoming connections for terminal/node in macOS firewall
- retry with explicit `DEV_MACHINE_IP`

## What You Can Test in the App Today

- Home:
  - `Test Gateway` button (`GET /v1/meta/contracts`)
- Auth modal:
  - Apple exchange
  - Magic-link request/verify
  - Refresh session
  - `/auth/me`
  - Sign out
- Menu + Cart:
  - Live menu fetch path with in-app fallback behavior
  - Item customization and cart pricing summary
  - Signed-in checkout path: quote -> create -> pay (Apple Pay token input + demo token helper)
  - Clover path simulation via token markers:
    - token contains `decline` -> declined charge
    - token contains `timeout` -> timeout charge
  - Retry recovery behavior:
    - retry with same payment key keeps idempotent response
    - retry with a new key can recover timeout/decline paths
- Loyalty APIs:
  - `GET /v1/loyalty/balance`
  - `GET /v1/loyalty/ledger`
  - `POST /v1/loyalty/internal/ledger/apply` (service-level internal endpoint for local testing)

## Current Limits (Expected)

- Gateway menu route currently returns an empty category payload, so the app may use fallback catalog UI.
- Notifications service remains scaffold-level endpoints.
- Payments currently uses simulated Clover outcomes (not a live Clover merchant integration).
- Apple Pay token collection in mobile is currently dev-mode input (not native Apple Pay sheet yet).
