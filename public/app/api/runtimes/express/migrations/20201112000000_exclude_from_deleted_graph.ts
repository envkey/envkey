import * as Knex from "knex";
export const up = async (knex: Knex) => {
  await knex.schema.alterTable("objects", (t) => {
    t.boolean("excludeFromDeletedGraph").notNullable().defaultTo(false);

    t.dropUnique(["pkey", "skey", "deletedAt"], "idx_deleted");
    t.dropUnique(["pkey", "skey", "createdAt"], "idx_ts");
    t.dropIndex(["skey", "deletedAt"], "idx_skey");

    t.unique(
      ["pkey", "skey", "deletedAt", "orderIndex", "createdAt"],
      "idx_ts"
    );
    t.unique(
      ["pkey", "skey", "deletedAt", "excludeFromDeletedGraph"],
      "idx_deleted"
    );
    t.index(["skey", "deletedAt"], "idx_skey");
  });
};

export const down = async (knex: Knex) => {
  await knex.schema.alterTable("objects", (t) => {
    t.dropColumn("excludeFromDeletedGraph");

    t.dropUnique(
      ["pkey", "skey", "deletedAt", "orderIndex", "createdAt"],
      "idx_ts"
    );
    t.dropUnique(
      ["pkey", "skey", "deletedAt", "excludeFromDeletedGraph"],
      "idx_deleted"
    );
    t.dropIndex(["skey", "deletedAt"], "idx_skey");

    t.unique(["pkey", "skey", "deletedAt"], "idx_deleted");
    t.unique(["pkey", "skey", "createdAt"], "idx_ts");
    t.index(["skey", "deletedAt"], "idx_skey");
  });
};
