import * as Knex from "knex";
export const up = async (knex: Knex) => {
  await knex.schema.alterTable("objects", (t) => {
    t.string("secondaryIndex").index();
  });
};

export const down = async (knex: Knex) => {
  await knex.schema.alterTable("objects", (t) => {
    t.dropColumn("secondaryIndex");
  });
};
