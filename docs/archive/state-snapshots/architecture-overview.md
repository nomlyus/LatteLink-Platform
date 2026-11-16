# Architecture Overview

> **Note**: This file is superseded by [ARCHITECTURE.md](../../../ARCHITECTURE.md) at the repo root, which was written from code on 2026-04-27.  
> The content below was previously inaccurate (wrong domain name, non-existent `/metrics` route, outdated notifications description). It has been replaced with a pointer to the authoritative document.

See [ARCHITECTURE.md](../../../ARCHITECTURE.md) for the current architecture.

---

## Quick Reference (accurate as of 2026-04-27)

**Public API entry point**: `services/gateway` — routes all customer and operator traffic.

**Service ports (internal)**:
- gateway: 8080
- identity: 3000
- orders: 3001
- catalog: 3002
- payments: 3003
- loyalty: 3004
- notifications: 3005

**Deployment**: Docker Compose on single host (`infra/free/docker-compose.yml`) + Caddy TLS.

**Frontends on Vercel**: admin-console, client-dashboard, lattelink-web.

**Contracts source of truth**: `packages/contracts/*` (Zod schemas, OpenAPI generated from these).

**Data stores**:
- Postgres (single shared instance, table-prefix namespacing per service)
- Valkey / Redis-compatible (event bus + gateway rate limiting)

**Observability**: `/health` and `/ready` on every service. No metrics endpoint. No log aggregation yet.
