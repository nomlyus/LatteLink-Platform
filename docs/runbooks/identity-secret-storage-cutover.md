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

Identity's Postgres repository requires a valid active Apple key ring at startup. A missing/malformed key ring must fail startup; do not enable an in-memory fallback to mask this failure. A missing key ID, wrong key, changed AAD/user ID, malformed ciphertext, or failed authentication tag must fail closed. The reserved `aes256gcm:` marker is never treated as legacy plaintext, including during the dev compatibility window.

## Mixed-version sequencing and rollback

This format change is not safe with old and new identity binaries serving traffic concurrently. Old binaries cannot look up digest-form sessions or decrypt Apple ciphertext. Release must arrange a controlled dev cutover with no old identity process serving requests after new-format writes begin. If the platform cannot establish that boundary, stop and choose an explicit dev sign-out/cutover window before proceeding; do not silently assume a rolling deploy is compatible.

1. Obtain the exact candidate's Architect and independent Security & QA review. Release separately verifies the dev target, key custody, backups/restore plan, and release sequencing. No production action is part of this runbook.
2. Confirm the key ring and recovery copy are in the external secret manager. Do not print or copy key material through a terminal transcript or issue.
3. Deploy the hash/encryption-aware dev binary with the active key configured and legacy compatibility enabled only for `DEPLOY_ENV=dev`. New session writes are digest-only; new Apple writes are encrypted immediately.
4. After all old processes have stopped and the new process is healthy, invoke one bounded dev backfill batch. Repeat until the returned `remaining` counts for customer/operator/admin sessions and Apple refresh tokens are all zero. Each invocation handles no more than 100 rows of each class and locks candidates with `SKIP LOCKED`. A zero batch count by itself is not completion if any `remaining` count is nonzero.
5. Verify the aggregate result and run dev auth/refresh/revocation and Apple account-deletion checks. Only then remove `IDENTITY_ALLOW_LEGACY_SECRETS` from dev and restart the identity process. Re-run aggregate verification; keep the issue open for independent review and Release evidence.

The script has three dev safeguards: `DEPLOY_ENV=dev`, a literal `IDENTITY_SECRET_BACKFILL_CONFIRM=dev-only`, and an explicit dev project ref that must match both the actual target and the application's expected project ref. The code in this candidate has **not** been run against the dev database.

### Key rotation

Add the new key to the secret-manager key ring while retaining each old key ID needed to decrypt existing database rows and protected backups; set the new active key ID. New writes use the new key. Run bounded batches until the Apple remaining count is zero, verify Apple revocation access in dev, and retain old keys for the full backup-retention/recovery window. Do not remove an old key merely because active rows have been re-encrypted: a database backup may still contain ciphertext under that key.

### Rollback and recovery

- Before any digest/ciphertext writes, reverting the binary is a normal code rollback, provided no schema/config changes were applied.
- After new-format writes begin, do not roll back to a binary that treats database fields as raw bearer/provider secrets. It will reject digest sessions and may send Apple ciphertext as if it were a refresh token. Roll forward with a corrected compatible binary, or use a separately approved dev recovery from a protected pre-cutover backup followed by the approved re-protection procedure. A restored plaintext backup temporarily reintroduces SEC-006 exposure and must be access-restricted and re-protected immediately.
- If a session row cannot be safely migrated, fail closed and require the affected dev account to sign in again; never recover by logging or exposing the legacy token. If Apple decryption fails, do not attempt Apple revocation with the ciphertext or plaintext fallback; preserve the encrypted row and recover the correct key through the approved secret-management process.
- Reverting runtime code does not undo a data migration. The batch's transformations are idempotent and intentionally have no down operation.

## Evidence still required before clearance

The candidate does not establish actual dev key generation/custody, key backup and restore, platform backup protections, database TLS/grants, broad log/Sentry redaction, absence of legacy plaintext rows, historical Clover-row status, production controls, or Security & QA clearance. Verify these independently using aggregate/presence-only evidence. Do not inspect or report token values. Keep Clover blocked/deferred and SEC-006 open until its remaining criteria and #421 dependencies are satisfied.
