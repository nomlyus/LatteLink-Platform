import { sql, type Kysely } from "kysely";

type MigrationDb = Kysely<Record<string, never>>;

const tablesRequiringRowLevelSecurity = [
  "payments_stripe_payment_intents",
  "audit_log",
  "catalog_clients",
  "discount_codes",
  "discount_code_redemptions",
  "catalog_client_locations",
  "catalog_onboarding_progress",
  "operator_owner_invites",
  "order_checkout_drafts",
  "catalog_mobile_experience_drafts",
  "catalog_mobile_experience_versions",
  "catalog_app_identity_profiles",
  "catalog_mobile_release_profiles",
  "catalog_mobile_release_build_jobs",
] as const;

const lockdownDataApiPrivileges = [
  "DO $nomly_data_api_lockdown$",
  "DECLARE",
  "  schema_name name := current_schema();",
  "  api_roles text;",
  "  grant_targets text;",
  "  default_owner name;",
  "BEGIN",
  "  SELECT string_agg(quote_ident(rolname), ', ' ORDER BY rolname)",
  "    INTO api_roles",
  "    FROM pg_catalog.pg_roles",
  "    WHERE rolname IN ('anon', 'authenticated', 'service_role');",
  "",
  "  grant_targets := 'PUBLIC' || CASE WHEN api_roles IS NULL THEN '' ELSE ', ' || api_roles END;",
  "",
  "  -- A schema-level deny also contains objects created later by Supabase-managed roles whose default ACLs this application role cannot edit.",
  "  EXECUTE format('REVOKE ALL PRIVILEGES ON SCHEMA %I FROM %s', schema_name, grant_targets);",
  "  EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I FROM %s', schema_name, grant_targets);",
  "  EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA %I FROM %s', schema_name, grant_targets);",
  "  EXECUTE format('REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA %I FROM %s', schema_name, grant_targets);",
  "",
  "  default_owner := current_user::name;",
  "  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I REVOKE ALL PRIVILEGES ON TABLES FROM %s', default_owner, schema_name, grant_targets);",
  "  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I REVOKE ALL PRIVILEGES ON SEQUENCES FROM %s', default_owner, schema_name, grant_targets);",
  "  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I REVOKE EXECUTE ON FUNCTIONS FROM %s', default_owner, schema_name, grant_targets);",
  "END;",
  "$nomly_data_api_lockdown$;",
].join("\n");

export async function up(db: MigrationDb): Promise<void> {
  const deployEnvironment = process.env.DEPLOY_ENV?.trim().toLowerCase();
  const isLocalDevelopment =
    !deployEnvironment && process.env.NODE_ENV !== "production";

  if (
    deployEnvironment !== "dev" &&
    deployEnvironment !== "test" &&
    !isLocalDevelopment
  ) {
    throw new Error(
      "Migration 0049 is limited to dev/test; production Data API access requires a separate explicit review.",
    );
  }

  for (const table of tablesRequiringRowLevelSecurity) {
    await sql.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`).execute(db);
  }

  await sql.raw(lockdownDataApiPrivileges).execute(db);
}
