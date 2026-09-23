# Identity secret storage cutover (SEC-006 / #498)

This runbook describes the code-level data migration candidate for customer, operator, and internal-admin sessions plus Sign in with Apple refresh tokens. It is not security approval, authorization to change a database, or evidence that any deployment/key/backup control has been verified. Do not use it against production.

## Stored formats

- Session `access_token` and `refresh_token` values are SHA-256 lookup digests with the `sha256:v1:` format/domain marker. The application hashes the presented 256-bit opaque token before querying. Digests are not returned from repository auth lookups and cannot be used as bearer tokens.
- Apple refresh tokens are AES-256-GCM ciphertext, prefixed `aes256gcm:v1:<key-id>:`. Each encryption gets a fresh 96-bit nonce. The owning `user_id` is authenticated associated data, so moving ciphertext to another user's row fails authentication.
- Clover credentials are deliberately unchanged and must remain unavailable until their separate deferred integration and security work is approved.

The existing session token fields and Apple token field are `TEXT`; the formats fit the existing primary-key/unique constraints. No schema-only migration is needed. The bounded, repeatable `backfill:secret-storage` command is the data migration. It changes only the identity tables and reports aggregate counts; it never prints token/ciphertext values.

## Key custody and configuration contract

Before starting any runtime candidate, Architect, Security & QA, and Release must approve the external key-management/recovery procedure. Keep keys outside the database and do not put key values in Git, issue comments, logs, terminal transcripts, or build artifacts. The following variable names and format are the implementation contract, not instructions to set values now:

- `IDENTITY_APPLE_TOKEN_ENCRYPTION_KEYS`: JSON map from key ID to canonical base64 encoding of exactly 32 random bytes; for example, `{"key-2026-a":"<base64-key-held-in-secret-manager>"}`.
- `IDENTITY_APPLE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID`: the ID used for new ciphertext.
- `IDENTITY_ALLOW_LEGACY_SECRETS=dev-cutover`: temporary compatibility switch. The code honors it only when `DEPLOY_ENV=dev`.
- `IDENTITY_SECRET_BACKFILL_CONFIRM=dev-only` and `IDENTITY_SECRET_BACKFILL_DEV_PROJECT_REF`: explicit additional acknowledgements required by the script. The latter must match both the actual Supabase project reference and `EXPECTED_SUPABASE_PROJECT_REF`.
- `IDENTITY_SECRET_BACKFILL_CURSOR`: optional encrypted continuation cursor returned by a prior batch. It is command-only, not a runtime setting; pass it unchanged to resume a bounded Apple scan. Do not decode or log it.

Identity's Postgres repository requires a valid active Apple key ring at startup. A missing/malformed key ring must fail startup; do not enable an in-memory fallback to mask this failure. A missing key ID, wrong key, changed AAD/user ID, malformed ciphertext, or failed authentication tag must fail closed. The reserved `aes256gcm:` marker is never treated as legacy plaintext, including during the dev compatibility window.

### Dev deployment configuration wiring

The tracked dev deployment paths pass the same three runtime settings to identity:

- The GitHub Actions `deploy-dev.yml` workflow reads `IDENTITY_APPLE_TOKEN_ENCRYPTION_KEYS` from the dev environment secret and `IDENTITY_APPLE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID` plus optional `IDENTITY_ALLOW_LEGACY_SECRETS` from dev environment variables. Its preflight checks only presence and format and prints only pass/fail status. Heroku synchronization repeats validation before contacting the Heroku API and forwards the settings without including their values in logs. If the legacy variable is unset, dev synchronization clears any previously configured value.
- The `infra/free/bin/deploy-compose.sh` path validates the supplied env file before pulling or starting containers. `infra/free/docker-compose.yml` forwards the three settings only to the identity container; `infra/free/.env.example` documents the names without providing key material.

These paths only wire and validate caller-provided configuration; they do not create, retrieve, or rotate key material. This candidate does not set any GitHub or Heroku settings and does not change the production deployment path. Keep the real key ring in the approved external secret manager and supply it only through the deployment's protected dev configuration. Do not use sample or placeholder key values to start identity.

## Mixed-version sequencing and rollback

This format change is not safe with old and new identity binaries serving traffic concurrently. Old binaries cannot look up digest-form sessions or decrypt Apple ciphertext. Release must arrange a controlled dev cutover with no old identity process serving requests after new-format writes begin. If the platform cannot establish that boundary, stop and choose an explicit dev sign-out/cutover window before proceeding; do not silently assume a rolling deploy is compatible.

1. Obtain the exact candidate's Architect and independent Security & QA review. Release separately verifies the dev target, key custody, backups/restore plan, and release sequencing. No production action is part of this runbook.
2. Confirm the key ring and recovery copy are in the external secret manager. Do not print or copy key material through a terminal transcript or issue.
3. Deploy the hash/encryption-aware dev binary with the active key configured and legacy compatibility enabled only for `DEPLOY_ENV=dev`. New session writes are digest-only; new Apple writes are encrypted immediately.
4. After all old-format writers have stopped and the new process is healthy, run the bounded dev backfill as an ordered cursor scan. Each invocation handles no more than 100 session candidates per session class and no more than 100 Apple-token rows; session candidates are locked with `SKIP LOCKED`, while Apple pages are ordered by `user_id`. Pass the returned encrypted `nextCursor` as `IDENTITY_SECRET_BACKFILL_CURSOR` to continue. It contains no visible user ID or token; if lost, restart from the beginning because the operation is idempotent. Keep the same key ring and active key ID until the scan and final verification finish. New-format writers may remain active; they immediately hash/encrypt new values, while stopping old-format writers ensures no plaintext is introduced behind the cursor.
5. For every Apple row on a page, the code decrypts with the owning `user_id` as AAD, including ciphertext already tagged with the active key. A malformed marker, missing key, or failed authentication is reported only in aggregate `unresolved.appleRefreshTokens` and `remaining.appleRefreshTokens` page counts; the offending value is neither logged nor returned. Sum the Apple page counts across the complete cursor pass. Resolve any nonzero unresolved/remaining count only through the approved key/row-recovery path; never use plaintext fallback. Continue passing the cursor until `nextCursor` is `null`, then start a fresh full verification pass with no cursor and confirm the sum of Apple `remaining` and `unresolved` counts is zero. Session `remaining` counts are global query aggregates on each invocation. A zero write count or a cursor reaching `null` alone is not completion.
6. Verify the aggregate result and run dev auth/refresh/revocation and Apple account-deletion checks. Only then remove `IDENTITY_ALLOW_LEGACY_SECRETS` from dev and restart the identity process. Re-run the complete cursor verification; keep the issue open for independent review and Release evidence.

The script has three dev safeguards: `DEPLOY_ENV=dev`, a literal `IDENTITY_SECRET_BACKFILL_CONFIRM=dev-only`, and an explicit dev project ref that must match both the actual target and the application's expected project ref. The code in this candidate has **not** been run against the dev database. Apple cursors are encrypted/authenticated using a key derived from the configured active key with a separate HKDF context; retaining that key in the ring is required to resume an in-progress cursor scan. An unresolved row prevents completion and requires the approved recovery/key-custody path, not a plaintext fallback.

### Key rotation

Add the new key to the secret-manager key ring while retaining each old key ID needed to decrypt existing database rows and protected backups; set the new active key ID. New writes use the new key. Run bounded batches until the Apple remaining count is zero, verify Apple revocation access in dev, and retain old keys for the full backup-retention/recovery window. Do not remove an old key merely because active rows have been re-encrypted: a database backup may still contain ciphertext under that key.

### Rollback and recovery

- Before any digest/ciphertext writes, reverting the binary is a normal code rollback, provided no schema/config changes were applied. The deployment workflow may already have synchronized dev key settings; restore those settings through the approved secret manager and tracked dev workflow, never by copying key values into logs or a rollback transcript.
- After new-format writes begin, do not roll back to a binary that treats database fields as raw bearer/provider secrets. It will reject digest sessions and may send Apple ciphertext as if it were a refresh token. Roll forward with a corrected compatible binary, or use a separately approved dev recovery from a protected pre-cutover backup followed by the approved re-protection procedure. A restored plaintext backup temporarily reintroduces SEC-006 exposure and must be access-restricted and re-protected immediately.
- If a session row cannot be safely migrated, fail closed and require the affected dev account to sign in again; never recover by logging or exposing the legacy token. If Apple decryption fails, do not attempt Apple revocation with the ciphertext or plaintext fallback; preserve the encrypted row and recover the correct key through the approved secret-management process.
- Reverting runtime code does not undo a data migration. The batch's transformations are idempotent and intentionally have no down operation.

## Evidence still required before clearance

The candidate does not establish actual dev key generation/custody, key backup and restore, platform backup protections, database TLS/grants, broad log/Sentry redaction, absence of legacy plaintext rows, historical Clover-row status, production controls, or Security & QA clearance. Verify these independently using aggregate/presence-only evidence. Do not inspect or report token values. Keep Clover blocked/deferred and SEC-006 open until its remaining criteria and #421 dependencies are satisfied.
