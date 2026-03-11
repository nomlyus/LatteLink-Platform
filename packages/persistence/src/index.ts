import { Kysely, PostgresDialect, sql } from "kysely";
import type { Generated } from "kysely";
import { Pool } from "pg";

export interface PaymentsChargeTable {
  payment_id: string;
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

export interface IdentitySessionTable {
  access_token: string;
  refresh_token: string;
  user_id: string;
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

export interface PersistenceDatabase {
  payments_charges: PaymentsChargeTable;
  payments_refunds: PaymentsRefundTable;
  loyalty_balances: LoyaltyBalanceTable;
  loyalty_ledger_entries: LoyaltyLedgerEntryTable;
  loyalty_idempotency_keys: LoyaltyIdempotencyKeyTable;
  orders_quotes: OrdersQuoteTable;
  orders: OrdersTable;
  orders_create_idempotency: OrdersCreateIdempotencyTable;
  orders_payment_idempotency: OrdersPaymentIdempotencyTable;
  identity_sessions: IdentitySessionTable;
  identity_passkey_challenges: IdentityPasskeyChallengeTable;
  identity_passkey_credentials: IdentityPasskeyCredentialTable;
  notifications_push_tokens: NotificationsPushTokenTable;
  notifications_order_state_dispatches: NotificationsOrderStateDispatchTable;
  notifications_outbox: NotificationsOutboxTable;
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

export async function ensurePersistenceTables(db: PersistenceDb) {
  await sql`
    CREATE TABLE IF NOT EXISTS payments_charges (
      payment_id UUID PRIMARY KEY,
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
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS payments_charges_order_created_at_idx
    ON payments_charges (order_id, created_at DESC)
  `.execute(db);

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
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS payments_refunds_order_created_at_idx
    ON payments_refunds (order_id, created_at DESC)
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS loyalty_balances (
      user_id UUID PRIMARY KEY,
      available_points INTEGER NOT NULL,
      pending_points INTEGER NOT NULL,
      lifetime_earned INTEGER NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS loyalty_ledger_entries (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL,
      type TEXT NOT NULL,
      points INTEGER NOT NULL,
      order_id UUID,
      created_at TIMESTAMPTZ NOT NULL
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS loyalty_ledger_entries_user_created_at_idx
    ON loyalty_ledger_entries (user_id, created_at DESC)
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS loyalty_idempotency_keys (
      user_id UUID NOT NULL,
      idempotency_key TEXT NOT NULL,
      request_fingerprint TEXT NOT NULL,
      response_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, idempotency_key)
    )
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS orders_quotes (
      quote_id UUID PRIMARY KEY,
      quote_hash TEXT NOT NULL,
      quote_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

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
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS orders_created_at_idx
    ON orders (created_at DESC)
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS orders_create_idempotency (
      quote_id UUID NOT NULL,
      quote_hash TEXT NOT NULL,
      order_id UUID NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (quote_id, quote_hash)
    )
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS orders_payment_idempotency (
      order_id UUID NOT NULL,
      idempotency_key TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (order_id, idempotency_key)
    )
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS identity_sessions (
      access_token TEXT PRIMARY KEY,
      refresh_token TEXT NOT NULL UNIQUE,
      user_id UUID NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      auth_method TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS identity_sessions_user_idx
    ON identity_sessions (user_id, created_at DESC)
  `.execute(db);

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
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS identity_passkey_challenges_flow_idx
    ON identity_passkey_challenges (flow, created_at DESC)
  `.execute(db);

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
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS identity_passkey_credentials_user_idx
    ON identity_passkey_credentials (user_id, created_at DESC)
  `.execute(db);

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
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS notifications_order_state_dispatches (
      dispatch_key TEXT PRIMARY KEY,
      user_id UUID NOT NULL,
      order_id UUID NOT NULL,
      status TEXT NOT NULL,
      occurred_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

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
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS notifications_outbox_status_available_idx
    ON notifications_outbox (status, available_at, created_at)
  `.execute(db);
}
