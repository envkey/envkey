import * as Knex from "knex";
import {
  dropLogIndexesV1,
  applyLogIndexesV1,
  applyLogIndexesV2,
  dropLogIndexesV2,
  INDEXES_BY_LOG_TABLE,
} from "../migration_helpers";

export const up = async (knex: Knex) => {
  for (let table in INDEXES_BY_LOG_TABLE) {
    const indexes = INDEXES_BY_LOG_TABLE[table];
    console.log(
      `Adding additional loggableType columns to ${table} and rebuilding indexes. Might take awhile...`
    );
    await knex.schema.alterTable(table, (t) => {
      indexes.forEach((arg) => {
        dropLogIndexesV1(t)(arg);
      });

      t.string("loggableType2", 20);
      t.string("loggableType3", 20);
      t.string("loggableType4", 20);

      indexes.forEach((arg) => {
        applyLogIndexesV2(t)(arg);
      });
    });
  }
};

export const down = async (knex: Knex) => {
  for (let table in INDEXES_BY_LOG_TABLE) {
    const indexes = INDEXES_BY_LOG_TABLE[table];
    console.log(
      `Removing additional loggableType columns to ${table} and rebuilding indexes. Might take awhile...`
    );
    await knex.schema.alterTable(table, (t) => {
      indexes.forEach((arg) => {
        dropLogIndexesV2(t)(arg);
      });

      t.dropColumn("loggableType2");
      t.dropColumn("loggableType3");
      t.dropColumn("loggableType4");

      indexes.forEach((arg) => {
        applyLogIndexesV1(t)(arg);
      });
    });
  }
};
