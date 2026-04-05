import { sql, type Kysely } from "kysely";

type MigrationDb = Kysely<Record<string, never>>;

export async function up(db: MigrationDb): Promise<void> {
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
  `.execute(db);

  await sql`
    ALTER TABLE catalog_home_news_cards
    ADD COLUMN IF NOT EXISTS brand_id TEXT NOT NULL DEFAULT 'gazelle-default'
  `.execute(db);

  await sql`
    ALTER TABLE catalog_home_news_cards
    ADD COLUMN IF NOT EXISTS note TEXT
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS catalog_home_news_cards_location_sort_idx
    ON catalog_home_news_cards (location_id, sort_order)
  `.execute(db);
}

export async function down(db: MigrationDb): Promise<void> {
  await sql`DROP INDEX IF EXISTS catalog_home_news_cards_location_sort_idx`.execute(db);
  await sql`DROP TABLE IF EXISTS catalog_home_news_cards`.execute(db);
}
