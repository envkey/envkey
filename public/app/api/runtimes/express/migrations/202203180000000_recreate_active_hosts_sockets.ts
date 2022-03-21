import * as Knex from "knex";

let createActiveSocketsFn: ((knex: Knex) => Promise<void>) | undefined;
export const registerCreateActiveSocketsFn = (
  fn: typeof createActiveSocketsFn
) => {
  createActiveSocketsFn = fn;
};

let createActiveHostsFn: ((knex: Knex) => Promise<void>) | undefined;
export const registerCreateActiveHostsFn = (fn: typeof createActiveHostsFn) => {
  createActiveHostsFn = fn;
};

export const up = async (knex: Knex) => {
  if (createActiveHostsFn) {
    await createActiveHostsFn(knex);
  }
  if (createActiveSocketsFn) {
    await createActiveSocketsFn(knex);
  }
};

export const down = async (knex: Knex) => {};
