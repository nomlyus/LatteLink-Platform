import {
  assertExpectedDatabaseTarget,
  createPostgresDb,
  getMigrationProvenance,
  getDatabaseUrl,
  runMigrations,
} from "@lattelink/persistence";
import { resolveDeploymentProvenance } from "./provenance.js";

const databaseUrl = getDatabaseUrl();
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run backend migrations");
}

assertExpectedDatabaseTarget(databaseUrl);
const db = createPostgresDb(databaseUrl);

try {
  await runMigrations(db);
  const migrations = await getMigrationProvenance(db);
  if (migrations.pendingCount !== 0) {
    throw new Error("database migration history remains pending after migrateToLatest");
  }
  console.info(`[backend-runtime] release provenance ${JSON.stringify({
    phase: "migration",
    ...resolveDeploymentProvenance(process.env),
    migrations,
  })}`);
} finally {
  await db.destroy();
}
