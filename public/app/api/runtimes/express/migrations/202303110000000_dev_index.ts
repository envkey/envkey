import * as Knex from "knex";
import { env } from "../../../shared/src/env";

export const up = async (knex: Knex) => {
  if (env.NODE_ENV == "development") {
    await knex.schema.alterTable("objects", (t) => {
      t.string("devIndex").index();
    });
  }
};

export const down = async (knex: Knex) => {
  if (env.NODE_ENV == "development") {
    await knex.schema.alterTable("objects", (t) => {
      t.dropColumn("devIndex");
    });
  }
};
