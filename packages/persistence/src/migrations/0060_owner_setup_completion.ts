import { sql, type Kysely } from "kysely";

type MigrationDb = Kysely<Record<string, never>>;

export async function up(db: MigrationDb): Promise<void> {
  await sql`ALTER TABLE catalog_clients ADD COLUMN owner_setup_completed_at TIMESTAMPTZ`.execute(db);
  // Existing configured merchants must not be forced into first-time setup
  // merely because their app release or payment readiness is still incomplete.
  await sql`
    UPDATE catalog_clients c SET owner_setup_completed_at = c.updated_at
    WHERE c.status IN ('ready_for_review', 'approved', 'live') OR EXISTS (
      SELECT 1 FROM catalog_onboarding_progress p
      WHERE p.tenant_id = c.tenant_id
        AND p.business_profile_complete AND p.store_operations_complete
    )
  `.execute(db);
}

export async function down(db: MigrationDb): Promise<void> {
  await sql`ALTER TABLE catalog_clients DROP COLUMN owner_setup_completed_at`.execute(db);
}
