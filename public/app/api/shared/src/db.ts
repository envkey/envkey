import { env } from "./env";
import { Api } from "@core/types";
import { createPool, PoolConnection } from "mysql2/promise";
import { log } from "@core/lib/utils/logger";
import * as db_fns from "./db_fns";

type SecondaryIndex = string;

let dbCredentials:
  | {
      user: string;
      password: string;
    }
  | undefined;

if (env.DATABASE_CREDENTIALS_JSON) {
  try {
    dbCredentials = JSON.parse(env.DATABASE_CREDENTIALS_JSON) as {
      user: string;
      password: string;
    };
  } catch (err) {
    log("Failed reading DATABASE_CREDENTIALS_JSON from environment!", { err });
    process.exit(1);
  }
} else if (!env.DATABASE_URI) {
  log("Either DATABASE_CREDENTIALS_JSON or DATABASE_URI required");
  process.exit(1);
}

export const poolConfig = {
  ...(dbCredentials
    ? {
        ...dbCredentials,
        host: env.DATABASE_HOST,
        database: env.DATABASE_NAME,
        port: env.DATABASE_PORT ? parseInt(env.DATABASE_PORT) : undefined,
      }
    : {
        uri: env.DATABASE_URI!,
      }),
  multipleStatements: true,
  charset: "utf8mb4",
  connectionLimit: 100,
};

export const pool = createPool(poolConfig);

export const getPoolConn = async () => db_fns.getPoolConn(pool),
  getNewTransactionConn = async () => db_fns.getNewTransactionConn(pool),
  poolQuery = async (qs: string, qargs?: any[]) =>
    db_fns.poolQuery(pool, qs, qargs),
  execQuery = async (
    transactionConn: PoolConnection | undefined,
    qs: string,
    qargs: any[] = []
  ) => db_fns.execQuery(transactionConn ?? pool, qs, qargs),
  transactionQuery = async (qsArg: string, qargs?: any[]) =>
    db_fns.transactionQuery(pool, qsArg, qargs),
  // Returns a single row as an object of type T
  getDb = async <T extends Api.Db.DbObject>(
    key: Api.Db.DbKey | SecondaryIndex,
    opts: {
      deleted?: boolean;
    } & Api.Db.DbReadOpts
  ) =>
    db_fns.getDb<T>(key, {
      ...opts,
      transactionConnOrPool: opts.transactionConn ?? pool,
    }),
  getActiveOrgGraphObjects = async (
    orgId: string,
    readOpts: Api.Db.DbReadOpts,
    nonBaseScopes?: string[]
  ) =>
    db_fns.getActiveOrgGraphObjects(
      orgId,
      {
        ...readOpts,
        transactionConnOrPool: readOpts.transactionConn ?? pool,
      },
      nonBaseScopes
    ),
  getDeletedOrgGraphObjects = async (
    orgId: string,
    startsAt: number,
    endsAt: number,
    transactionConn: PoolConnection | undefined
  ) =>
    db_fns.getDeletedOrgGraphObjects(
      orgId,
      startsAt,
      endsAt,
      transactionConn ?? pool
    ),
  query = async <T extends Api.Db.DbObject>(params: Api.Db.QueryParams) =>
    db_fns.query<T>({
      ...params,
      transactionConnOrPool: params.transactionConn ?? pool,
    }),
  putDbStatement = <T extends Api.Db.DbObject>(obj: T): Api.Db.SqlStatement =>
    db_fns.putDbStatement<T>(obj),
  putDb = async <T extends Api.Db.DbObject>(
    obj: T,
    transactionConn: PoolConnection | undefined
  ) => db_fns.putDb<T>(obj, transactionConn ?? pool),
  updateDbStatement = <T extends Api.Db.DbObject>(
    key: Api.Db.DbKey,
    obj: T
  ): Api.Db.SqlStatement => db_fns.updateDbStatement(key, obj),
  objectTransactionStatements = db_fns.objectTransactionStatements,
  executeTransactionStatements = async (
    statements: Api.Db.SqlStatement[],
    transactionConn: PoolConnection
  ) => db_fns.executeTransactionStatements(statements, transactionConn),
  mergeObjectTransactionItems = db_fns.mergeObjectTransactionItems,
  objectTransactionItemsEmpty = db_fns.objectTransactionItemsEmpty,
  releaseTransaction = db_fns.releaseTransaction,
  resolveMaxPacketSize = async () => {
    const res = await pool.query("SELECT @@GLOBAL.max_allowed_packet;");
    const [[{ "@@GLOBAL.max_allowed_packet": dbMaxAllowedPacket }]] = res as [
      any[],
      any
    ];
    const maxPacketSize = dbMaxAllowedPacket * 0.95; // leave a little breathing room
    log("maxPacketSize:", { maxPacketSize });
    db_fns.setMaxPacketSize(maxPacketSize);
  };
