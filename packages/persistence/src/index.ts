import { Kysely, PostgresDialect, sql } from "kysely";
import type { Generated } from "kysely";
import { Pool } from "pg";

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
  provider: "CLOVER";
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

export interface PaymentsCloverConnectionTable {
  merchant_id: string;
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
  user_id: string;
  available_points: number;
  pending_points: number;
  lifetime_earned: number;
  updated_at: Generated<string>;
}

export interface LoyaltyLedgerEntryTable {
  id: string;
  user_id: string;
  type: "EARN" | "REDEEM" | "REFUND" | "ADJUSTMENT";
  points: number;
  order_id: string | null;
  created_at: string;
}

export interface LoyaltyIdempotencyKeyTable {
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

export interface IdentityUserTable {
  user_id: string;
  apple_sub: string | null;
  email: string | null;
  name: string | null;
  display_name: string | null;
  phone_number: string | null;
  birthday: string | null;
  profile_completed_at: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface IdentityMagicLinkTable {
  token: string;
  email: string;
  user_id: string | null;
  expires_at: string;
  consumed_at: string | null;
  created_at: Generated<string>;
}

export interface IdentitySessionTable {
  access_token: string;
  refresh_token: string;
  user_id: string;
  access_expires_at: string | null;
  expires_at: string;
  revoked_at: string | null;
  auth_method: "apple" | "passkey-register" | "passkey-auth" | "magic-link" | "refresh";
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
  role: "owner" | "manager" | "staff";
  location_id: string;
  active: boolean;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface OperatorMagicLinkTable {
  token: string;
  email: string;
  operator_user_id: string | null;
  expires_at: string;
  consumed_at: string | null;
  created_at: Generated<string>;
}

export interface OperatorSessionTable {
  access_token: string;
  refresh_token: string;
  operator_user_id: string;
  access_expires_at: string | null;
  expires_at: string;
  revoked_at: string | null;
  auth_method: "magic-link" | "password" | "google" | "refresh";
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

export interface PersistenceDatabase {
  payments_charges: PaymentsChargeTable;
  payments_refunds: PaymentsRefundTable;
  payments_webhook_deduplication: PaymentsWebhookDeduplicationTable;
  payments_clover_connections: PaymentsCloverConnectionTable;
  loyalty_balances: LoyaltyBalanceTable;
  loyalty_ledger_entries: LoyaltyLedgerEntryTable;
  loyalty_idempotency_keys: LoyaltyIdempotencyKeyTable;
  orders_quotes: OrdersQuoteTable;
  orders: OrdersTable;
  orders_create_idempotency: OrdersCreateIdempotencyTable;
  orders_payment_idempotency: OrdersPaymentIdempotencyTable;
  identity_users: IdentityUserTable;
  identity_magic_links: IdentityMagicLinkTable;
  identity_sessions: IdentitySessionTable;
  identity_passkey_challenges: IdentityPasskeyChallengeTable;
  identity_passkey_credentials: IdentityPasskeyCredentialTable;
  operator_users: OperatorUserTable;
  operator_magic_links: OperatorMagicLinkTable;
  operator_sessions: OperatorSessionTable;
  notifications_push_tokens: NotificationsPushTokenTable;
  notifications_order_state_dispatches: NotificationsOrderStateDispatchTable;
  notifications_outbox: NotificationsOutboxTable;
  catalog_menu_categories: CatalogMenuCategoryTable;
  catalog_menu_items: CatalogMenuItemTable;
  catalog_home_news_cards: CatalogHomeNewsCardTable;
  catalog_store_configs: CatalogStoreConfigTable;
  catalog_app_configs: CatalogAppConfigTable;
}

export type PersistenceDb = Kysely<PersistenceDatabase>;

export function createPostgresDb(connectionString: string): PersistenceDb {
  return new Kysely<PersistenceDatabase>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString })
    })
  });
}

export function getDatabaseUrl(env: NodeJS.ProcessEnv = process.env) {
  const value = env.DATABASE_URL?.trim();
  return value && value.length > 0 ? value : undefined;
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

/** @deprecated Use runMigrations instead. Will be removed in a future release. */
// Legacy bootstrap remains for backward-compatible direct callers until every startup path and external
// script has fully moved to the migration runner.
export async function ensurePersistenceTables(db: PersistenceDb) {
  await db.transaction().execute(async (trx) => {
  await sql`SELECT pg_advisory_xact_lock(947531, 1)`.execute(trx);

  await sql`
    CREATE TABLE IF NOT EXISTS payments_charges (
      payment_id UUID PRIMARY KEY,
      provider_payment_id TEXT,
      order_id UUID NOT NULL,
      idempotency_key TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      approved BOOLEAN NOT NULL,
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL,
      occurred_at TIMESTAMPTZ NOT NULL,
      decline_code TEXT,
      message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (order_id, idempotency_key)
    )
  `.execute(trx);

  await sql`
    ALTER TABLE payments_charges
    ADD COLUMN IF NOT EXISTS provider_payment_id TEXT
  `.execute(trx);

  await sql`
    CREATE INDEX IF NOT EXISTS payments_charges_order_created_at_idx
    ON payments_charges (order_id, created_at DESC)
  `.execute(trx);

  await sql`
    CREATE TABLE IF NOT EXISTS payments_refunds (
      refund_id UUID PRIMARY KEY,
      order_id UUID NOT NULL,
      payment_id UUID NOT NULL,
      idempotency_key TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL,
      occurred_at TIMESTAMPTZ NOT NULL,
      message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (order_id, idempotency_key)
    )
  `.execute(trx);

  await sql`
    CREATE INDEX IF NOT EXISTS payments_refunds_order_created_at_idx
    ON payments_refunds (order_id, created_at DESC)
  `.execute(trx);

  await sql`
    CREATE TABLE IF NOT EXISTS payments_webhook_deduplication (
      event_key TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      order_id UUID NOT NULL,
      payment_id UUID NOT NULL,
      status TEXT NOT NULL,
      order_applied BOOLEAN NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(trx);

  await sql`
    CREATE TABLE IF NOT EXISTS loyalty_balances (
      user_id UUID PRIMARY KEY,
      available_points INTEGER NOT NULL,
      pending_points INTEGER NOT NULL,
      lifetime_earned INTEGER NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(trx);

  await sql`
    CREATE TABLE IF NOT EXISTS loyalty_ledger_entries (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL,
      type TEXT NOT NULL,
      points INTEGER NOT NULL,
      order_id UUID,
      created_at TIMESTAMPTZ NOT NULL
    )
  `.execute(trx);

  await sql`
    CREATE INDEX IF NOT EXISTS loyalty_ledger_entries_user_created_at_idx
    ON loyalty_ledger_entries (user_id, created_at DESC)
  `.execute(trx);

  await sql`
    CREATE TABLE IF NOT EXISTS loyalty_idempotency_keys (
      user_id UUID NOT NULL,
      idempotency_key TEXT NOT NULL,
      request_fingerprint TEXT NOT NULL,
      response_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, idempotency_key)
    )
  `.execute(trx);

  await sql`
    CREATE TABLE IF NOT EXISTS orders_quotes (
      quote_id UUID PRIMARY KEY,
      quote_hash TEXT NOT NULL,
      quote_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(trx);

  await sql`
    CREATE TABLE IF NOT EXISTS orders (
      order_id UUID PRIMARY KEY,
      user_id UUID NOT NULL,
      quote_id UUID NOT NULL REFERENCES orders_quotes (quote_id),
      order_json JSONB NOT NULL,
      payment_id UUID,
      successful_charge_json JSONB,
      successful_refund_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(trx);

  await sql`
    CREATE INDEX IF NOT EXISTS orders_created_at_idx
    ON orders (created_at DESC)
  `.execute(trx);

  await sql`
    CREATE TABLE IF NOT EXISTS orders_create_idempotency (
      quote_id UUID NOT NULL,
      quote_hash TEXT NOT NULL,
      order_id UUID NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (quote_id, quote_hash)
    )
  `.execute(trx);

  await sql`
    CREATE TABLE IF NOT EXISTS orders_payment_idempotency (
      order_id UUID NOT NULL,
      idempotency_key TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (order_id, idempotency_key)
    )
  `.execute(trx);

  await sql`
    CREATE TABLE IF NOT EXISTS identity_users (
      user_id UUID PRIMARY KEY,
      apple_sub TEXT UNIQUE,
      email TEXT,
      name TEXT,
      display_name TEXT,
      phone_number TEXT,
      birthday DATE,
      profile_completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(trx);

  await sql`
    CREATE INDEX IF NOT EXISTS identity_users_apple_sub_idx
    ON identity_users (apple_sub)
    WHERE apple_sub IS NOT NULL
  `.execute(trx);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS identity_users_email_unique_idx
    ON identity_users (email)
    WHERE email IS NOT NULL
  `.execute(trx);

  await sql`
    CREATE TABLE IF NOT EXISTS identity_magic_links (
      token TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      user_id UUID,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(trx);

  await sql`
    CREATE INDEX IF NOT EXISTS identity_magic_links_email_idx
    ON identity_magic_links (email, created_at DESC)
    WHERE consumed_at IS NULL
  `.execute(trx);

  await sql`
    CREATE TABLE IF NOT EXISTS identity_sessions (
      access_token TEXT PRIMARY KEY,
      refresh_token TEXT NOT NULL UNIQUE,
      user_id UUID NOT NULL,
      access_expires_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      auth_method TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(trx);

  await sql`
    ALTER TABLE identity_sessions
    ADD COLUMN IF NOT EXISTS access_expires_at TIMESTAMPTZ
  `.execute(trx);

  await sql`
    CREATE INDEX IF NOT EXISTS identity_sessions_user_idx
    ON identity_sessions (user_id, created_at DESC)
  `.execute(trx);

  await sql`
    CREATE TABLE IF NOT EXISTS identity_passkey_challenges (
      challenge TEXT PRIMARY KEY,
      flow TEXT NOT NULL,
      user_id UUID,
      rp_id TEXT NOT NULL,
      timeout_ms INTEGER NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(trx);

  await sql`
    CREATE INDEX IF NOT EXISTS identity_passkey_challenges_flow_idx
    ON identity_passkey_challenges (flow, created_at DESC)
  `.execute(trx);

  await sql`
    CREATE TABLE IF NOT EXISTS identity_passkey_credentials (
      credential_id TEXT PRIMARY KEY,
      user_id UUID NOT NULL,
      webauthn_user_id TEXT NOT NULL,
      public_key TEXT NOT NULL,
      counter INTEGER NOT NULL,
      transports_json JSONB NOT NULL,
      device_type TEXT NOT NULL,
      backed_up BOOLEAN NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(trx);

  await sql`
    CREATE INDEX IF NOT EXISTS identity_passkey_credentials_user_idx
    ON identity_passkey_credentials (user_id, created_at DESC)
  `.execute(trx);

  await sql`
    CREATE TABLE IF NOT EXISTS notifications_push_tokens (
      user_id UUID NOT NULL,
      device_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      expo_push_token TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, device_id)
    )
  `.execute(trx);

  await sql`
    CREATE TABLE IF NOT EXISTS notifications_order_state_dispatches (
      dispatch_key TEXT PRIMARY KEY,
      user_id UUID NOT NULL,
      order_id UUID NOT NULL,
      status TEXT NOT NULL,
      occurred_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(trx);

  await sql`
    CREATE TABLE IF NOT EXISTS notifications_outbox (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL,
      device_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      expo_push_token TEXT NOT NULL,
      payload_json JSONB NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      dispatched_at TIMESTAMPTZ,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(trx);

  await sql`
    CREATE INDEX IF NOT EXISTS notifications_outbox_status_available_idx
    ON notifications_outbox (status, available_at, created_at)
  `.execute(trx);

  await sql`
    CREATE TABLE IF NOT EXISTS catalog_menu_categories (
      brand_id TEXT NOT NULL DEFAULT 'gazelle-default',
      location_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      title TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (location_id, category_id)
    )
  `.execute(trx);

  await sql`
    ALTER TABLE catalog_menu_categories
    ADD COLUMN IF NOT EXISTS brand_id TEXT NOT NULL DEFAULT 'gazelle-default'
  `.execute(trx);

  await sql`
    CREATE INDEX IF NOT EXISTS catalog_menu_categories_location_sort_idx
    ON catalog_menu_categories (location_id, sort_order)
  `.execute(trx);

  await sql`
    CREATE TABLE IF NOT EXISTS catalog_menu_items (
      brand_id TEXT NOT NULL DEFAULT 'gazelle-default',
      location_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      image_url TEXT,
      price_cents INTEGER NOT NULL,
      badge_codes_json JSONB NOT NULL,
      customization_groups_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      visible BOOLEAN NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (location_id, item_id),
      FOREIGN KEY (location_id, category_id) REFERENCES catalog_menu_categories (location_id, category_id) ON DELETE CASCADE
    )
  `.execute(trx);

  await sql`
    ALTER TABLE catalog_menu_items
    ADD COLUMN IF NOT EXISTS brand_id TEXT NOT NULL DEFAULT 'gazelle-default'
  `.execute(trx);

  await sql`
    ALTER TABLE catalog_menu_items
    ADD COLUMN IF NOT EXISTS image_url TEXT
  `.execute(trx);

  await sql`
    ALTER TABLE catalog_menu_items
    ADD COLUMN IF NOT EXISTS customization_groups_json JSONB NOT NULL DEFAULT '[]'::jsonb
  `.execute(trx);

  await sql`
    CREATE INDEX IF NOT EXISTS catalog_menu_items_location_category_sort_idx
    ON catalog_menu_items (location_id, category_id, sort_order)
  `.execute(trx);

  await sql`
    CREATE TABLE IF NOT EXISTS catalog_home_news_cards (
      brand_id TEXT NOT NULL DEFAULT 'gazelle-default',
      location_id TEXT NOT NULL,
      card_id TEXT NOT NULL,
      label TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      note TEXT,
      visible BOOLEAN NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (location_id, card_id)
    )
  `.execute(trx);

  await sql`
    ALTER TABLE catalog_home_news_cards
    ADD COLUMN IF NOT EXISTS brand_id TEXT NOT NULL DEFAULT 'gazelle-default'
  `.execute(trx);

  await sql`
    ALTER TABLE catalog_home_news_cards
    ADD COLUMN IF NOT EXISTS note TEXT
  `.execute(trx);

  await sql`
    CREATE INDEX IF NOT EXISTS catalog_home_news_cards_location_sort_idx
    ON catalog_home_news_cards (location_id, sort_order)
  `.execute(trx);

  await sql`
    CREATE TABLE IF NOT EXISTS catalog_store_configs (
      brand_id TEXT NOT NULL DEFAULT 'gazelle-default',
      location_id TEXT PRIMARY KEY,
      store_name TEXT NOT NULL DEFAULT 'Gazelle Coffee Flagship',
      hours_text TEXT NOT NULL DEFAULT 'Daily · 7:00 AM - 6:00 PM',
      prep_eta_minutes INTEGER NOT NULL,
      tax_rate_basis_points INTEGER NOT NULL,
      pickup_instructions TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(trx);

  await sql`
    ALTER TABLE catalog_store_configs
    ADD COLUMN IF NOT EXISTS brand_id TEXT NOT NULL DEFAULT 'gazelle-default'
  `.execute(trx);

  await sql`
    ALTER TABLE catalog_store_configs
    ADD COLUMN IF NOT EXISTS store_name TEXT NOT NULL DEFAULT 'Gazelle Coffee Flagship'
  `.execute(trx);

  await sql`
    ALTER TABLE catalog_store_configs
    ADD COLUMN IF NOT EXISTS hours_text TEXT NOT NULL DEFAULT 'Daily · 7:00 AM - 6:00 PM'
  `.execute(trx);

  await sql`
    CREATE TABLE IF NOT EXISTS catalog_app_configs (
      brand_id TEXT NOT NULL,
      location_id TEXT NOT NULL,
      app_config_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (brand_id, location_id)
    )
  `.execute(trx);

  await sql`
    CREATE INDEX IF NOT EXISTS catalog_app_configs_location_idx
    ON catalog_app_configs (location_id, brand_id)
  `.execute(trx);
  });
}
