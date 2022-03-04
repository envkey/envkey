import * as Knex from "knex";

let trackActiveConnectionsFn: (knex: Knex) => Promise<void> | undefined;
export const registerTrackActiveConnectionsFn = (
  fn: typeof trackActiveConnectionsFn
) => {
  trackActiveConnectionsFn = fn;
};

let removeTrackActiveConnectionsFn: (knex: Knex) => Promise<void> | undefined;
export const registerRemoveTrackActiveConnectionsFn = (
  fn: typeof removeTrackActiveConnectionsFn
) => {
  removeTrackActiveConnectionsFn = fn;
};

export const up = async (knex: Knex) => {
  if (trackActiveConnectionsFn) {
    await trackActiveConnectionsFn(knex);
  }
};

export const down = async (knex: Knex) => {
  if (removeTrackActiveConnectionsFn) {
    await removeTrackActiveConnectionsFn(knex);
  }
};
