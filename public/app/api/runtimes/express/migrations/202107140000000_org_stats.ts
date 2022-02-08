import * as Knex from "knex";

let createOrgStatsTableFn: (knex: Knex) => Promise<void> | undefined;

export const registerCreateOrgStatsTableFn = (
  fn: typeof createOrgStatsTableFn
) => {
  createOrgStatsTableFn = fn;
};

export const up = async (knex: Knex) => {
  await knex.schema.alterTable("objects", (t) => {
    t.bigInteger("bytes").notNullable();
  });

  if (createOrgStatsTableFn) {
    await createOrgStatsTableFn(knex);
  }
};

export const down = async (knex: Knex) => {
  await knex.schema.alterTable("objects", (t) => {
    t.dropColumn("bytes");
  });

  await knex.schema.dropTableIfExists("org_stats");
};
