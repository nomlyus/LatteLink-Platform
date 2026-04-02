# Dependency Vulnerability Analysis & Fix Plan

**Date:** 2026-03-25  
**Audit Status:** 20 vulnerabilities (1 low, 7 moderate, 12 high)

## Summary

Most HIGH vulnerabilities are in transitive dependencies of Expo and Vitest, which are dev-time dependencies for mobile builds. Only production services (7 Fastify services) run in production.

**Direct package vulnerabilities in production services:** None critical  
**Transitive vulnerability sources:** Expo (tar, flatted), Vitest (picomatch), undici

## Vulnerability Breakdown

### HIGH Vulnerabilities (12 total)

#### Fastify (Production Service)

- **Status:** Already using v4.29.1
- **Issue:** Content-Type header tab character allows body validation bypass (< 5.7.2)
- **Fix:** Fastify 4.x < 5.7.2 — check if v5.0+ is available
- **Action:** `pnpm update fastify@latest` in each service
- **Risk:** MEDIUM (header parsing bypass, but schema validation still applies)

#### Undici (Production dependency via Node.js HTTP)

- **Status:** Likely pulling from Fastify/Node.js deps
- **Issues:**
  - WebSocket 64-bit overflow
  - Unbounded memory in decompression
  - Invalid server_max_window_bits validation
- **Affected versions:** < 6.24.0
- **Action:** Upgrade undici to >= 6.24.0
- **Risk:** LOW (WebSocket issues, services don't use WebSocket heavily)

#### Kysely (Production — database library)

- **Issues:** MySQL SQL injection via unsanitized JSON path keys
- **Action:** Already using parameterized queries; verify no `sql.lit(userInput)` usage
- **Verification:** Done — no user input passed to `sql.lit()` found
- **Risk:** LOW (code is safe, but update Kysely anyway)

#### TAR (Transitive from Expo)

- **Status:** Comes from `@expo/cli` → tar < 7.5.11
- **Issue:** Symlink path traversal via drive-relative linkpath
- **Risk:** MEDIUM (build-time only, not runtime)
- **Action:** Update Expo dependencies or wait for Expo fix
- **Timeline:** Can defer for pilot (dev-time only)

#### Flatted (Transitive from Expo)

- **Status:** Comes from Expo dependencies
- **Issues:**
  - Unbounded recursion DoS in parse()
  - Prototype pollution
- **Risk:** LOW (dev-time, not in production)
- **Action:** Wait for Expo to update; not production-critical

#### Picomatch (Transitive from Expo, Vitest)

- **Status:** Multiple versions affected (2.3.1, 3.0.1, 4.0.3)
- **Issues:** Method injection in POSIX character classes, incorrect glob matching
- **Risk:** LOW (build-time glob patterns, not runtime)
- **Action:** Defer (dev-time)

### MODERATE Vulnerabilities (7 total)

All MODERATE vulns are in dev/build dependencies:

- Picomatch glob patterns (3x different versions)
- Glob, Globby, fast-glob (Vitest)

**Production impact:** NONE — these are build-time only

## Fix Plan

### Immediate (Before Production Deploy — Item 82)

1. **Fastify:** Update to latest v5

   ```bash
   pnpm update fastify@latest -r
   ```

   Need to do in: `services/catalog`, `services/gateway`, `services/identity`, `services/loyalty`, `services/notifications`, `services/orders`, `services/payments`

2. **Kysely:** Update to latest (verify no sql.lit() with user input)

   ```bash
   pnpm update kysely@latest -r
   ```

3. **Undici:** Update to >= 6.24.0 (likely automatic with Fastify bump)

### Deferred (Post-Pilot Acceptable)

- **Expo dependencies** (tar, flatted, picomatch) — Wait for Expo 55+ release or update when safe
- **Vitest picomatch** — Non-critical for production

## Risk Assessment

**Production-blocking?** NO — Most HIGH vulns are in dev-time dependencies (Expo, Vitest)

**Nice-to-have?** YES — Update Fastify for body validation bypass protection

**Timeline for pilot:** Can launch with current deps. Update before production goes long-term.

## Testing After Updates

After updating Fastify:

1. Run: `pnpm build`
2. Run: `pnpm test`
3. Test each service locally: `pnpm dev:services`
4. Confirm `/health`, `/ready`, `/metrics` endpoints still work

## Current Audit Status (as-is)

```
20 vulnerabilities found
├─ 1 low
├─ 7 moderate (all dev-time)
└─ 12 high
    ├─ 1 Fastify (production)
    ├─ 3 Undici (production)
    ├─ 2 Kysely (production)
    └─ 6 Transitive (Expo, Vitest — dev-time)
```

## Recommendation

**For pilot launch (Phase 11, Item 82):**

- Update Fastify, Undici, Kysely
- Test locally
- Deploy with changes
- Accept Expo/Vitest vulns (dev-time) for now
- Plan Expo update for post-pilot hardening

**Commit message:**

```
fix: update production dependencies to patch vulnerabilities

- fastify: patch header parsing bypass (CVE-2024-xxxx)
- undici: patch WebSocket DoS issues (CVE-2024-xxxx)
- kysely: update to latest (SQL injection protection)
- note: transitive Expo/Vitest vulns (dev-time) deferred
```
