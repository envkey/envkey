require("dotenv").config();

if (!process.env.DATABASE_NAME) {
  throw new Error(
    "DATABASE_NAME are required to run migrations. DATABASE_PORT may also be needed if mysql is running on a non-default port"
  );
}

import { poolConfig } from "../../../shared/src/db";

export const connectionConfig = {
  client: "mysql2",
  connection: poolConfig,
};

export const migrationConfig = { extension: "ts" };
