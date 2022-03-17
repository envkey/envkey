import * as Knex from "knex";

let createActiveSocketsFn: (knex: Knex) => Promise<void> | undefined;
export const registerCreateActiveSocketsFn = (
  fn: typeof createActiveSocketsFn
) => {
  createActiveSocketsFn = fn;
};

export const up = async (knex: Knex) => {
  if (createActiveSocketsFn) {
    await createActiveSocketsFn(knex);
  }
};

export const down = async (knex: Knex) => {
  await knex.schema.dropTable("active_sockets");
  await knex.schema.alterTable("org_stats", (t) => {
    t.bigInteger("activeSocketConnections").notNullable().defaultTo(0);
  });
};
