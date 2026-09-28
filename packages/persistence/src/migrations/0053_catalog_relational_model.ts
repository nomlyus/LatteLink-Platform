import { sql, type Kysely } from "kysely";

type MigrationDb = Kysely<Record<string, never>>;

/**
 * Establishes the relational catalog model without removing the legacy JSON
 * column. The old column remains a rollback/read-compatibility aid until the
 * relational path has been proven in production.
 */
export async function up(db: MigrationDb): Promise<void> {
  await sql`
    ALTER TABLE catalog_menu_categories
      ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS visible BOOLEAN NOT NULL DEFAULT TRUE
  `.execute(db);

  await sql`
    ALTER TABLE catalog_menu_items
      ADD COLUMN IF NOT EXISTS available BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE
  `.execute(db);

  // Category deletion must only remove membership rows, never the item row.
  await sql`
    ALTER TABLE catalog_menu_items
      DROP CONSTRAINT IF EXISTS catalog_menu_items_location_id_category_id_fkey
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS catalog_menu_category_items (
      brand_id TEXT NOT NULL,
      location_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (location_id, category_id, item_id),
      FOREIGN KEY (location_id, category_id)
        REFERENCES catalog_menu_categories (location_id, category_id)
        ON DELETE CASCADE,
      FOREIGN KEY (location_id, item_id)
        REFERENCES catalog_menu_items (location_id, item_id)
        ON DELETE CASCADE
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS catalog_menu_category_items_category_sort_idx
      ON catalog_menu_category_items (location_id, category_id, sort_order, item_id)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS catalog_menu_category_items_item_idx
      ON catalog_menu_category_items (location_id, item_id)
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS catalog_modifier_groups (
      brand_id TEXT NOT NULL,
      location_id TEXT NOT NULL,
      modifier_group_id TEXT NOT NULL,
      label TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      selection_type TEXT NOT NULL CHECK (selection_type IN ('single', 'multiple')),
      required BOOLEAN NOT NULL DEFAULT FALSE,
      min_selections INTEGER NOT NULL DEFAULT 0 CHECK (min_selections >= 0),
      max_selections INTEGER NOT NULL DEFAULT 1 CHECK (max_selections > 0),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (location_id, modifier_group_id),
      CHECK (min_selections <= max_selections),
      CHECK (
        (selection_type = 'single' AND max_selections = 1) OR
        (selection_type = 'multiple' AND max_selections >= min_selections)
      )
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS catalog_modifier_groups_location_sort_idx
      ON catalog_modifier_groups (location_id, sort_order, modifier_group_id)
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS catalog_modifier_options (
      brand_id TEXT NOT NULL,
      location_id TEXT NOT NULL,
      modifier_group_id TEXT NOT NULL,
      option_id TEXT NOT NULL,
      label TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price_delta_cents INTEGER NOT NULL,
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      available BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (location_id, modifier_group_id, option_id),
      FOREIGN KEY (location_id, modifier_group_id)
        REFERENCES catalog_modifier_groups (location_id, modifier_group_id)
        ON DELETE CASCADE
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS catalog_modifier_options_group_sort_idx
      ON catalog_modifier_options (location_id, modifier_group_id, sort_order, option_id)
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS catalog_item_modifier_groups (
      brand_id TEXT NOT NULL,
      location_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      modifier_group_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      required_override BOOLEAN,
      min_selections_override INTEGER,
      max_selections_override INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (location_id, item_id, modifier_group_id),
      FOREIGN KEY (location_id, item_id)
        REFERENCES catalog_menu_items (location_id, item_id)
        ON DELETE CASCADE,
      FOREIGN KEY (location_id, modifier_group_id)
        REFERENCES catalog_modifier_groups (location_id, modifier_group_id)
        ON DELETE CASCADE,
      CHECK (min_selections_override IS NULL OR min_selections_override >= 0),
      CHECK (max_selections_override IS NULL OR max_selections_override > 0),
      CHECK (
        min_selections_override IS NULL OR
        max_selections_override IS NULL OR
        min_selections_override <= max_selections_override
      )
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS catalog_item_modifier_groups_item_sort_idx
      ON catalog_item_modifier_groups (location_id, item_id, sort_order, modifier_group_id)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS catalog_item_modifier_groups_group_idx
      ON catalog_item_modifier_groups (location_id, modifier_group_id, item_id)
  `.execute(db);

  // Preserve the current category placement and ordering as the initial
  // association rows. The legacy columns are intentionally not removed yet.
  await sql`
    INSERT INTO catalog_menu_category_items (
      brand_id, location_id, category_id, item_id, sort_order
    )
    SELECT menu_items.brand_id, menu_items.location_id, menu_items.category_id,
      menu_items.item_id, menu_items.sort_order
    FROM catalog_menu_items AS menu_items
    ON CONFLICT (location_id, category_id, item_id) DO NOTHING
  `.execute(db);

  // Legacy item-embedded groups do not provide safe evidence that similarly
  // labelled groups are reusable. Reuse a stable legacy group id only when
  // every occurrence has the same JSON definition; conflicting definitions
  // remain item-scoped so migration cannot merge different modifiers.
  await sql`
    WITH legacy_groups AS (
      SELECT menu_items.brand_id,
        menu_items.location_id,
        menu_items.item_id,
        groups.group_json,
        groups.group_json->>'id' AS group_id
      FROM catalog_menu_items AS menu_items
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(menu_items.customization_groups_json) = 'array'
          THEN menu_items.customization_groups_json ELSE '[]'::jsonb END
      ) AS groups(group_json)
      WHERE groups.group_json->>'id' IS NOT NULL
    ),
    group_counts AS (
      SELECT location_id, group_id, COUNT(DISTINCT group_json::text) AS definition_count
      FROM legacy_groups
      GROUP BY location_id, group_id
    )
    INSERT INTO catalog_modifier_groups (
      brand_id, location_id, modifier_group_id, label, description,
      selection_type, required, min_selections, max_selections, sort_order
    )
    SELECT legacy_groups.brand_id,
      legacy_groups.location_id,
      CASE WHEN group_counts.definition_count = 1 THEN legacy_groups.group_id
        ELSE 'legacy_' || md5(legacy_groups.location_id || ':' || legacy_groups.item_id || ':' || legacy_groups.group_id) END,
      legacy_groups.group_json->>'label',
      COALESCE(legacy_groups.group_json->>'description', ''),
      CASE WHEN legacy_groups.group_json->>'selectionType' IN ('single', 'boolean') THEN 'single' ELSE 'multiple' END,
      COALESCE((legacy_groups.group_json->>'required')::boolean, FALSE),
      COALESCE((legacy_groups.group_json->>'minSelections')::integer,
        CASE WHEN COALESCE((legacy_groups.group_json->>'required')::boolean, FALSE) THEN 1 ELSE 0 END),
      COALESCE((legacy_groups.group_json->>'maxSelections')::integer,
        CASE
          WHEN legacy_groups.group_json->>'selectionType' IN ('single', 'boolean') THEN 1
          ELSE GREATEST(1, jsonb_array_length(
            CASE WHEN jsonb_typeof(legacy_groups.group_json->'options') = 'array'
              THEN legacy_groups.group_json->'options' ELSE '[]'::jsonb END
          ))
        END),
      COALESCE((legacy_groups.group_json->>'sortOrder')::integer, 0)
    FROM legacy_groups
    JOIN group_counts USING (location_id, group_id)
    ON CONFLICT (location_id, modifier_group_id) DO NOTHING
  `.execute(db);

  await sql`
    WITH legacy_groups AS (
      SELECT menu_items.brand_id,
        menu_items.location_id,
        menu_items.item_id,
        groups.group_json,
        groups.group_json->>'id' AS group_id
      FROM catalog_menu_items AS menu_items
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(menu_items.customization_groups_json) = 'array'
          THEN menu_items.customization_groups_json ELSE '[]'::jsonb END
      ) AS groups(group_json)
      WHERE groups.group_json->>'id' IS NOT NULL
    ),
    group_counts AS (
      SELECT location_id, group_id, COUNT(DISTINCT group_json::text) AS definition_count
      FROM legacy_groups
      GROUP BY location_id, group_id
    )
    INSERT INTO catalog_modifier_options (
      brand_id, location_id, modifier_group_id, option_id, label, description,
      price_delta_cents, is_default, available, sort_order
    )
    SELECT legacy_groups.brand_id,
      legacy_groups.location_id,
      CASE WHEN group_counts.definition_count = 1 THEN legacy_groups.group_id
        ELSE 'legacy_' || md5(legacy_groups.location_id || ':' || legacy_groups.item_id || ':' || legacy_groups.group_id) END,
      options.option_json->>'id',
      options.option_json->>'label',
      COALESCE(options.option_json->>'description', ''),
      COALESCE((options.option_json->>'priceDeltaCents')::integer, 0),
      COALESCE((options.option_json->>'default')::boolean, FALSE),
      COALESCE((options.option_json->>'available')::boolean, TRUE),
      COALESCE((options.option_json->>'sortOrder')::integer, 0)
    FROM legacy_groups
    JOIN group_counts USING (location_id, group_id)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(legacy_groups.group_json->'options') = 'array'
        THEN legacy_groups.group_json->'options' ELSE '[]'::jsonb END
    ) AS options(option_json)
    WHERE legacy_groups.group_id IS NOT NULL
      AND options.option_json->>'id' IS NOT NULL
    ON CONFLICT (location_id, modifier_group_id, option_id) DO NOTHING
  `.execute(db);

  await sql`
    WITH legacy_groups AS (
      SELECT menu_items.brand_id,
        menu_items.location_id,
        menu_items.item_id,
        groups.group_json,
        groups.group_json->>'id' AS group_id
      FROM catalog_menu_items AS menu_items
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(menu_items.customization_groups_json) = 'array'
          THEN menu_items.customization_groups_json ELSE '[]'::jsonb END
      ) AS groups(group_json)
      WHERE groups.group_json->>'id' IS NOT NULL
    ),
    group_counts AS (
      SELECT location_id, group_id, COUNT(DISTINCT group_json::text) AS definition_count
      FROM legacy_groups
      GROUP BY location_id, group_id
    )
    INSERT INTO catalog_item_modifier_groups (brand_id, location_id, item_id, modifier_group_id, sort_order)
    SELECT legacy_groups.brand_id,
      legacy_groups.location_id,
      legacy_groups.item_id,
      CASE WHEN group_counts.definition_count = 1 THEN legacy_groups.group_id
        ELSE 'legacy_' || md5(legacy_groups.location_id || ':' || legacy_groups.item_id || ':' || legacy_groups.group_id) END,
      COALESCE((legacy_groups.group_json->>'sortOrder')::integer, 0)
    FROM legacy_groups
    JOIN group_counts USING (location_id, group_id)
    ON CONFLICT (location_id, item_id, modifier_group_id) DO NOTHING
  `.execute(db);
}

export async function down(db: MigrationDb): Promise<void> {
  await sql`DROP TABLE IF EXISTS catalog_item_modifier_groups`.execute(db);
  await sql`DROP TABLE IF EXISTS catalog_modifier_options`.execute(db);
  await sql`DROP TABLE IF EXISTS catalog_modifier_groups`.execute(db);
  await sql`DROP TABLE IF EXISTS catalog_menu_category_items`.execute(db);

  await sql`
    ALTER TABLE catalog_menu_items
      ADD CONSTRAINT catalog_menu_items_location_id_category_id_fkey
      FOREIGN KEY (location_id, category_id)
      REFERENCES catalog_menu_categories (location_id, category_id)
      ON DELETE CASCADE
  `.execute(db);

  await sql`
    ALTER TABLE catalog_menu_categories
      DROP COLUMN IF EXISTS description,
      DROP COLUMN IF EXISTS visible
  `.execute(db);

  await sql`
    ALTER TABLE catalog_menu_items
      DROP COLUMN IF EXISTS available,
      DROP COLUMN IF EXISTS featured
  `.execute(db);
}
