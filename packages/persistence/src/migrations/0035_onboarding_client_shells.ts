import { sql, type Kysely } from "kysely";

type MigrationDb = Kysely<Record<string, never>>;

export async function up(db: MigrationDb): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS catalog_clients (
      tenant_id TEXT PRIMARY KEY,
      brand_id TEXT NOT NULL UNIQUE,
      client_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'invited', 'in_progress', 'ready_for_review', 'approved', 'live', 'blocked')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS catalog_clients_status_idx
    ON catalog_clients (status, updated_at DESC)
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS catalog_client_locations (
      tenant_id TEXT NOT NULL REFERENCES catalog_clients (tenant_id) ON DELETE CASCADE,
      location_id TEXT PRIMARY KEY,
      brand_id TEXT NOT NULL,
      location_name TEXT NOT NULL,
      market_label TEXT NOT NULL,
      primary_location BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, location_id)
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS catalog_client_locations_tenant_idx
    ON catalog_client_locations (tenant_id, primary_location DESC, created_at)
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS catalog_onboarding_progress (
      location_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES catalog_clients (tenant_id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'invited', 'in_progress', 'ready_for_review', 'approved', 'live', 'blocked')),
      owner_invited BOOLEAN NOT NULL DEFAULT FALSE,
      owner_activated BOOLEAN NOT NULL DEFAULT FALSE,
      business_profile_complete BOOLEAN NOT NULL DEFAULT FALSE,
      store_operations_complete BOOLEAN NOT NULL DEFAULT FALSE,
      menu_ready BOOLEAN NOT NULL DEFAULT FALSE,
      team_configured_or_skipped BOOLEAN NOT NULL DEFAULT FALSE,
      test_order_completed BOOLEAN NOT NULL DEFAULT FALSE,
      admin_launch_approved BOOLEAN NOT NULL DEFAULT FALSE,
      submitted_for_review_at TIMESTAMPTZ,
      approved_at TIMESTAMPTZ,
      live_at TIMESTAMPTZ,
      blocked_reason TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS catalog_onboarding_progress_tenant_status_idx
    ON catalog_onboarding_progress (tenant_id, status, updated_at DESC)
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS catalog_mobile_release_profiles (
      location_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES catalog_clients (tenant_id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'not_started'
        CHECK (
          status IN (
            'not_started',
            'metadata_pending',
            'metadata_ready',
            'build_configuring',
            'build_ready',
            'submitted_for_review',
            'approved',
            'ready_for_launch',
            'live',
            'blocked'
          )
        ),
      status_label TEXT,
      app_store_url TEXT,
      test_flight_url TEXT,
      build_number TEXT,
      submitted_at TIMESTAMPTZ,
      approved_at TIMESTAMPTZ,
      live_at TIMESTAMPTZ,
      blocked_reason TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS catalog_mobile_release_profiles_tenant_status_idx
    ON catalog_mobile_release_profiles (tenant_id, status, updated_at DESC)
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS operator_owner_invites (
      invite_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      location_id TEXT NOT NULL,
      operator_user_id UUID,
      email TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS operator_owner_invites_location_created_idx
    ON operator_owner_invites (location_id, created_at DESC)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS operator_owner_invites_email_active_idx
    ON operator_owner_invites (email, expires_at)
    WHERE consumed_at IS NULL AND revoked_at IS NULL
  `.execute(db);
}

export async function down(db: MigrationDb): Promise<void> {
  await sql`DROP INDEX IF EXISTS operator_owner_invites_email_active_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS operator_owner_invites_location_created_idx`.execute(db);
  await sql`DROP TABLE IF EXISTS operator_owner_invites`.execute(db);
  await sql`DROP INDEX IF EXISTS catalog_mobile_release_profiles_tenant_status_idx`.execute(db);
  await sql`DROP TABLE IF EXISTS catalog_mobile_release_profiles`.execute(db);
  await sql`DROP INDEX IF EXISTS catalog_onboarding_progress_tenant_status_idx`.execute(db);
  await sql`DROP TABLE IF EXISTS catalog_onboarding_progress`.execute(db);
  await sql`DROP INDEX IF EXISTS catalog_client_locations_tenant_idx`.execute(db);
  await sql`DROP TABLE IF EXISTS catalog_client_locations`.execute(db);
  await sql`DROP INDEX IF EXISTS catalog_clients_status_idx`.execute(db);
  await sql`DROP TABLE IF EXISTS catalog_clients`.execute(db);
}
