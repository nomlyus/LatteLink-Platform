import { sql, type PersistenceDb, type PersistenceDatabase } from "@lattelink/persistence";

// PostgreSQL row JSON contains selected values, not Kysely's generated-column wrappers.
type SelectedRow<T> = { [K in keyof T]: T[K] extends { __select__: infer Value } ? Value : T[K] };
type Row<Table extends keyof PersistenceDatabase> = SelectedRow<PersistenceDatabase[Table]>;

export type PublicLocationSnapshot = {
  client: Row<"catalog_clients">;
  location: Row<"catalog_client_locations">;
  progress: Row<"catalog_onboarding_progress">;
  store: Row<"catalog_store_configs">;
  app: Row<"catalog_app_configs">;
  payment: Row<"catalog_payment_profiles"> | null;
  identity: Row<"catalog_app_identity_profiles"> | null;
  release: Row<"catalog_mobile_release_profiles"> | null;
  has_visible_menu_items: boolean;
};

function normalizeRowTimestamps<T extends object>(row: T): T {
  // to_jsonb(timestamptz) keeps PostgreSQL's +00:00/microsecond representation,
  // unlike ordinary pg rows, whose Date values our projections serialize to ISO.
  for (const [key, value] of Object.entries(row)) {
    if (key.endsWith("_at") && typeof value === "string") {
      Object.assign(row, { [key]: new Date(value).toISOString() });
    }
  }
  return row;
}

/** One fresh database snapshot per access decision; never cache launch authorization. */
export async function readPublicLocationSnapshot(db: PersistenceDb, brandId: string, locationId: string) {
  const result = await sql<PublicLocationSnapshot>`
    SELECT to_jsonb(c) AS client, to_jsonb(l) AS location,
      to_jsonb(p) AS progress, to_jsonb(s) AS store, to_jsonb(a) AS app,
      to_jsonb(pay) AS payment, to_jsonb(i) AS identity, to_jsonb(r) AS release,
      EXISTS (
        SELECT 1 FROM catalog_menu_category_items membership
        JOIN catalog_menu_categories category
          ON category.location_id = membership.location_id AND category.category_id = membership.category_id
        JOIN catalog_menu_items item
          ON item.location_id = membership.location_id AND item.item_id = membership.item_id
        WHERE membership.location_id = l.location_id AND category.visible AND item.visible
      ) AS has_visible_menu_items
    FROM catalog_client_locations l
    JOIN catalog_clients c ON c.tenant_id = l.tenant_id AND c.brand_id = l.brand_id
    JOIN catalog_onboarding_progress p ON p.location_id = l.location_id
    JOIN catalog_store_configs s ON s.location_id = l.location_id
    JOIN catalog_app_configs a ON a.location_id = l.location_id
    LEFT JOIN catalog_payment_profiles pay ON pay.location_id = l.location_id
    LEFT JOIN catalog_app_identity_profiles i ON i.location_id = l.location_id
    LEFT JOIN catalog_mobile_release_profiles r ON r.location_id = l.location_id
    WHERE c.brand_id = ${brandId} AND l.location_id = ${locationId}
  `.execute(db);
  const snapshot = result.rows[0];
  if (!snapshot) return undefined;
  normalizeRowTimestamps(snapshot.client);
  normalizeRowTimestamps(snapshot.location);
  normalizeRowTimestamps(snapshot.progress);
  if (snapshot.identity) normalizeRowTimestamps(snapshot.identity);
  if (snapshot.release) normalizeRowTimestamps(snapshot.release);
  return snapshot;
}
