import {
  getScope,
  userEncryptedKeyPkey,
  encryptedBlobPkey,
} from "@core/lib/blob";
import { env } from "./env";
import { Api } from "@core/types";
import * as R from "ramda";
import { createPool, format, PoolConnection } from "mysql2/promise";
import { log } from "@core/lib/utils/logger";

type SecondaryIndex = string;

let maxPacketSize = 4000000; // just a default, will be ovewritten by `max_allowed_packet` setting from db on init

let dbCredentials: {
  user: string;
  password: string;
};
try {
  dbCredentials = JSON.parse(env.DATABASE_CREDENTIALS_JSON) as {
    user: string;
    password: string;
  };
} catch (err) {
  log("Failed reading DATABASE_CREDENTIALS_JSON from environment!", { err });
  process.exit(1);
}

export const poolConfig = {
  ...dbCredentials,
  host: env.DATABASE_HOST,
  database: env.DATABASE_NAME,
  port: env.DATABASE_PORT ? parseInt(env.DATABASE_PORT) : undefined,
  multipleStatements: true,
  charset: "utf8mb4",
  connectionLimit: 100,
};

const pool = createPool(poolConfig);

export const getPoolConn = async () => {
    let conn: PoolConnection | undefined;

    while (!conn) {
      conn = await pool.getConnection();
      const checkConn = conn as any;
      if (
        checkConn.connection._fatalError ||
        checkConn.connection._protocolError
      ) {
        log(
          "Pool connection errored or was closed. Re-establishing connection."
        );
        conn?.destroy();
        conn = undefined;
      }
    }

    return conn!;
  },
  getNewTransactionConn = async () => {
    const conn = await getPoolConn();

    await conn.query(
      "SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ; START TRANSACTION;"
    );

    return conn!;
  },
  poolQuery = async (qs: string, qargs?: any[]) => {
    const conn = await getPoolConn();

    let res: any;

    try {
      res = await conn.query(qs, qargs);
    } catch (err) {
      await conn.release();
      throw err;
    }

    await conn.release();

    return res as ReturnType<typeof conn.query>;
  },
  execQuery = async (
    transactionConn: PoolConnection | undefined,
    qs: string,
    qargs: any[] = []
  ) =>
    transactionConn ? transactionConn.query(qs, qargs) : pool.query(qs, qargs),
  transactionQuery = async (qsArg: string, qargs?: any[]) => {
    const transactionConn = await getNewTransactionConn();

    let qs = qsArg.trim();
    if (!qs.endsWith(";")) {
      qs += ";";
    }

    try {
      return transactionConn.query(qs + " COMMIT;", qargs);
    } finally {
      transactionConn.release();
    }
  },
  // Returns a single row as an object of type T
  getDb = async <T extends Api.Db.DbObject>(
    key: Api.Db.DbKey | SecondaryIndex,
    opts: {
      deleted?: boolean;
    } & Api.Db.DbReadOpts
  ) => {
    const { deleted, lockType, transactionConn } = opts;

    let qs = `SELECT ${"pkey, skey, body, data, createdAt, updatedAt, deletedAt, orderIndex, secondaryIndex, tertiaryIndex"} from objects WHERE ${
      typeof key == "string" ? "secondaryIndex = ?" : "pkey = ? AND skey = ?"
    }`;
    if (deleted === true) {
      qs += " AND deletedAt > 0";
    } else if (deleted === false) {
      qs += " AND deletedAt = 0";
    }

    if (transactionConn && lockType) {
      qs += " " + lockType;
    }

    qs += ";";

    const [rows] = (<any>(
      await execQuery(
        transactionConn,
        qs,
        typeof key == "string" ? [key] : [key.pkey, key.skey]
      )
    )) as [
      {
        pkey: string;
        skey: string;
        body: string;
        data: string | null;
        createdAt: number;
        updatedAt: number;
        deletedAt: number | null;
        orderIndex: number | null;
        secondaryIndex: string | null;
        tertiaryIndex: string | null;
      }[]
    ];

    if (rows.length == 1) {
      const {
        pkey,
        skey,
        body,
        data,
        createdAt,
        updatedAt,
        deletedAt,
        orderIndex,
        secondaryIndex,
        tertiaryIndex,
      } = rows[0];
      return {
        ...JSON.parse(body),
        pkey,
        skey,
        data: data ? JSON.parse(data) : undefined,
        createdAt,
        updatedAt,
        deletedAt: deletedAt === null ? undefined : deletedAt,
        orderIndex: orderIndex === null ? undefined : orderIndex,
        secondaryIndex: secondaryIndex === null ? undefined : secondaryIndex,
        tertiaryIndex: tertiaryIndex === null ? undefined : tertiaryIndex,
      } as T;
    } else {
      return undefined;
    }
  },
  getActiveOrgGraphObjects = async (
    orgId: string,
    readOpts: Api.Db.DbReadOpts,
    nonBaseScopes?: string[]
  ) =>
    query<Api.Graph.GraphObject>({
      pkey: orgId,
      scope: nonBaseScopes
        ? ["g|org$"]
            .concat(Api.Graph.baseScopeTypes.map((scope) => `g|${scope}|`))
            .concat(nonBaseScopes)
        : "g|",
      sortBy: "orderIndex,createdAt",
      ...readOpts,
    }),
  getDeletedOrgGraphObjects = async (
    orgId: string,
    startsAt: number,
    endsAt: number,
    transactionConn: PoolConnection | undefined
  ) =>
    query<Api.Graph.GraphObject>({
      pkey: orgId,
      scope: "g|",
      deletedAfter: startsAt - 1,
      createdBefore: endsAt + 1,
      deleted: true,
      deletedGraphQuery: true,
      transactionConn,
    }),
  query = async <T extends Api.Db.DbObject>(params: Api.Db.QueryParams) => {
    const {
      pkey,
      scope,
      limit,
      offset,
      deleted,
      createdBefore,
      createdAfter,
      deletedBefore,
      deletedAfter,
      updatedAfter,
      updatedBefore,
      sortBy,
      sortDesc,
      omitData,
      transactionConn,
      lockType,
      secondaryIndex,
      tertiaryIndex,
      deletedGraphQuery,
    } = params;

    const fields = [
      "pkey",
      "skey",
      "body",
      "createdAt",
      "updatedAt",
      "deletedAt",
      "orderIndex",
      "secondaryIndex",
      "tertiaryIndex",
    ];

    if (!omitData) {
      fields.push("data");
    }

    let qs = `SELECT ${fields.join(",")} from objects WHERE `;
    const qargs = [];

    if (pkey) {
      if (Array.isArray(pkey)) {
        qs += "(" + pkey.map((s) => "pkey = ?").join(" OR ") + ")";
        for (let s of pkey) {
          qargs.push(s);
        }
      } else {
        qs += "pkey = ?";
        qargs.push(pkey);
      }
    }

    if (scope) {
      if (pkey) {
        qs += " AND ";
      }
      if (Array.isArray(scope)) {
        qs += "(" + scope.map((s) => "skey LIKE ?").join(" OR ") + ")";
        for (let s of scope) {
          const exact = s.endsWith("$");
          qargs.push(s.replace("$", "") + (exact ? "" : "%"));
        }
      } else {
        const exact = scope.endsWith("$");
        qs += exact ? "skey = ?" : "skey LIKE ?";
        qargs.push(scope.replace("$", "") + (exact ? "" : "%"));
      }
    }

    if (typeof createdBefore == "number") {
      qs += " AND createdAt < ?";
      qargs.push(createdBefore);
    }

    if (typeof createdAfter == "number") {
      qs += " AND createdAt > ?";
      qargs.push(createdAfter);
    }

    if (deleted === true) {
      qs += ` AND deletedAt > ?`;
      qargs.push(deletedAfter ?? 0);
      if (typeof deletedBefore == "number") {
        qs += ` AND deletedAt < ?`;
        qargs.push(deletedBefore);
      }
      if (deletedGraphQuery) {
        qs += ` AND excludeFromDeletedGraph = ?`;
        qargs.push(0);
      }
    } else if (deleted === false || typeof deleted == "undefined") {
      qs += " AND deletedAt = 0";
    }

    if (typeof updatedAfter == "number") {
      qs += " AND updatedAt > ?";
      qargs.push(updatedAfter);
    }

    if (typeof updatedBefore == "number") {
      qs += " AND updatedAt < ?";
      qargs.push(updatedBefore);
    }

    if (typeof secondaryIndex != "undefined") {
      if (secondaryIndex === null) {
        qs += " AND secondaryIndex IS NULL";
      } else if (typeof secondaryIndex == "string") {
        qs += " AND secondaryIndex = ?";
        qargs.push(secondaryIndex);
      } else if (Array.isArray(secondaryIndex)) {
        qs += " AND secondaryIndex IN (?)";
        qargs.push(secondaryIndex);
      }
    }

    if (typeof tertiaryIndex != "undefined") {
      if (tertiaryIndex === null) {
        qs += " AND tertiaryIndex IS NULL";
      } else if (typeof tertiaryIndex == "string") {
        qs += " AND tertiaryIndex = ?";
        qargs.push(tertiaryIndex);
      } else if (Array.isArray(tertiaryIndex)) {
        qs += " AND tertiaryIndex IN (?)";
        qargs.push(tertiaryIndex);
      }
    }

    if (sortBy) {
      qs += ` ORDER BY ${sortBy} ${sortDesc ? "DESC" : "ASC"}`;
    }

    if (limit) {
      qs += ` LIMIT ${limit}`;
    }
    if (offset) {
      qs += ` OFFSET ${offset}`;
    }

    if (transactionConn && lockType) {
      qs += " " + lockType;
    }

    qs += ";";

    const [rows] = (<any>await execQuery(transactionConn, qs, qargs)) as [
      {
        body: string;
        data?: string | null;
        pkey: string;
        skey: string;
        createdAt: number;
        updatedAt: number;
        deletedAt: number | null;
        orderIndex: number | null;
        secondaryIndex: string | null;
        tertiaryIndex: string | null;
      }[]
    ];

    return rows.map(
      ({
        pkey,
        skey,
        body,
        data,
        createdAt,
        updatedAt,
        deletedAt,
        orderIndex,
        secondaryIndex,
        tertiaryIndex,
      }) =>
        ({
          ...JSON.parse(body),
          pkey,
          skey,
          createdAt,
          updatedAt,
          deletedAt: deletedAt === null ? undefined : deletedAt,
          orderIndex: orderIndex === null ? undefined : orderIndex,
          secondaryIndex: secondaryIndex === null ? undefined : secondaryIndex,
          tertiaryIndex: tertiaryIndex === null ? undefined : tertiaryIndex,
          data: data ? JSON.parse(data) : undefined,
        } as T)
    );
  },
  putDbStatement = <T extends Api.Db.DbObject>(obj: T): Api.Db.SqlStatement => {
    const bodyJson = JSON.stringify(
      R.omit(
        [
          "pkey",
          "skey",
          "createdAt",
          "updatedAt",
          "deletedAt",
          "orderIndex",
          "data",
          "secondaryIndex",
          "tertiaryIndex",
          "excludeFromDeletedGraph",
        ],
        obj
      )
    );

    const dataJson = obj.data ? JSON.stringify(obj.data) : null;

    const bytes = Buffer.byteLength(
      bodyJson + (dataJson ?? "") + obj.pkey + obj.skey,
      "utf8"
    );

    return {
      qs: `SET @pkey = ?, @skey = ?, @body = ?, @data = ?, @createdAt = ?, @updatedAt = ?, @orderIndex = ?, @secondaryIndex = ?, @tertiaryIndex = ?, @excludeFromDeletedGraph = ?, @bytes = ?;
      SET @fullKey = CONCAT_WS("|",@pkey,@skey);
  INSERT INTO objects (pkey, skey, fullKey, body, data, createdAt, updatedAt, orderIndex, secondaryIndex, tertiaryIndex, excludeFromDeletedGraph, bytes)
  VALUES (@pkey, @skey, @fullKey, @body, @data, @createdAt, @updatedAt, @orderIndex, @secondaryIndex, @tertiaryIndex, @excludeFromDeletedGraph, @bytes)
  ON DUPLICATE KEY UPDATE fullKey = @fullKey, body = @body, data = @data, orderIndex = @orderIndex, secondaryIndex = @secondaryIndex, tertiaryIndex = @tertiaryIndex, excludeFromDeletedGraph = @excludeFromDeletedGraph, bytes = @bytes, updatedAt = @updatedAt;`,
      qargs: [
        obj.pkey,
        obj.skey,
        bodyJson,
        dataJson,
        obj.createdAt,
        obj.updatedAt,
        obj.orderIndex ?? null,
        obj.secondaryIndex ?? null,
        obj.tertiaryIndex ?? null,
        obj.excludeFromDeletedGraph ? 1 : 0,
        bytes,
      ],
    };
  },
  putDb = async <T extends Api.Db.DbObject>(
    obj: T,
    transactionConn: PoolConnection | undefined
  ) => {
    const { qs, qargs } = putDbStatement(obj);
    return execQuery(transactionConn, qs, qargs);
  },
  updateDbStatement = <T extends Api.Db.DbObject>(
    key: Api.Db.DbKey,
    obj: T
  ): Api.Db.SqlStatement => {
    const bodyJson = JSON.stringify(
      R.omit(
        [
          "pkey",
          "skey",
          "createdAt",
          "updatedAt",
          "deletedAt",
          "orderIndex",
          "data",
          "secondaryIndex",
          "tertiaryIndex",
          "excludeFromDeletedGraph",
        ],
        obj
      )
    );

    const dataJson = obj.data ? JSON.stringify(obj.data) : null;

    const bytes = Buffer.byteLength(
      bodyJson + (dataJson ?? "") + key.pkey + key.skey,
      "utf8"
    );

    return {
      qs: "UPDATE objects SET body = ?, data = ?, updatedAt = ?, deletedAt = ?, orderIndex = ?, excludeFromDeletedGraph = ?, bytes = ? WHERE pkey = ? AND skey = ?;",
      qargs: [
        bodyJson,
        dataJson,
        obj.updatedAt,
        obj.deletedAt ?? 0,
        obj.orderIndex ?? null,
        obj.excludeFromDeletedGraph ? 1 : 0,
        bytes,
        key.pkey,
        key.skey,
      ],
    };
  },
  objectTransactionStatements = (
    transactionItems: Api.Db.ObjectTransactionItems,
    now: number
  ): Api.Db.SqlStatement[] => {
    const statements: Api.Db.SqlStatement[] = [];

    const toPutFullKeys = new Set<string>();
    if (transactionItems.puts?.length) {
      for (let obj of transactionItems.puts) {
        toPutFullKeys.add(obj.pkey + "|" + obj.skey);
      }
    }

    if (transactionItems.hardDeleteKeys?.length) {
      const fullKeys = new Set<string>();
      for (let { pkey, skey } of transactionItems.hardDeleteKeys) {
        const fullKey = pkey + "|" + skey;
        if (!toPutFullKeys.has(fullKey)) {
          fullKeys.add(fullKey);
        }
      }
      const qs = "DELETE FROM objects WHERE fullKey IN (?);";
      const qargs = [Array.from(fullKeys)];
      statements.push({ qs, qargs });
    }

    if (transactionItems.hardDeleteEncryptedKeyParams?.length) {
      for (let params of transactionItems.hardDeleteEncryptedKeyParams) {
        const pkey = userEncryptedKeyPkey(params),
          scope = getScope(params);
        let qs = "DELETE FROM objects WHERE pkey = ?";
        const qargs = [pkey];

        if (scope) {
          qs += " AND skey LIKE ?;";
          qargs.push(scope + "%");
        } else {
          qs += ";";
        }
        statements.push({ qs, qargs });
      }
    }

    if (transactionItems.hardDeleteEncryptedBlobParams?.length) {
      for (let params of transactionItems.hardDeleteEncryptedBlobParams) {
        const pkey = encryptedBlobPkey(params),
          scope = getScope(params);
        let qs = "DELETE FROM objects WHERE pkey = ?";
        const qargs = [pkey];

        if (scope) {
          qs += " AND skey LIKE ?;";
          qargs.push(scope + "%");
        } else {
          qs += ";";
        }
        statements.push({ qs, qargs });
      }
    }

    if (transactionItems.hardDeleteScopes?.length) {
      for (let {
        pkey,
        pkeyPrefix,
        scope,
      } of transactionItems.hardDeleteScopes) {
        let qs = "DELETE FROM objects WHERE ";

        if (pkeyPrefix) {
          qs += "pkey LIKE ?";
        } else {
          qs += "pkey = ?";
        }

        const qargs = [pkey + (pkeyPrefix ? "%" : "")];

        if (scope) {
          qs += " AND skey LIKE ?;";
          qargs.push(scope + "%");
        } else {
          qs += ";";
        }
        statements.push({ qs, qargs });
      }
    }

    if (transactionItems.hardDeleteSecondaryIndexScopes?.length) {
      for (let scope of transactionItems.hardDeleteSecondaryIndexScopes) {
        let qs = "DELETE FROM objects WHERE secondaryIndex LIKE ?;";
        const qargs = [scope + "%"];
        statements.push({ qs, qargs });
      }
    }

    if (transactionItems.hardDeleteTertiaryIndexScopes?.length) {
      for (let scope of transactionItems.hardDeleteTertiaryIndexScopes) {
        let qs = "DELETE FROM objects WHERE tertiaryIndex LIKE ?;";
        const qargs = [scope + "%"];
        statements.push({ qs, qargs });
      }
    }

    if (transactionItems.softDeleteKeys?.length) {
      const fullKeys = new Set<string>();
      for (let { pkey, skey } of transactionItems.softDeleteKeys) {
        const fullKey = pkey + "|" + skey;
        if (!toPutFullKeys.has(fullKey)) {
          fullKeys.add(fullKey);
        }
      }

      const qs = "UPDATE objects SET deletedAt = ? WHERE fullKey IN (?);";
      const qargs = [now, Array.from(fullKeys)];
      statements.push({ qs, qargs });
    }

    if (transactionItems.softDeleteScopes?.length) {
      for (let {
        pkey,
        pkeyPrefix,
        scope,
      } of transactionItems.softDeleteScopes) {
        let qs = "UPDATE objects SET deletedAt = ? WHERE ";
        if (pkeyPrefix) {
          qs += "pkey LIKE ?;";
        } else {
          qs += "pkey = ?";
        }
        const qargs = [now, pkey + (pkeyPrefix ? "%" : "")];
        if (scope) {
          qs += " AND skey LIKE ?;";
          qargs.push(scope + "%");
        } else {
          qs += ";";
        }
        statements.push({ qs, qargs });
      }
    }

    if (transactionItems.puts?.length) {
      for (let obj of transactionItems.puts) {
        statements.push(putDbStatement(obj));
      }
    }

    if (transactionItems.updates?.length) {
      for (let [key, obj] of transactionItems.updates) {
        statements.push(updateDbStatement(key, obj));
      }
    }

    if (transactionItems.orderUpdateScopes?.length) {
      for (let [
        { pkey, scope },
        orderIndex,
      ] of transactionItems.orderUpdateScopes) {
        const qs =
          "UPDATE objects SET orderIndex = ? WHERE pkey = ? AND skey LIKE ?;";
        const qargs = [orderIndex, pkey, scope + "%"];
        statements.push({ qs, qargs });
      }
    }

    return statements;
  },
  executeTransactionStatements = async (
    statements: Api.Db.SqlStatement[],
    transactionConn: PoolConnection
  ) => {
    // log("", { statements });

    let qs: string = "",
      qargs: any[] = [];

    let packetSize = 0;

    // const totalSize = Buffer.byteLength(JSON.stringify(statements), "utf8");
    // log(
    //   `executing SQL statements | ${statements.length} statements | total size ${totalSize} bytes`
    // );

    for (let statement of statements) {
      // log("statement: " + format(statement.qs, statement.qargs));

      const statementSize = Buffer.byteLength(
        JSON.stringify(statement),
        "utf8"
      );

      if (statementSize > maxPacketSize) {
        const msg = `SQL statement of size ${statementSize} bytes exceeds maximum packet size of ${maxPacketSize} bytes`;
        log(msg);
        throw new Error(msg);
      }

      if (packetSize + statementSize > maxPacketSize) {
        await execQuery(transactionConn, qs, qargs);
        qs = "";
        qargs = [];
        packetSize = 0;
      }

      qs += statement.qs;
      qargs = qargs.concat(statement.qargs);
      packetSize += statementSize;
    }

    qs += "COMMIT;";
    return execQuery(transactionConn, qs, qargs);
  },
  mergeObjectTransactionItems = (
    transactionItemsList: Api.Db.ObjectTransactionItems[]
  ) => {
    let res: Api.Db.ObjectTransactionItems = {};

    for (let transactionItems of transactionItemsList) {
      if (transactionItems.hardDeleteKeys) {
        res.hardDeleteKeys = (res.hardDeleteKeys ?? []).concat(
          transactionItems.hardDeleteKeys
        );
      }

      if (transactionItems.hardDeleteScopes) {
        res.hardDeleteScopes = (res.hardDeleteScopes ?? []).concat(
          transactionItems.hardDeleteScopes
        );
      }

      if (transactionItems.hardDeleteEncryptedKeyParams) {
        res.hardDeleteEncryptedKeyParams = (
          res.hardDeleteEncryptedKeyParams ?? []
        ).concat(transactionItems.hardDeleteEncryptedKeyParams);
      }

      if (transactionItems.hardDeleteEncryptedBlobParams) {
        res.hardDeleteEncryptedBlobParams = (
          res.hardDeleteEncryptedBlobParams ?? []
        ).concat(transactionItems.hardDeleteEncryptedBlobParams);
      }

      if (transactionItems.hardDeleteSecondaryIndexScopes) {
        res.hardDeleteSecondaryIndexScopes = (
          res.hardDeleteSecondaryIndexScopes ?? []
        ).concat(transactionItems.hardDeleteSecondaryIndexScopes);
      }
      if (transactionItems.hardDeleteTertiaryIndexScopes) {
        res.hardDeleteTertiaryIndexScopes = (
          res.hardDeleteTertiaryIndexScopes ?? []
        ).concat(transactionItems.hardDeleteTertiaryIndexScopes);
      }

      if (transactionItems.softDeleteKeys) {
        res.softDeleteKeys = (res.softDeleteKeys ?? []).concat(
          transactionItems.softDeleteKeys
        );
      }

      if (transactionItems.softDeleteScopes) {
        res.softDeleteScopes = (res.softDeleteScopes ?? []).concat(
          transactionItems.softDeleteScopes
        );
      }

      if (transactionItems.puts) {
        res.puts = (res.puts ?? []).concat(transactionItems.puts);
      }

      if (transactionItems.updates) {
        res.updates = (res.updates ?? []).concat(transactionItems.updates);
      }

      if (transactionItems.orderUpdateScopes) {
        res.orderUpdateScopes = (res.orderUpdateScopes ?? []).concat(
          transactionItems.orderUpdateScopes
        );
      }
    }

    return res;
  },
  objectTransactionItemsEmpty = (
    transactionItems: Api.Db.ObjectTransactionItems
  ) =>
    (transactionItems.hardDeleteKeys?.length ?? 0) +
      (transactionItems.hardDeleteEncryptedKeyParams?.length ?? 0) +
      (transactionItems.hardDeleteScopes?.length ?? 0) +
      (transactionItems.hardDeleteSecondaryIndices?.length ?? 0) +
      (transactionItems.hardDeleteTertiaryIndices?.length ?? 0) +
      (transactionItems.hardDeleteSecondaryIndexScopes?.length ?? 0) +
      (transactionItems.hardDeleteTertiaryIndexScopes?.length ?? 0) +
      (transactionItems.softDeleteKeys?.length ?? 0) +
      (transactionItems.softDeleteScopes?.length ?? 0) +
      (transactionItems.puts?.length ?? 0) +
      (transactionItems.updates?.length ?? 0) +
      (transactionItems.orderUpdateScopes?.length ?? 0) ===
    0,
  resolveMaxPacketSize = async () => {
    const res = await pool.query("SELECT @@GLOBAL.max_allowed_packet;");
    const [[{ "@@GLOBAL.max_allowed_packet": dbMaxAllowedPacket }]] = res as [
      any[],
      any
    ];
    maxPacketSize = dbMaxAllowedPacket * 0.95; // leave a little breathing room
    log("maxPacketSize:", { maxPacketSize });
  },
  releaseTransaction = async (conn: PoolConnection) => {
    await conn.release();
  };
