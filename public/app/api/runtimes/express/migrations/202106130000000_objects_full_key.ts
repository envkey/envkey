import * as Knex from "knex";
import { transactionQuery } from "../../../shared/src/db";

export const up = async (knex: Knex) => {
  await knex.schema.alterTable("objects", (t) => {
    t.string("fullKey", 382).notNullable().index();
  });

  console.log("Added fullKey column. Now adding fullKey to existing rows...");

  await transactionQuery(
    `UPDATE objects SET fullKey = CONCAT_WS("|",pkey, skey);`
  );
};

export const down = async (knex: Knex) => {
  await knex.schema.alterTable("objects", (t) => {
    t.dropColumn("fullKey");
  });
};
