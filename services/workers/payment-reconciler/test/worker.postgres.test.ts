import { createPostgresDb, sql } from "@lattelink/persistence";
import { expect, it } from "vitest";
import { listStalePendingPaymentIntents } from "../src/worker.js";

const databaseUrl = process.env.RECONCILER_TEST_DATABASE_URL;

it.skipIf(!databaseUrl)("selects stale orders and checkouts across UUID/text references", async () => {
  const db = createPostgresDb(databaseUrl!);
  try {
    // Session-local tables shadow public tables and disappear on commit; no merchant data is touched.
    await db.transaction().execute(async (tx) => {
      await sql`CREATE TEMP TABLE orders (order_id uuid PRIMARY KEY, order_json jsonb) ON COMMIT DROP`.execute(tx);
      await sql`CREATE TEMP TABLE orders_quotes (quote_id uuid PRIMARY KEY, quote_json jsonb) ON COMMIT DROP`.execute(tx);
      await sql`CREATE TEMP TABLE order_checkout_drafts (checkout_id uuid PRIMARY KEY, quote_id uuid, status text) ON COMMIT DROP`.execute(tx);
      await sql`CREATE TEMP TABLE payments_stripe_payment_intents (
        order_id text, location_id text, payment_intent_id text, stripe_account_id text,
        amount_cents integer, currency text, created_at timestamptz
      ) ON COMMIT DROP`.execute(tx);

      await sql`INSERT INTO pg_temp.orders VALUES
        ('11111111-1111-4111-8111-111111111111', '{"status":"PENDING_PAYMENT"}'),
        ('22222222-2222-4222-8222-222222222222', '{"status":"COMPLETED"}'),
        ('55555555-5555-4555-8555-555555555555', '{"status":"PENDING_PAYMENT"}')`.execute(tx);
      await sql`INSERT INTO pg_temp.orders_quotes VALUES
        ('66666666-6666-4666-8666-666666666666', '{"quoteId":"quote-fixture"}')`.execute(tx);
      await sql`INSERT INTO pg_temp.order_checkout_drafts VALUES
        ('33333333-3333-4333-8333-333333333333', '66666666-6666-4666-8666-666666666666', 'OPEN'),
        ('44444444-4444-4444-8444-444444444444', '66666666-6666-4666-8666-666666666666', 'EXPIRED')`.execute(tx);

      for (const [reference, intent, createdAt] of [
        ["11111111-1111-4111-8111-111111111111", "pi_order", "2026-01-01T10:00:00Z"],
        ["22222222-2222-4222-8222-222222222222", "pi_completed", "2026-01-01T10:00:00Z"],
        ["33333333-3333-4333-8333-333333333333", "pi_checkout", "2026-01-01T10:01:00Z"],
        ["44444444-4444-4444-8444-444444444444", "pi_expired", "2026-01-01T10:00:00Z"],
        ["55555555-5555-4555-8555-555555555555", "pi_fresh", "2026-01-01T12:00:00Z"],
        ["legacy-not-a-uuid", "pi_legacy", "2026-01-01T10:00:00Z"],
        ["77777777-7777-4777-8777-777777777777", "pi_orphan", "2026-01-01T10:00:00Z"]
      ]) {
        await sql`INSERT INTO pg_temp.payments_stripe_payment_intents VALUES
          (${reference}, 'test-location', ${intent}, 'acct_test', 500, 'USD', ${createdAt})`.execute(tx);
      }

      const candidates = await listStalePendingPaymentIntents(tx, "2026-01-01T11:00:00Z", 50);
      expect(candidates.map((candidate) => [candidate.referenceType, candidate.paymentIntentId])).toEqual([
        ["ORDER", "pi_order"],
        ["CHECKOUT", "pi_checkout"]
      ]);
      expect(candidates[0].orderJson).toEqual({ status: "PENDING_PAYMENT" });
      expect(candidates[1].orderJson).toEqual({ quoteId: "quote-fixture" });
      expect(await listStalePendingPaymentIntents(tx, "2026-01-01T11:00:00Z", 1)).toEqual([candidates[0]]);
    });
  } finally {
    await db.destroy();
  }
}, 30_000);
