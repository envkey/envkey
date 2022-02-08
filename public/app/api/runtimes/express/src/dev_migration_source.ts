// DevMigrationSource is a migration "getter" for Knex, which works from any folder but not inside webpack
import fs from "fs";
import path from "path";
import { Migration } from "knex";

export default class WebpackMigrationSource {
  async getMigrations() {
    const migrations = await fs.promises.readdir(
      path.resolve(__dirname, "../migrations")
    );
    return migrations;
  }

  getMigrationName(migration: string) {
    return migration;
  }

  getMigration(migration: string) {
    const migrationContent = (require(`../migrations/${migration}`) as any) as Migration;
    return migrationContent;
  }
}
