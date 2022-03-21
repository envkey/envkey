import * as Knex from "knex";

let createActiveHostsFn: (knex: Knex) => Promise<void> | undefined;
export const registerCreateActiveHostsFn = (fn: typeof createActiveHostsFn) => {
  createActiveHostsFn = fn;
};

export const up = async (knex: Knex) => {
  if (createActiveHostsFn) {
    await createActiveHostsFn(knex);
  }
};

export const down = async (knex: Knex) => {
  await knex.schema.dropTableIfExists("active_hosts");
};
