import { env } from "../../../shared/src/env";
import * as Knex from "knex";

export const up = async (knex: Knex) => {
  if (env.IS_ENTERPRISE) {
    await knex.schema.createTable("self_hosted_init", (t) => {
      t.collate("utf8mb4_unicode_ci");
      t.bigInteger("initializingSelfHosted");
      t.bigInteger("initializedSelfHosted");
    });

    await knex("self_hosted_init").insert([
      {
        initializingSelfHosted: null,
        initializedSelfHosted: null,
      },
    ]);
  }
};

export const down = async (knex: Knex) => {
  if (env.IS_ENTERPRISE) {
    await knex.schema.dropTable("self_hosted_init");
  }
};
