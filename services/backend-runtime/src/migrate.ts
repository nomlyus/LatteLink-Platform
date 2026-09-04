import {
  assertExpectedDatabaseTarget,
  createPostgresDb,
  getDatabaseUrl,
  runMigrations,
} from "@lattelink/persistence";

const databaseUrl = getDatabaseUrl();
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run backend migrations");
}

assertExpectedDatabaseTarget(databaseUrl);
const db = createPostgresDb(databaseUrl);

try {
  await runMigrations(db);
  console.info("[backend-runtime] database migrations completed");
} finally {
  await db.destroy();
}
