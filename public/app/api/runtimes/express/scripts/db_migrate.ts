import Knex from "knex";

import { connectionConfig, migrationConfig } from "./knexConfig";

(async () => {
  const knex = Knex(connectionConfig);

  try {
    const [, logs] = await knex.migrate.latest(migrationConfig);
    console.log(
      logs.length
        ? "Successfully ran migrations:\n  " + logs.join("\n  ")
        : "Already up to date"
    );
  } catch (err) {
    console.error(err);
    process.exit(1);
  }

  process.exit();
})();
