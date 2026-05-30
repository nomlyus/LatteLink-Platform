import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { FileMigrationProvider, Migrator } from "kysely/migration";
import type { PersistenceDb } from "./index.js";

export function resolveMigrationFolderPath(): string {
  return fileURLToPath(new URL("./migrations", import.meta.url));
}

function createMigrationProvider() {
  return new FileMigrationProvider({
    fs,
    path,
    migrationFolder: resolveMigrationFolderPath()
  });
}

export async function runMigrations(db: PersistenceDb): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: createMigrationProvider()
  });

  const { error, results } = await migrator.migrateToLatest();

  for (const result of results ?? []) {
    if (result.status === "Success") {
      console.info(`[persistence] migration ${result.migrationName} applied`);
      continue;
    }

    if (result.status === "Error") {
      console.error(`[persistence] migration ${result.migrationName} failed`);
      continue;
    }

    console.error(`[persistence] migration ${result.migrationName} was not executed`);
  }

  if (error) {
    console.error("[persistence] migrateToLatest failed");
    throw error;
  }
}
