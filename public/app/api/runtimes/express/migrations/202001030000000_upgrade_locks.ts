import * as Knex from "knex";
export const up = async (knex: Knex) => {
  await knex.schema.createTable("upgrade_locks", (t) => {
    t.collate("utf8mb4_unicode_ci");
    t.string("upgradingToApiVersion", 32).primary();
    t.dateTime("createdAt").defaultTo(knex.fn.now());
  });
};

export const down = async (knex: Knex) => {
  await knex.schema.dropTable("upgrade_locks");
};
