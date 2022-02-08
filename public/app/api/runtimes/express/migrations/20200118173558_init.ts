import * as Knex from "knex";
import { addBaseLogColumnsV1, applyLogIndexesV1 } from "../migration_helpers";
// Note: charset is set to utf8mb4 in the client connection, which results in the columns being created with that character set. The default engine for MySQL and Aurora is InnoDB.
export const up = async (knex: Knex) => {
  await knex.schema.createTable("objects", (t) => {
    t.collate("utf8mb4_unicode_ci");

    t.string("pkey", 191).notNullable();
    t.string("skey", 191).notNullable();
    t.specificType("body", "mediumtext").notNullable(); // max size of 16mb
    t.specificType("data", "longtext"); // max size of 4gb
    t.bigInteger("createdAt").notNullable();
    t.bigInteger("updatedAt").notNullable();
    t.bigInteger("deletedAt").notNullable().defaultTo(0);
    t.bigInteger("orderIndex");

    t.primary(["pkey", "skey"]);
    t.unique(["pkey", "skey", "createdAt"], "idx_ts");
    t.unique(["pkey", "skey", "deletedAt"], "idx_deleted");
    t.index(["skey", "deletedAt"], "idx_skey");
  });

  await knex.schema.createTable("logs", (t) => {
    t.collate("utf8mb4_unicode_ci");

    addBaseLogColumnsV1(t);

    t.string("transactionId", 36)
      .notNullable()
      .index("index_logs_on_transactionId");
    t.string("id", 36).primary();
    t.specificType("body", "mediumtext").notNullable();

    // indices with and without ip address
    (
      [
        ["actor", ["actorId"]],
        ["device", ["deviceId"]],
        ["base", []],
      ] as [string, string[]][]
    ).forEach((arg) => applyLogIndexesV1(t)(arg));
  });

  await knex.schema.createTable("transaction_ids_by_target_id", (t) => {
    t.collate("utf8mb4_unicode_ci");

    addBaseLogColumnsV1(t);

    t.string("targetId", 160).notNullable();
    t.string("transactionId", 36).notNullable();

    (
      [
        ["actor", ["actorId", "targetId"]],
        ["device", ["deviceId", "targetId"]],
        ["base", ["targetId"]],
      ] as [string, string[]][]
    ).forEach((arg) => applyLogIndexesV1(t)(arg));
  });
};

export const down = async (knex: Knex) => {
  await knex.schema.dropTable("transaction_ids_by_target_id");
  await knex.schema.dropTable("logs");
  await knex.schema.dropTable("objects");
};
