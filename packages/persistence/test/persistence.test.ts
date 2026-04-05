import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import {
  allowsInMemoryPersistence,
  buildPersistenceStartupError,
  getDatabaseUrl
} from "../src/index.js";
import * as migration0001 from "../src/migrations/0001_initial_schema.js";
import * as migration0002 from "../src/migrations/0002_add_brand_id_columns.js";
import * as migration0003 from "../src/migrations/0003_add_access_expires_at.js";
import * as migration0004 from "../src/migrations/0004_add_catalog_image_url.js";
import * as migration0005 from "../src/migrations/0005_add_customization_groups.js";
import * as migration0006 from "../src/migrations/0006_add_store_name_hours.js";
import * as migration0007 from "../src/migrations/0007_identity_users.js";
import * as migration0008 from "../src/migrations/0008_magic_links.js";
import * as migration0009 from "../src/migrations/0009_webhook_deduplication.js";
import * as migration0010 from "../src/migrations/0010_payments_clover_oauth.js";
import * as migration0011 from "../src/migrations/0011_operator_access.js";
import * as migration0012 from "../src/migrations/0012_operator_passwords.js";
import * as migration0013 from "../src/migrations/0013_operator_google_sso.js";
import * as migration0014 from "../src/migrations/0014_identity_customer_profile_fields.js";
import * as migration0015 from "../src/migrations/0015_identity_customer_birthday.js";
import * as migration0016 from "../src/migrations/0016_identity_customer_profile_completion.js";
import { resolveMigrationFolderPath } from "../src/migrate.js";

describe("persistence", () => {
  it("returns undefined when DATABASE_URL is missing", () => {
    expect(getDatabaseUrl({})).toBeUndefined();
  });

  it("returns trimmed DATABASE_URL", () => {
    expect(getDatabaseUrl({ DATABASE_URL: "  postgres://localhost:5432/gazelle  " })).toBe(
      "postgres://localhost:5432/gazelle"
    );
  });

  it("allows in-memory persistence automatically in test mode", () => {
    expect(allowsInMemoryPersistence({ NODE_ENV: "test" })).toBe(true);
  });

  it("allows in-memory persistence only when explicitly enabled outside test mode", () => {
    expect(allowsInMemoryPersistence({ NODE_ENV: "production" })).toBe(false);
    expect(allowsInMemoryPersistence({ NODE_ENV: "production", ALLOW_IN_MEMORY_PERSISTENCE: "true" })).toBe(true);
  });

  it("builds explicit persistence startup errors", () => {
    const error = buildPersistenceStartupError({
      service: "orders",
      reason: "missing_database_url"
    });

    expect(error.name).toBe("PersistenceStartupError");
    expect(error.message).toContain("DATABASE_URL");
    expect((error as Error & { code?: string }).code).toBe("PERSISTENCE_NOT_CONFIGURED");
  });

  it("keeps the numbered migration set importable from the resolved folder", () => {
    const migrations = {
      "0001_initial_schema": migration0001,
      "0002_add_brand_id_columns": migration0002,
      "0003_add_access_expires_at": migration0003,
      "0004_add_catalog_image_url": migration0004,
      "0005_add_customization_groups": migration0005,
      "0006_add_store_name_hours": migration0006,
      "0007_identity_users": migration0007,
      "0008_magic_links": migration0008,
      "0009_webhook_deduplication": migration0009,
      "0010_payments_clover_oauth": migration0010,
      "0011_operator_access": migration0011,
      "0012_operator_passwords": migration0012,
      "0013_operator_google_sso": migration0013,
      "0014_identity_customer_profile_fields": migration0014,
      "0015_identity_customer_birthday": migration0015,
      "0016_identity_customer_profile_completion": migration0016
    };

    expect(basename(resolveMigrationFolderPath())).toBe("migrations");
    expect(Object.keys(migrations)).toEqual([
      "0001_initial_schema",
      "0002_add_brand_id_columns",
      "0003_add_access_expires_at",
      "0004_add_catalog_image_url",
      "0005_add_customization_groups",
      "0006_add_store_name_hours",
      "0007_identity_users",
      "0008_magic_links",
      "0009_webhook_deduplication",
      "0010_payments_clover_oauth",
      "0011_operator_access",
      "0012_operator_passwords",
      "0013_operator_google_sso",
      "0014_identity_customer_profile_fields",
      "0015_identity_customer_birthday",
      "0016_identity_customer_profile_completion"
    ]);

    for (const migration of Object.values(migrations)) {
      expect(typeof migration.up).toBe("function");
      expect(typeof migration.down).toBe("function");
    }
  });
});
