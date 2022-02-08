// WebpackMigrationSource is a migration "getter" for Knex, which still works after webpack
// bundles the API.
import RequireContext = __WebpackModuleApi.RequireContext;

export default class WebpackMigrationSource {
  migrationContext: RequireContext;

  constructor(migrationContext: RequireContext) {
    this.migrationContext = migrationContext;
  }

  getMigrations() {
    return Promise.resolve(this.migrationContext.keys().sort());
  }

  getMigrationName(migration: string) {
    return migration.replace("./", "");
  }

  getMigration(migration: string) {
    return this.migrationContext(migration);
  }
}
