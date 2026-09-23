import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { FileMigrationProvider, Migrator, type MigrationInfo } from "kysely/migration";
import type { PersistenceDb } from "./index.js";

export function resolveMigrationFolderPath(): string {
  return fileURLToPath(new URL("./migrations", import.meta.url));
}

export type MigrationProvenance = {
  latestApplied: string | null;
  appliedCount: number;
  pendingCount: number;
};

export function summarizeMigrationHistory(
  migrations: ReadonlyArray<Pick<MigrationInfo, "name" | "executedAt">>,
): MigrationProvenance {
  const applied = migrations.filter((migration) => migration.executedAt !== undefined);
  return {
    latestApplied: applied.at(-1)?.name ?? null,
    appliedCount: applied.length,
    pendingCount: migrations.length - applied.length,
  };
}

export async function getMigrationProvenance(db: PersistenceDb): Promise<MigrationProvenance> {
  const migrator = new Migrator({ db, provider: createMigrationProvider() });
  return summarizeMigrationHistory(await migrator.getMigrations());
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
