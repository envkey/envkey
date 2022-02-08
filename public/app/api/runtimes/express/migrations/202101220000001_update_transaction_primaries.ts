import * as Knex from "knex";
import { poolQuery } from "../../../shared/src/db";

export const up = async (knex: Knex) => {
  console.log(
    "Updating transaction_ids_by_target_id primary key. Might take awhile..."
  );
  // The IGNORE here deletes duplicates instead of raising an error
  await poolQuery(
    "ALTER TABLE transaction_ids_by_target_id ADD CONSTRAINT pk PRIMARY KEY (targetId,transactionId,actionType);"
  );
};

export const down = async (knex: Knex) => {
  console.log(
    "Dropping transaction_ids_by_target_id primary key. Might take awhile..."
  );
  await knex.schema.alterTable("transaction_ids_by_target_id", (t) => {
    t.dropPrimary();
  });
};
