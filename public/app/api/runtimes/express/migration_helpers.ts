import * as Knex from "knex";

export const INDEXES_BY_LOG_TABLE: Record<string, [string, string[]][]> = {
  logs: [
    ["actor", ["actorId"]],
    ["device", ["deviceId"]],
    ["base", []],
  ],
  transaction_ids: [
    ["actor", ["actorId"]],
    ["device", ["deviceId"]],
    ["base", []],
  ],
  transaction_ids_by_target_id: [
    ["actor", ["actorId", "targetId"]],
    ["device", ["deviceId", "targetId"]],
    ["base", ["targetId"]],
  ],
};

const LOGS_ALL_QUERIES_PREFIX_COLUMNS_V1 = [
  "orgId",
  "actionType",
  "clientName",
  "error",
  "loggableType",
];

const LOGS_ALL_QUERIES_PREFIX_COLUMNS_V2 = [
  ...LOGS_ALL_QUERIES_PREFIX_COLUMNS_V1,
  "loggableType2",
  "loggableType3",
  "loggableType4",
];

export const addBaseLogColumnsV1 = (t: Knex.TableBuilder) => {
  t.string("orgId", 36);
  t.string("loggableType", 20).notNullable();
  t.string("actorId", 36);
  t.string("deviceId", 36);
  t.string("actionType", 100).notNullable();
  t.string("clientName", 20);
  t.string("ip", 45).notNullable();
  t.boolean("error").notNullable().defaultTo(false);
  t.text("errorReason");
  t.integer("errorStatus");
  t.bigInteger("createdAt").notNullable();
};

const applyLogIndexes = (t: Knex.TableBuilder, prefixColumns: string[]) => (
  forEachArg: [string, string[]]
) => {
  const [name, columns] = forEachArg;
  t.index([...prefixColumns, ...columns, "createdAt"], `idx_${name}`);
  t.index(
    [...prefixColumns, ...columns, "ip", "createdAt"],
    `idx_${name}_with_ip`
  );
  console.log("applied indexes", `idx_${name}`, `idx_${name}_with_ip`);
};

const dropLogIndexes = (t: Knex.TableBuilder, prefixColumns: string[]) => (
  forEachArg: [string, string[]]
) => {
  const [name, columns] = forEachArg;
  t.dropIndex([...prefixColumns, ...columns, "createdAt"], `idx_${name}`);
  t.dropIndex(
    [...prefixColumns, ...columns, "ip", "createdAt"],
    `idx_${name}_with_ip`
  );
  console.log("dropped indexes", `idx_${name}`, `idx_${name}_with_ip`);
};

export const applyLogIndexesV1 = (t: Knex.TableBuilder) => (
  forEachArg: [string, string[]]
) => {
  applyLogIndexes(t, LOGS_ALL_QUERIES_PREFIX_COLUMNS_V1)(forEachArg);
};

export const applyLogIndexesV2 = (t: Knex.TableBuilder) => (
  forEachArg: [string, string[]]
) => {
  applyLogIndexes(t, LOGS_ALL_QUERIES_PREFIX_COLUMNS_V2)(forEachArg);
};

export const dropLogIndexesV1 = (t: Knex.TableBuilder) => (
  forEachArg: [string, string[]]
) => {
  dropLogIndexes(t, LOGS_ALL_QUERIES_PREFIX_COLUMNS_V1)(forEachArg);
};

export const dropLogIndexesV2 = (t: Knex.TableBuilder) => (
  forEachArg: [string, string[]]
) => {
  dropLogIndexes(t, LOGS_ALL_QUERIES_PREFIX_COLUMNS_V2)(forEachArg);
};
