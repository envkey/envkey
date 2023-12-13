import { env } from "./env";
import { Api } from "@core/types";
import {
  createPool,
  Pool,
  PoolConnection,
  ConnectionOptions,
} from "mysql2/promise";
import { log } from "@core/lib/utils/logger";
import * as db_fns from "./db_fns";

const LOGS_DB_ACTIVE = Boolean(env.LOGS_DB_HOST && env.LOGS_DB_NAME);

type SecondaryIndex = string;

let pool: Pool;
let poolConfig: ConnectionOptions;
let logsPool: Pool;
let logsPoolConfig: ConnectionOptions;
let initialized = false;

export const getPoolConfig = () => poolConfig;
export const getLogsPoolConfig = () =>
  LOGS_DB_ACTIVE ? logsPoolConfig : poolConfig;

export const initIfNeeded = (lambdaConfig?: ConnectionOptions) => {
  if (process.env.NODE_ENV !== "test") {
    log("Initializing DB pool");
  }
  if (initialized) {
    if (process.env.NODE_ENV !== "test") {
      log("DB pool already initialized");
    }
    return;
  }
  initialized = true;

  if (lambdaConfig && env.AWS_LAMBDA_FUNCTION_NAME) {
    log("Initializing DB pool for lambda", { lambdaConfig });
    poolConfig = {
      ...lambdaConfig,
      multipleStatements: true,
      charset: "utf8mb4",
      connectionLimit: 1,
    };
    pool = createPool(poolConfig);
    return;
  }

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
      log("Failed reading DATABASE_CREDENTIALS_JSON from environment!", {
        err,
      });
      process.exit(1);
    }
  } else if (!env.DATABASE_URI) {
    log("Either DATABASE_CREDENTIALS_JSON or DATABASE_URI required");
    process.exit(1);
  }

  poolConfig = {
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

  pool = createPool(poolConfig);

  if (LOGS_DB_ACTIVE) {
    logsPoolConfig = {
      ...dbCredentials,
      host: env.LOGS_DB_HOST,
      database: env.LOGS_DB_NAME,
      port: env.LOGS_DB_PORT ? parseInt(env.LOGS_DB_PORT) : undefined,
      multipleStatements: true,
      charset: "utf8mb4",
      connectionLimit: 100,
    };

    logsPool = createPool(logsPoolConfig);
  }
};

export const getPool = () => pool;
export const getLogsPool = () => (LOGS_DB_ACTIVE ? logsPool : pool);

// in AWS lambda, don't auto-init pool
if (!env.AWS_LAMBDA_FUNCTION_NAME) {
  initIfNeeded();
  if (process.env.NODE_ENV !== "test") {
    log("DB pool initialized");
  }
}

export const getPoolConn = async () => db_fns.getPoolConn(pool),
  getLogsPoolConn = async () => db_fns.getPoolConn(getLogsPool()),
  getNewTransactionConn = async () => db_fns.getNewTransactionConn(pool),
  getNewLogsTransactionConn = async () =>
    db_fns.getNewTransactionConn(getLogsPool()),
  poolQuery = async (qs: string, qargs?: any[]) =>
    db_fns.poolQuery(pool, qs, qargs),
  logsPoolQuery = async (qs: string, qargs?: any[]) =>
    db_fns.poolQuery(getLogsPool(), qs, qargs),
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
