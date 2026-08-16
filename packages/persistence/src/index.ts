import { createHash } from "node:crypto";
import { Kysely, PostgresDialect } from "kysely";
import type { Generated } from "kysely";
import { Pool, type PoolConfig } from "pg";

export { runMigrations } from "./migrate.js";
export { sql } from "kysely";

export interface PaymentsChargeTable {
  payment_id: string;
  provider_payment_id: string | null;
  order_id: string;
  idempotency_key: string;
  provider: "CLOVER";
  status: "SUCCEEDED" | "DECLINED" | "TIMEOUT";
  approved: boolean;
  amount_cents: number;
  currency: "USD";
  occurred_at: string;
  decline_code: string | null;
  message: string | null;
  created_at: Generated<string>;
}

export interface PaymentsRefundTable {
  refund_id: string;
  order_id: string;
  payment_id: string;
  idempotency_key: string;
  provider: "CLOVER" | "STRIPE";
  status: "REFUNDED" | "REJECTED";
  amount_cents: number;
  currency: "USD";
  occurred_at: string;
  message: string | null;
  created_at: Generated<string>;
}

export interface PaymentsWebhookDeduplicationTable {
  event_key: string;
  kind: "CHARGE" | "REFUND";
  order_id: string;
  payment_id: string;
  status: string;
  order_applied: boolean;
  created_at: Generated<string>;
}

export interface PaymentsStripeWebhookEventTable {
  event_id: string;
  event_type: string;
  stripe_account: string | null;
  livemode: boolean;
  payload_json: unknown;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface PaymentsStripePaymentIntentTable {
  payment_intent_id: string;
  order_id: string;
  location_id: string;
  stripe_account_id: string;
  amount_cents: number;
  currency: "USD";
  status: string;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface OrderCheckoutDraftTable {
  checkout_id: string;
  user_id: string;
  quote_id: string;
  quote_hash: string;
  status: "OPEN" | "CONVERTED" | "EXPIRED";
  order_id: string | null;
  expires_at: string;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface PaymentsCloverConnectionTable {
  merchant_id: string;
  location_id: string | null;
  access_token: string;
  refresh_token: string | null;
  access_token_expires_at: string | null;
  refresh_token_expires_at: string | null;
  api_access_key: string | null;
  token_type: string | null;
  scope: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface LoyaltyBalanceTable {
  brand_id: string;
  location_id: string;
  user_id: string;
  available_points: number;
  pending_points: number;
  lifetime_earned: number;
  updated_at: Generated<string>;
}

export interface LoyaltyLedgerEntryTable {
  id: string;
  brand_id: string;
  location_id: string;
  user_id: string;
  type: "EARN" | "REDEEM" | "REFUND" | "ADJUSTMENT";
  points: number;
  order_id: string | null;
  created_at: string;
}

export interface LoyaltyIdempotencyKeyTable {
  brand_id: string;
  location_id: string;
  user_id: string;
  idempotency_key: string;
  request_fingerprint: string;
  response_json: unknown;
  created_at: Generated<string>;
}

export interface OrdersQuoteTable {
  quote_id: string;
  quote_hash: string;
  quote_json: unknown;
  created_at: Generated<string>;
}

export interface OrdersTable {
  order_id: string;
  user_id: string;
  quote_id: string;
  order_json: unknown;
  payment_id: string | null;
  successful_charge_json: unknown;
  successful_refund_json: unknown;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface OrdersCreateIdempotencyTable {
  quote_id: string;
  quote_hash: string;
  order_id: string;
  created_at: Generated<string>;
}

export interface OrdersPaymentIdempotencyTable {
  order_id: string;
  idempotency_key: string;
  created_at: Generated<string>;
}

export interface DiscountCodeTable {
  discount_code_id: Generated<string>;
  location_id: string;
  code: string;
  name: string;
  type: "percent" | "fixed_cents";
  value: number;
  max_discount_cents: number | null;
  min_subtotal_cents: number;
  eligibility: "everyone" | "first_order_only" | "existing_customers_only";
  once_per_customer: boolean;
  max_total_redemptions: number | null;
  active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface DiscountCodeRedemptionTable {
  redemption_id: Generated<string>;
  discount_code_id: string;
  location_id: string;
  code: string;
  order_id: string;
  user_id: string;
  discount_cents: number;
  status: "RESERVED" | "REDEEMED" | "RELEASED";
  reserved_at: Generated<string>;
  redeemed_at: string | null;
  released_at: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface IdentityUserTable {
  user_id: string;
  apple_sub: string | null;
  apple_client_id: string | null;
  apple_refresh_token: string | null;
  email: string | null;
  name: string | null;
  display_name: string | null;
  phone_number: string | null;
  birthday: string | null;
  profile_completed_at: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface IdentitySessionTable {
  access_token: string;
  refresh_token: string;
  user_id: string;
  access_expires_at: string | null;
  expires_at: string;
  revoked_at: string | null;
  auth_method: "apple" | "passkey-register" | "passkey-auth" | "refresh";
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface IdentityPasskeyChallengeTable {
  challenge: string;
  flow: "register" | "auth";
  user_id: string | null;
  rp_id: string;
  timeout_ms: number;
  expires_at: string;
  consumed_at: string | null;
  created_at: Generated<string>;
}

export interface IdentityPasskeyCredentialTable {
  credential_id: string;
  user_id: string;
  webauthn_user_id: string;
  public_key: string;
  counter: number;
  transports_json: unknown;
  device_type: "singleDevice" | "multiDevice";
  backed_up: boolean;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface OperatorUserTable {
  operator_user_id: string;
  email: string;
  google_sub: string | null;
  display_name: string;
  password_hash: string | null;
  role: "owner" | "manager" | "store";
  location_id: string;
  active: boolean;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface OperatorLocationAccessTable {
  operator_user_id: string;
  location_id: string;
  created_at: Generated<string>;
}

export interface OperatorSessionTable {
  access_token: string;
  refresh_token: string;
  operator_user_id: string;
  active_location_id: string | null;
  access_expires_at: string | null;
  expires_at: string;
  revoked_at: string | null;
  auth_method: "password" | "google" | "refresh";
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface InternalAdminUserTable {
  internal_admin_user_id: string;
  email: string;
  display_name: string;
  password_hash: string;
  role: "platform_owner" | "platform_operator" | "support_readonly";
  active: boolean;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface InternalAdminSessionTable {
  access_token: string;
  refresh_token: string;
  internal_admin_user_id: string;
  access_expires_at: string | null;
  expires_at: string;
  revoked_at: string | null;
  auth_method: "password" | "refresh";
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface NotificationsPushTokenTable {
  user_id: string;
  device_id: string;
  platform: "ios" | "android";
  expo_push_token: string;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface NotificationsOrderStateDispatchTable {
  dispatch_key: string;
  user_id: string;
  order_id: string;
  status: "PENDING_PAYMENT" | "PAID" | "IN_PREP" | "READY" | "COMPLETED" | "CANCELED";
  occurred_at: string;
  created_at: Generated<string>;
}

export interface NotificationsOutboxTable {
  id: string;
  user_id: string;
  device_id: string;
  platform: "ios" | "android";
  expo_push_token: string;
  payload_json: unknown;
  status: "PENDING" | "DISPATCHED" | "FAILED";
  attempts: number;
  available_at: string;
  dispatched_at: string | null;
  last_error: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface CatalogMenuCategoryTable {
  brand_id: string;
  location_id: string;
  category_id: string;
  title: string;
  sort_order: number;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface CatalogMenuItemTable {
  brand_id: string;
  location_id: string;
  item_id: string;
  category_id: string;
  name: string;
  description: string;
  image_url: string | null;
  price_cents: number;
  badge_codes_json: unknown;
  customization_groups_json: unknown;
  visible: boolean;
  sort_order: number;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface CatalogHomeNewsCardTable {
  brand_id: string;
  location_id: string;
  card_id: string;
  label: string;
  title: string;
  body: string;
  note: string | null;
  visible: boolean;
  sort_order: number;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface CatalogStoreConfigTable {
  brand_id: string;
  location_id: string;
  store_name: string;
  hours_text: string;
  prep_eta_minutes: number;
  tax_rate_basis_points: number;
  pickup_instructions: string;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface CatalogAppConfigTable {
  brand_id: string;
  location_id: string;
  app_config_json: unknown;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface CatalogPaymentProfileTable {
  brand_id: string;
  location_id: string;
  payment_profile_json: unknown;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface CatalogClientTable {
  tenant_id: string;
  brand_id: string;
  client_name: string;
  owner_email: string | null;
  status: "draft" | "invited" | "in_progress" | "ready_for_review" | "approved" | "live" | "blocked";
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface CatalogClientLocationTable {
  tenant_id: string;
  location_id: string;
  brand_id: string;
  location_name: string;
  market_label: string;
  primary_location: boolean;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface CatalogOnboardingProgressTable {
  location_id: string;
  tenant_id: string;
  status: "draft" | "invited" | "in_progress" | "ready_for_review" | "approved" | "live" | "blocked";
  owner_invited: boolean;
  owner_activated: boolean;
  business_profile_complete: boolean;
  store_operations_complete: boolean;
  menu_ready: boolean;
  team_configured_or_skipped: boolean;
  test_order_completed: boolean;
  admin_launch_approved: boolean;
  submitted_for_review_at: string | null;
  approved_at: string | null;
  live_at: string | null;
  blocked_reason: string | null;
  notes: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface CatalogMobileReleaseProfileTable {
  location_id: string;
  tenant_id: string;
  status:
    | "not_started"
    | "metadata_pending"
    | "metadata_ready"
    | "build_configuring"
    | "build_ready"
    | "submitted_for_review"
    | "approved"
    | "ready_for_launch"
    | "live"
    | "blocked";
  status_label: string | null;
  app_store_url: string | null;
  test_flight_url: string | null;
  build_number: string | null;
  build_profile: string | null;
  source_commit_sha: string | null;
  config_hash: string | null;
  app_store_review_notes: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  live_at: string | null;
  blocked_reason: string | null;
  notes: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface CatalogAppIdentityProfileTable {
  location_id: string;
  tenant_id: string;
  app_name: string | null;
  display_name: string | null;
  bundle_identifier: string | null;
  sku: string | null;
  primary_category: string;
  subtitle: string | null;
  description: string | null;
  keywords: string[];
  support_url: string | null;
  privacy_policy_url: string | null;
  marketing_url: string | null;
  icon_asset_url: string | null;
  splash_asset_url: string | null;
  screenshot_asset_urls: string[];
  target_location_ids: string[];
  asset_mode: "placeholder" | "provided";
  admin_override_ready: boolean;
  admin_override_reason: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface OperatorOwnerInviteTable {
  invite_id: Generated<string>;
  location_id: string;
  operator_user_id: string | null;
  email: string;
  token_hash: string;
  expires_at: string;
  consumed_at: string | null;
  revoked_at: string | null;
  sent_at: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface AuditLogTable {
  log_id: Generated<string>;
  location_id: string;
  actor_id: string;
  actor_type: "operator" | "internal_admin" | "system" | "customer";
  action: string;
  target_id: string | null;
  target_type: string | null;
  payload: unknown;
  occurred_at: Generated<string>;
}

export interface CatalogMobileExperienceDraftTable {
  location_id: string;
  experience_json: unknown;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface CatalogMobileExperienceVersionTable {
  version_id: string;
  location_id: string;
  experience_json: unknown;
  published_at: Generated<string>;
  created_at: Generated<string>;
}

export interface PersistenceDatabase {
  payments_charges: PaymentsChargeTable;
  payments_refunds: PaymentsRefundTable;
  payments_webhook_deduplication: PaymentsWebhookDeduplicationTable;
  payments_stripe_webhook_events: PaymentsStripeWebhookEventTable;
  payments_stripe_payment_intents: PaymentsStripePaymentIntentTable;
  payments_clover_connections: PaymentsCloverConnectionTable;
  loyalty_balances: LoyaltyBalanceTable;
  loyalty_ledger_entries: LoyaltyLedgerEntryTable;
  loyalty_idempotency_keys: LoyaltyIdempotencyKeyTable;
  orders_quotes: OrdersQuoteTable;
  order_checkout_drafts: OrderCheckoutDraftTable;
  orders: OrdersTable;
  orders_create_idempotency: OrdersCreateIdempotencyTable;
  orders_payment_idempotency: OrdersPaymentIdempotencyTable;
  discount_codes: DiscountCodeTable;
  discount_code_redemptions: DiscountCodeRedemptionTable;
  identity_users: IdentityUserTable;
  identity_sessions: IdentitySessionTable;
  identity_passkey_challenges: IdentityPasskeyChallengeTable;
  identity_passkey_credentials: IdentityPasskeyCredentialTable;
  operator_users: OperatorUserTable;
  operator_location_access: OperatorLocationAccessTable;
  operator_sessions: OperatorSessionTable;
  internal_admin_users: InternalAdminUserTable;
  internal_admin_sessions: InternalAdminSessionTable;
  notifications_push_tokens: NotificationsPushTokenTable;
  notifications_order_state_dispatches: NotificationsOrderStateDispatchTable;
  notifications_outbox: NotificationsOutboxTable;
  catalog_menu_categories: CatalogMenuCategoryTable;
  catalog_menu_items: CatalogMenuItemTable;
  catalog_home_news_cards: CatalogHomeNewsCardTable;
  catalog_store_configs: CatalogStoreConfigTable;
  catalog_app_configs: CatalogAppConfigTable;
  catalog_payment_profiles: CatalogPaymentProfileTable;
  catalog_clients: CatalogClientTable;
  catalog_client_locations: CatalogClientLocationTable;
  catalog_onboarding_progress: CatalogOnboardingProgressTable;
  catalog_mobile_release_profiles: CatalogMobileReleaseProfileTable;
  catalog_app_identity_profiles: CatalogAppIdentityProfileTable;
  catalog_mobile_experience_drafts: CatalogMobileExperienceDraftTable;
  catalog_mobile_experience_versions: CatalogMobileExperienceVersionTable;
  operator_owner_invites: OperatorOwnerInviteTable;
  audit_log: AuditLogTable;
}

export type PersistenceDb = Kysely<PersistenceDatabase>;

export type AuditLogActorType = AuditLogTable["actor_type"];

export type AuditLogEntry = {
  locationId: string;
  actorId: string;
  actorType: AuditLogActorType;
  action: string;
  targetId?: string;
  targetType?: string;
  payload?: Record<string, unknown>;
  occurredAt?: string;
};

export async function writeAuditLog(db: PersistenceDb, entry: AuditLogEntry): Promise<void> {
  await db
    .insertInto("audit_log")
    .values({
      location_id: entry.locationId,
      actor_id: entry.actorId,
      actor_type: entry.actorType,
      action: entry.action,
      target_id: entry.targetId ?? null,
      target_type: entry.targetType ?? null,
      payload: entry.payload ?? null,
      ...(entry.occurredAt ? { occurred_at: entry.occurredAt } : {})
    })
    .execute();
}

const defaultPostgresPoolMax = 2;
const defaultPostgresConnectionTimeoutMs = 5_000;
const defaultPostgresIdleTimeoutMs = 10_000;

function toPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

export function getPostgresPoolConfig(
  connectionString: string,
  env: NodeJS.ProcessEnv = process.env
): PoolConfig {
  return {
    connectionString,
    max: toPositiveInteger(env.POSTGRES_POOL_MAX, defaultPostgresPoolMax),
    connectionTimeoutMillis: toPositiveInteger(
      env.POSTGRES_CONNECTION_TIMEOUT_MS,
      defaultPostgresConnectionTimeoutMs
    ),
    idleTimeoutMillis: toPositiveInteger(env.POSTGRES_IDLE_TIMEOUT_MS, defaultPostgresIdleTimeoutMs)
  };
}

export function createPostgresDb(connectionString: string): PersistenceDb {
  return new Kysely<PersistenceDatabase>({
    dialect: new PostgresDialect({
      pool: new Pool(getPostgresPoolConfig(connectionString))
    })
  });
}

function trimToUndefined(value: string | null | undefined) {
  const next = value?.trim();
  return next && next.length > 0 ? next : undefined;
}

function parseDatabaseUrl(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function resolveSupabaseProjectRef(parsed: URL | undefined) {
  if (!parsed) {
    return undefined;
  }

  const directHostMatch = parsed.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
  if (directHostMatch?.[1]) {
    return directHostMatch[1];
  }

  const poolerUserMatch = decodeURIComponent(parsed.username).match(/^postgres\.([a-z0-9]+)$/i);
  if (poolerUserMatch?.[1]) {
    return poolerUserMatch[1];
  }

  return undefined;
}

export function getDeployEnvironment(env: NodeJS.ProcessEnv = process.env) {
  return trimToUndefined(env.DEPLOY_ENV) ?? trimToUndefined(env.APP_ENV) ?? "unknown";
}

export function getDatabaseTargetMetadata(connectionString?: string) {
  const parsed = parseDatabaseUrl(connectionString);
  const supabaseProjectRef = resolveSupabaseProjectRef(parsed);
  const target = parsed
    ? [parsed.hostname, parsed.port, decodeURIComponent(parsed.username), parsed.pathname].filter(Boolean).join("|")
    : "unconfigured";

  return {
    hostname: parsed?.hostname,
    supabaseProjectRef,
    fingerprint: createHash("sha256").update(target).digest("hex").slice(0, 16)
  };
}

export function assertExpectedDatabaseTarget(connectionString: string, env: NodeJS.ProcessEnv = process.env) {
  const expectedSupabaseProjectRef = trimToUndefined(env.EXPECTED_SUPABASE_PROJECT_REF);
  if (!expectedSupabaseProjectRef) {
    return;
  }

  const metadata = getDatabaseTargetMetadata(connectionString);
  if (metadata.supabaseProjectRef === expectedSupabaseProjectRef) {
    return;
  }

  const error = new Error(
    `DATABASE_URL Supabase project ref mismatch for ${getDeployEnvironment(env)}: expected ${expectedSupabaseProjectRef}, received ${metadata.supabaseProjectRef ?? "unknown"}`
  ) as Error & { code?: string };
  error.name = "DatabaseEnvironmentMismatchError";
  error.code = "DATABASE_ENVIRONMENT_MISMATCH";
  throw error;
}

export function getPersistenceReadinessMetadata(env: NodeJS.ProcessEnv = process.env) {
  const databaseUrl = trimToUndefined(env.DATABASE_URL);
  const databaseTarget = getDatabaseTargetMetadata(databaseUrl);
  const expectedSupabaseProjectRef = trimToUndefined(env.EXPECTED_SUPABASE_PROJECT_REF);
  const poolConfig = databaseUrl ? getPostgresPoolConfig(databaseUrl, env) : undefined;

  return {
    deployEnvironment: getDeployEnvironment(env),
    database: {
      configured: Boolean(databaseUrl),
      backend: databaseUrl ? "postgres" : "memory",
      supabaseProjectRef: databaseTarget.supabaseProjectRef,
      fingerprint: databaseTarget.fingerprint,
      expectedSupabaseProjectRef,
      matchesExpected:
        expectedSupabaseProjectRef && databaseUrl
          ? databaseTarget.supabaseProjectRef === expectedSupabaseProjectRef
          : undefined,
      pool: poolConfig
        ? {
            max: poolConfig.max,
            connectionTimeoutMs: poolConfig.connectionTimeoutMillis,
            idleTimeoutMs: poolConfig.idleTimeoutMillis
          }
        : undefined
    }
  };
}

export function getDatabaseUrl(env: NodeJS.ProcessEnv = process.env) {
  const value = env.DATABASE_URL?.trim();
  if (!value || value.length === 0) {
    return undefined;
  }

  assertExpectedDatabaseTarget(value, env);
  return value;
}

const truthyInMemoryValues = new Set(["1", "true", "yes", "on"]);

export function allowsInMemoryPersistence(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV === "test") {
    return true;
  }

  const value = env.ALLOW_IN_MEMORY_PERSISTENCE?.trim().toLowerCase();
  return value ? truthyInMemoryValues.has(value) : false;
}

export type PersistenceStartupReason = "missing_database_url" | "postgres_initialization_failed";

export function buildPersistenceStartupError(input: {
  service: string;
  reason: PersistenceStartupReason;
}) {
  const message =
    input.reason === "missing_database_url"
      ? `${input.service} persistence requires DATABASE_URL unless ALLOW_IN_MEMORY_PERSISTENCE=true`
      : `${input.service} persistence failed to initialize postgres and ALLOW_IN_MEMORY_PERSISTENCE is not enabled`;
  const error = new Error(message) as Error & { code?: string };
  error.name = "PersistenceStartupError";
  error.code =
    input.reason === "missing_database_url"
      ? "PERSISTENCE_NOT_CONFIGURED"
      : "PERSISTENCE_INITIALIZATION_FAILED";
  return error;
}
