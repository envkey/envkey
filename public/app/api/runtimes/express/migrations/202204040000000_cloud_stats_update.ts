import * as Knex from "knex";

let updateCloudStatsFn: ((knex: Knex) => Promise<void>) | undefined;
export const registerUpdateCloudStatsMigrationFn = (
  fn: typeof updateCloudStatsFn
) => {
  updateCloudStatsFn = fn;
};

let downgradeCloudStatsFn: ((knex: Knex) => Promise<void>) | undefined;
export const registerDowngradeCloudStatsMigrationFn = (
  fn: typeof downgradeCloudStatsFn
) => {
  downgradeCloudStatsFn = fn;
};

export const up = async (knex: Knex) => {
  if (updateCloudStatsFn) {
    await updateCloudStatsFn(knex);
  }
};

export const down = async (knex: Knex) => {
  if (downgradeCloudStatsFn) {
    await downgradeCloudStatsFn(knex);
  }
};
