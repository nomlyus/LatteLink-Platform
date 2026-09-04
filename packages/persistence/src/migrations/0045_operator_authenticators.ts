import { sql, type Kysely } from "kysely";

type MigrationDb = Kysely<Record<string, never>>;

export async function up(db: MigrationDb): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS operator_authenticators (
      authenticator_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      operator_user_id UUID NOT NULL REFERENCES operator_users (operator_user_id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('password', 'oauth', 'passkey')),
      provider TEXT NOT NULL CHECK (provider IN ('legacy_password', 'google', 'apple', 'webauthn')),
      issuer TEXT,
      subject TEXT,
      credential_id TEXT,
      password_hash TEXT,
      display_name TEXT,
      metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      recovery_capable BOOLEAN NOT NULL DEFAULT TRUE,
      last_used_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT operator_authenticators_shape_check CHECK (
        (kind = 'password' AND provider = 'legacy_password' AND password_hash IS NOT NULL
          AND issuer IS NULL AND subject IS NULL AND credential_id IS NULL)
        OR
        (kind = 'oauth' AND provider IN ('google', 'apple') AND issuer IS NOT NULL
          AND subject IS NOT NULL AND credential_id IS NULL AND password_hash IS NULL)
        OR
        (kind = 'passkey' AND provider = 'webauthn' AND credential_id IS NOT NULL
          AND issuer IS NULL AND subject IS NULL AND password_hash IS NULL)
      )
    )
  `.execute(db);

  // The service uses a direct PostgreSQL connection. No Data API role should read credential metadata.
  await sql`ALTER TABLE operator_authenticators ENABLE ROW LEVEL SECURITY`.execute(db);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS operator_authenticators_oauth_identity_unique_idx
    ON operator_authenticators (issuer, subject)
    WHERE kind = 'oauth'
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS operator_authenticators_passkey_credential_unique_idx
    ON operator_authenticators (credential_id)
    WHERE kind = 'passkey'
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS operator_authenticators_active_provider_unique_idx
    ON operator_authenticators (operator_user_id, provider)
    WHERE revoked_at IS NULL AND provider IN ('legacy_password', 'google', 'apple')
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS operator_authenticators_user_active_idx
    ON operator_authenticators (operator_user_id, created_at DESC)
    WHERE revoked_at IS NULL
  `.execute(db);

  await sql`
    INSERT INTO operator_authenticators (
      operator_user_id,
      kind,
      provider,
      password_hash,
      display_name,
      recovery_capable,
      created_at,
      updated_at
    )
    SELECT
      operator_user_id,
      'password',
      'legacy_password',
      password_hash,
      'Password',
      TRUE,
      created_at,
      updated_at
    FROM operator_users users
    WHERE password_hash IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM operator_authenticators authenticators
        WHERE authenticators.operator_user_id = users.operator_user_id
          AND authenticators.provider = 'legacy_password'
          AND authenticators.revoked_at IS NULL
      )
  `.execute(db);

  await sql`
    INSERT INTO operator_authenticators (
      operator_user_id,
      kind,
      provider,
      issuer,
      subject,
      display_name,
      recovery_capable,
      created_at,
      updated_at
    )
    SELECT
      operator_user_id,
      'oauth',
      'google',
      'https://accounts.google.com',
      google_sub,
      'Google',
      TRUE,
      created_at,
      updated_at
    FROM operator_users users
    WHERE google_sub IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM operator_authenticators authenticators
        WHERE authenticators.issuer = 'https://accounts.google.com'
          AND authenticators.subject = users.google_sub
      )
  `.execute(db);
}

export async function down(db: MigrationDb): Promise<void> {
  await sql`DROP TABLE IF EXISTS operator_authenticators`.execute(db);
}
