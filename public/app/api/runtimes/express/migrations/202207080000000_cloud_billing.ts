import { env } from "../../../shared/src/env";
import * as Knex from "knex";

let syncProductsPricesFn: (() => Promise<void>) | undefined;
export const registerSyncProductsPrices = (fn: typeof syncProductsPricesFn) => {
  syncProductsPricesFn = fn;
};

export const up = async (knex: Knex) => {
  if (env.IS_CLOUD && syncProductsPricesFn) {
    syncProductsPricesFn();
  }
};

export const down = async (knex: Knex) => {};
