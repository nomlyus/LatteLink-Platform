import { sql, type Kysely } from "kysely";

type MigrationDb = Kysely<Record<string, never>>;

export async function up(db: MigrationDb): Promise<void> {
  await sql`
    UPDATE catalog_app_configs
    SET app_config_json = jsonb_set(app_config_json, '{header,background}', '"#F7F4ED"')
    WHERE app_config_json -> 'header' ->> 'background' = '#F0ECE4'
  `.execute(db);
}

export async function down(db: MigrationDb): Promise<void> {
  await sql`
    UPDATE catalog_app_configs
    SET app_config_json = jsonb_set(app_config_json, '{header,background}', '"#F0ECE4"')
    WHERE app_config_json -> 'header' ->> 'background' = '#F7F4ED'
  `.execute(db);
}
