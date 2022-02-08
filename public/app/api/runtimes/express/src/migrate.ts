// hard import to force webpack to bundle
import { wait } from "@core/lib/utils/wait";

require("knex/lib/dialects/mysql2");

import { env } from "../../../shared/src/env";
import Knex from "knex";
import { poolConfig } from "../../../shared/src/db";
import WebpackMigrationSource from "./webpack_migration_source";
import DevMigrationSource from "./dev_migration_source";
import { log, logStderr } from "@core/lib/utils/logger";

export const runMigrationsIfNeeded = async () => {
  if (env.DISABLE_DB_MIGRATIONS) {
    log("DB migrations are disabled due to env setting");
    return;
  }

  const knex = Knex({
    client: "mysql2",
    connection: poolConfig,
    acquireConnectionTimeout:
      // aurora mysql cluster can be paused, causing schema consistency issues
      process.env.NODE_ENV === "production" ? 120000 : 60000,
  });
  try {
    let logs: string[];
    log("Waiting for DB...");
    await knex.raw("select 1 as ok;");
    log("Checking DB migrations...");
    if (process.env.NODE_ENV === "production") {
      // Half-hearted attempt to avoid migration lock collisions that were happening when
      // two services started at the same time.
      const jitter = Math.round(Math.random() * 5); // up to 5 secs of jitter
      await wait(jitter * 1000);

      // The following triggers webpack to suck the migrations into the webpack bundle file. It is quite finicky.
      // @ts-ignore
      const migrationContext = require.context("../migrations", false, /\.ts$/);
      log("Available migrations", { migrations: migrationContext.keys() });
      if (!migrationContext.keys().length) {
        throw new Error(
          "No migrations were found! Bundle or deployment error!"
        );
      }
      [, logs] = await knex.migrate.latest({
        migrationSource: new WebpackMigrationSource(migrationContext),
      });
    } else {
      [, logs] = await knex.migrate.latest({
        migrationSource: new DevMigrationSource(),
      });
    }
    log(
      logs.length
        ? "Successfully ran DB migrations: " + logs.join(", ")
        : "DB migrations are up to date."
    );
    await knex.destroy();
    log("Successfully shut down migrations DB connection.");
  } catch (err) {
    logStderr("DB migrations were unsuccessful.", { err });
    process.exit(1);
  }
};
