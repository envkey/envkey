import Knex from "knex";

import { connectionConfig, migrationConfig } from "./knexConfig";

(async () => {
  const knex = Knex(connectionConfig);
  try {
    const [, logs] = await knex.migrate.rollback(migrationConfig);
    console.log(
      logs.length
        ? "Successfully rolled back migrations:\n  " + logs.join("\n  ")
        : "Nothing to roll back"
    );
  } catch (err) {
    console.error(err);
    process.exit(1);
  }

  process.exit();
})();
