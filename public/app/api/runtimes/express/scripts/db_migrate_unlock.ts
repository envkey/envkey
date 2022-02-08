import Knex from "knex";

import { connectionConfig } from "./knexConfig";

(async () => {
  const knex = Knex(connectionConfig);

  try {
    await knex.migrate.forceFreeMigrationsLock();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }

  process.exit();
})();
