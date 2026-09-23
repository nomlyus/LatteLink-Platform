import {
  assertExpectedDatabaseTarget,
  createPostgresDb,
  getDatabaseTargetMetadata,
  getDatabaseUrl,
  sql,
  type PersistenceDb,
} from "@lattelink/persistence";
import {
  createAppleRefreshTokenCipher,
  digestSessionToken,
  isEncryptedAppleRefreshToken,
  isSessionTokenDigest,
  type AppleRefreshTokenCipher,
} from "./secret-storage.js";

const maximumBatchSize = 100;
const sessionDigestPattern = "^sha256:v1:[0-9a-f]{64}$";
const supportedAppleCipherPattern =
  "^aes256gcm:v1:[A-Za-z0-9_-]{1,32}:[A-Za-z0-9_-]{39,}$";

type SessionTable =
  | "identity_sessions"
  | "operator_sessions"
  | "internal_admin_sessions";

export type IdentitySecretStorageBackfillResult = {
  customerSessions: number;
  operatorSessions: number;
  internalAdminSessions: number;
  appleRefreshTokens: number;
  unresolved: {
    appleRefreshTokens: number;
  };
  scanned: {
    appleRefreshTokens: number;
  };
  nextCursor: string | null;
  remaining: {
    customerSessions: number;
    operatorSessions: number;
    internalAdminSessions: number;
    appleRefreshTokens: number;
  };
};

function positiveBatchSize(batchSize: number) {
  if (
    !Number.isSafeInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > maximumBatchSize
  ) {
    throw new Error(
      `Identity secret backfill batch size must be between 1 and ${maximumBatchSize}`,
    );
  }
  return batchSize;
}

/**
 * Runs one bounded and idempotent identity-secret data-migration batch. Kept
 * separately injectable so the exact PostgreSQL path can be tested against a
 * disposable local schema without touching the guarded operational wrapper.
 */
export async function backfillIdentitySecretStorageBatch(
  db: PersistenceDb,
  cipher: AppleRefreshTokenCipher,
  requestedBatchSize = maximumBatchSize,
  afterCursor?: string,
): Promise<IdentitySecretStorageBackfillResult> {
  const batchSize = positiveBatchSize(requestedBatchSize);
  const afterUserId = afterCursor
    ? cipher.decodeBackfillCursor(afterCursor)
    : undefined;

  return db.transaction().execute(async (trx) => {
    const result: IdentitySecretStorageBackfillResult = {
      customerSessions: 0,
      operatorSessions: 0,
      internalAdminSessions: 0,
      appleRefreshTokens: 0,
      unresolved: {
        appleRefreshTokens: 0,
      },
      scanned: {
        appleRefreshTokens: 0,
      },
      nextCursor: null,
      remaining: {
        customerSessions: 0,
        operatorSessions: 0,
        internalAdminSessions: 0,
        appleRefreshTokens: 0,
      },
    };

    const sessionTables: ReadonlyArray<
      readonly [SessionTable, keyof IdentitySecretStorageBackfillResult]
    > = [
      ["identity_sessions", "customerSessions"],
      ["operator_sessions", "operatorSessions"],
      ["internal_admin_sessions", "internalAdminSessions"],
    ];

    for (const [table, counter] of sessionTables) {
      const candidate = sql<boolean>`
        access_token !~ ${sessionDigestPattern}
        OR refresh_token !~ ${sessionDigestPattern}
      `;
      const rows = await sql<{ access_token: string; refresh_token: string }>`
        SELECT access_token, refresh_token
        FROM ${sql.table(table)}
        WHERE ${candidate}
        ORDER BY created_at ASC, access_token ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      `.execute(trx);

      for (const row of rows.rows) {
        if (
          (row.access_token.startsWith("sha256:") &&
            !isSessionTokenDigest(row.access_token)) ||
          (row.refresh_token.startsWith("sha256:") &&
            !isSessionTokenDigest(row.refresh_token))
        ) {
          // Never reinterpret malformed version-tagged values as plaintext bearer tokens.
          throw new Error(
            "Identity session token has an unsupported digest format",
          );
        }

        const accessToken = isSessionTokenDigest(row.access_token)
          ? row.access_token
          : digestSessionToken(row.access_token);
        const refreshToken = isSessionTokenDigest(row.refresh_token)
          ? row.refresh_token
          : digestSessionToken(row.refresh_token);
        if (
          accessToken === row.access_token &&
          refreshToken === row.refresh_token
        )
          continue;

        await sql`
          UPDATE ${sql.table(table)}
          SET access_token = ${accessToken}, refresh_token = ${refreshToken}, updated_at = NOW()
          WHERE access_token = ${row.access_token}
            AND refresh_token = ${row.refresh_token}
        `.execute(trx);
        result[
          counter as
            | "customerSessions"
            | "operatorSessions"
            | "internalAdminSessions"
        ] += 1;
      }

      const remaining = await sql<{ count: string }>`
        SELECT COUNT(*)::text AS count
        FROM ${sql.table(table)}
        WHERE ${candidate}
      `.execute(trx);
      result.remaining[
        counter as
          | "customerSessions"
          | "operatorSessions"
          | "internalAdminSessions"
      ] = Number(remaining.rows[0]?.count ?? 0);
    }

    const appleRows = afterUserId
      ? await sql<{
          user_id: string;
          apple_refresh_token: string;
        }>`
          SELECT user_id::text AS user_id, apple_refresh_token
          FROM identity_users
          WHERE apple_refresh_token IS NOT NULL
            AND user_id::text > ${afterUserId}
          ORDER BY user_id::text ASC
          LIMIT ${batchSize}
        `.execute(trx)
      : await sql<{
          user_id: string;
          apple_refresh_token: string;
        }>`
          SELECT user_id::text AS user_id, apple_refresh_token
          FROM identity_users
          WHERE apple_refresh_token IS NOT NULL
          ORDER BY user_id::text ASC
          LIMIT ${batchSize}
        `.execute(trx);

    result.scanned.appleRefreshTokens = appleRows.rows.length;

    for (const row of appleRows.rows) {
      const currentValue = row.apple_refresh_token;
      let plaintext: string | undefined;
      let needsReencryption = false;

      if (isEncryptedAppleRefreshToken(currentValue)) {
        const keyId = cipher.keyId(currentValue);
        if (!keyId || !isSupportedAppleCiphertext(currentValue)) {
          result.unresolved.appleRefreshTokens += 1;
          result.remaining.appleRefreshTokens += 1;
          continue;
        }

        try {
          // Validate the tag and user-bound AAD even for rows already using
          // the active key. Ciphertext format alone is not verification.
          plaintext = cipher.decrypt(currentValue, row.user_id);
        } catch {
          result.unresolved.appleRefreshTokens += 1;
          result.remaining.appleRefreshTokens += 1;
          continue;
        }
        needsReencryption = keyId !== cipher.activeKeyId;
      } else {
        // Unknown/reserved markers must never be reinterpreted as plaintext.
        if (currentValue.startsWith("aes256gcm:")) {
          result.unresolved.appleRefreshTokens += 1;
          result.remaining.appleRefreshTokens += 1;
          continue;
        }
        plaintext = currentValue;
        needsReencryption = true;
      }

      if (!needsReencryption) continue;
      if (plaintext === undefined) {
        result.unresolved.appleRefreshTokens += 1;
        result.remaining.appleRefreshTokens += 1;
        continue;
      }
      const replacement = cipher.encrypt(plaintext, row.user_id);
      const updated = await sql<{ user_id: string }>`
        UPDATE identity_users
        SET apple_refresh_token = ${replacement}, updated_at = NOW()
        WHERE user_id = ${row.user_id}
          AND apple_refresh_token = ${currentValue}
        RETURNING user_id::text AS user_id
      `.execute(trx);
      if (updated.rows.length === 0) {
        // A concurrent identity operation won the race. Leave a conservative
        // remaining count so the next run will validate the current value.
        result.remaining.appleRefreshTokens += 1;
        continue;
      }

      result.appleRefreshTokens += 1;
    }

    if (appleRows.rows.length === batchSize) {
      const lastUserId = appleRows.rows[appleRows.rows.length - 1]?.user_id;
      if (lastUserId)
        result.nextCursor = cipher.encodeBackfillCursor(lastUserId);
    }
    return result;
  });
}

function isSupportedAppleCiphertext(value: string) {
  return new RegExp(supportedAppleCipherPattern).test(value);
}

/** Explicit dev-only cutover. Never use this entrypoint against a live DB from an agent run. */
export async function backfillIdentitySecretStorage(): Promise<IdentitySecretStorageBackfillResult> {
  if (
    process.env.DEPLOY_ENV !== "dev" ||
    process.env.IDENTITY_SECRET_BACKFILL_CONFIRM !== "dev-only"
  ) {
    throw new Error(
      "Identity secret backfill is restricted to explicitly confirmed dev deployment",
    );
  }

  const approvedDevProjectRef =
    process.env.IDENTITY_SECRET_BACKFILL_DEV_PROJECT_REF?.trim();
  const expectedProjectRef = process.env.EXPECTED_SUPABASE_PROJECT_REF?.trim();
  const databaseUrl = getDatabaseUrl();
  if (
    !databaseUrl ||
    !approvedDevProjectRef ||
    !expectedProjectRef ||
    expectedProjectRef !== approvedDevProjectRef
  ) {
    throw new Error(
      "Identity secret backfill requires a matching, explicitly approved dev database target",
    );
  }

  const target = getDatabaseTargetMetadata(databaseUrl);
  if (
    !target.supabaseProjectRef ||
    target.supabaseProjectRef !== approvedDevProjectRef
  ) {
    throw new Error(
      "Identity secret backfill database target does not match the approved dev project",
    );
  }
  assertExpectedDatabaseTarget(databaseUrl);

  const cipher = createAppleRefreshTokenCipher(
    process.env.IDENTITY_APPLE_TOKEN_ENCRYPTION_KEYS,
    process.env.IDENTITY_APPLE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID,
  );
  const afterCursor = process.env.IDENTITY_SECRET_BACKFILL_CURSOR?.trim();
  if (afterCursor) cipher.decodeBackfillCursor(afterCursor);
  const db = createPostgresDb(databaseUrl);
  try {
    return await backfillIdentitySecretStorageBatch(
      db,
      cipher,
      maximumBatchSize,
      afterCursor,
    );
  } finally {
    await db.destroy();
  }
}

if (process.argv[1]?.endsWith("backfill-secret-storage.js")) {
  backfillIdentitySecretStorage()
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    })
    .catch(() => {
      process.stderr.write(
        "Identity secret backfill failed; inspect sanitized operational logs\n",
      );
      process.exitCode = 1;
    });
}
