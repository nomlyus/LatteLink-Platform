import { sql, type Kysely } from "kysely";

type MigrationDb = Kysely<Record<string, never>>;

/**
 * Keeps modifier metadata accepted by the shared catalog contract when the
 * relational model becomes authoritative. The legacy JSON is used only as a
 * deterministic backfill source; subsequent writes persist the values in
 * these columns directly.
 */
export async function up(db: MigrationDb): Promise<void> {
  await sql`
    ALTER TABLE catalog_modifier_groups
      ADD COLUMN IF NOT EXISTS source_group_id TEXT,
      ADD COLUMN IF NOT EXISTS display_style TEXT
  `.execute(db);

  await sql`
    ALTER TABLE catalog_modifier_options
      ADD COLUMN IF NOT EXISTS display_style TEXT
  `.execute(db);

  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'catalog_modifier_groups_display_style_check'
      ) THEN
        ALTER TABLE catalog_modifier_groups
          ADD CONSTRAINT catalog_modifier_groups_display_style_check
          CHECK (display_style IS NULL OR display_style IN ('chips', 'list', 'toggle'));
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'catalog_modifier_options_display_style_check'
      ) THEN
        ALTER TABLE catalog_modifier_options
          ADD CONSTRAINT catalog_modifier_options_display_style_check
          CHECK (display_style IS NULL OR display_style IN ('default', 'emphasis'));
      END IF;
    END $$
  `.execute(db);

  // Migration 0053 intentionally retained the legacy JSON. Recompute its
  // deterministic group identity here so metadata is backfilled onto exactly
  // the relational row that 0053 created, including conflicting definitions.
  await sql`
    WITH legacy_groups AS (
      SELECT menu_items.location_id,
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
    ),
    resolved_groups AS (
      SELECT legacy_groups.*,
        CASE WHEN group_counts.definition_count = 1 THEN legacy_groups.group_id
          ELSE 'legacy_' || md5(legacy_groups.location_id || ':' || legacy_groups.item_id || ':' || legacy_groups.group_id) END AS modifier_group_id
      FROM legacy_groups
      JOIN group_counts USING (location_id, group_id)
    )
    UPDATE catalog_modifier_groups AS target
    SET source_group_id = resolved_groups.group_json->>'sourceGroupId',
        display_style = CASE
          WHEN resolved_groups.group_json->>'displayStyle' IN ('chips', 'list', 'toggle')
            THEN resolved_groups.group_json->>'displayStyle'
          ELSE NULL
        END
    FROM resolved_groups
    WHERE target.location_id = resolved_groups.location_id
      AND target.modifier_group_id = resolved_groups.modifier_group_id
  `.execute(db);

  await sql`
    WITH legacy_groups AS (
      SELECT menu_items.location_id,
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
    ),
    resolved_groups AS (
      SELECT legacy_groups.*,
        CASE WHEN group_counts.definition_count = 1 THEN legacy_groups.group_id
          ELSE 'legacy_' || md5(legacy_groups.location_id || ':' || legacy_groups.item_id || ':' || legacy_groups.group_id) END AS modifier_group_id
      FROM legacy_groups
      JOIN group_counts USING (location_id, group_id)
    )
    UPDATE catalog_modifier_options AS target
    SET display_style = CASE
      WHEN option_rows.option_json->>'displayStyle' IN ('default', 'emphasis')
        THEN option_rows.option_json->>'displayStyle'
      ELSE NULL
    END
    FROM resolved_groups
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(resolved_groups.group_json->'options') = 'array'
        THEN resolved_groups.group_json->'options' ELSE '[]'::jsonb END
    ) AS option_rows(option_json)
    WHERE target.location_id = resolved_groups.location_id
      AND target.modifier_group_id = resolved_groups.modifier_group_id
      AND target.option_id = option_rows.option_json->>'id'
  `.execute(db);
}

export async function down(db: MigrationDb): Promise<void> {
  await sql`ALTER TABLE catalog_modifier_groups DROP CONSTRAINT IF EXISTS catalog_modifier_groups_display_style_check`.execute(db);
  await sql`ALTER TABLE catalog_modifier_options DROP CONSTRAINT IF EXISTS catalog_modifier_options_display_style_check`.execute(db);
  await sql`ALTER TABLE catalog_modifier_groups DROP COLUMN IF EXISTS source_group_id, DROP COLUMN IF EXISTS display_style`.execute(db);
  await sql`ALTER TABLE catalog_modifier_options DROP COLUMN IF EXISTS display_style`.execute(db);
}
