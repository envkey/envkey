import * as Knex from "knex";
import { addBaseLogColumnsV1, applyLogIndexesV1 } from "../migration_helpers";
import { poolQuery, transactionQuery } from "../../../shared/src/db";
import { Logs } from "../../../../core/src/types";
import * as R from "ramda";

export const up = async (knex: Knex) => {
  await knex.schema.createTable("transaction_ids", (t) => {
    t.collate("utf8mb4_unicode_ci");

    addBaseLogColumnsV1(t);

    t.string("transactionId", 36).primary();

    // indices with and without ip address
    (
      [
        ["actor", ["actorId"]],
        ["device", ["deviceId"]],
        ["base", []],
      ] as [string, string[]][]
    ).forEach((arg) => applyLogIndexesV1(t)(arg));
  });

  console.log("`transaction_ids` table created. Populating...");

  let i = 0;
  const insertedTransactionIds = new Set<string>();
  while (true) {
    console.log(`Batch ${i}. Fetching batch from 'logs'`);

    let [logRows] = (await poolQuery(
      `SELECT transactionId, orgId, actorId, deviceId, loggableType, actionType, clientName, ip, error, errorReason, errorStatus, createdAt FROM logs LIMIT 10000 OFFSET ${
        10000 * i
      }`
    )) as any[][];

    logRows = R.uniqBy(R.prop("transactionId"), logRows).filter(
      ({ transactionId }) => !insertedTransactionIds.has(transactionId)
    );

    if (logRows.length == 0) {
      console.log("No more log rows. Breaking.");
      break;
    }

    console.log(`Inserting ${logRows.length} rows...`);

    const logs = logRows as (Pick<
      Logs.LoggedAction,
      | "transactionId"
      | "orgId"
      | "actorId"
      | "deviceId"
      | "actionType"
      | "clientName"
      | "ip"
      | "error"
      | "errorReason"
      | "errorStatus"
      | "createdAt"
    > & { loggableType: string })[];

    let qs =
      "INSERT INTO transaction_ids (transactionId, orgId, actorId, deviceId, loggableType, actionType, clientName, ip, error, errorReason, errorStatus, createdAt) VALUES ";
    let qargs: (string | boolean | number | null)[] = [];

    qs += logs
      .map((logged) => {
        insertedTransactionIds.add(logged.transactionId!);

        qargs = qargs.concat([
          logged.transactionId!,
          logged.orgId ?? null,
          logged.actorId ?? null,
          logged.deviceId ?? null,
          logged.loggableType!,
          logged.actionType!,
          logged.clientName ?? null,
          logged.ip!,
          logged.error!,
          logged.errorReason ?? null,
          logged.errorStatus ?? null,
          logged.createdAt!,
        ]);

        return `(${R.repeat("?", 12).join(",")})`;
      })
      .join(",");

    await transactionQuery(qs, qargs);

    i += 1;
  }
};

export const down = async (knex: Knex) => {
  console.log("Dropping transaction_ids table. Might take awhile...");
  await knex.schema.dropTable("transaction_ids");
};
