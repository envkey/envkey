import { query, getDb } from "../db";
import { Api } from "@core/types";
import { PoolConnection } from "mysql2/promise";

export const getUserIdsWithEmail = async (
    email: string,
    orgId: string | undefined,
    transactionConn: PoolConnection
  ) =>
    query<Api.Db.OrgUserIdByEmail>({
      pkey: ["email", email].join("|"),
      scope: orgId,
      transactionConn,
    }),
  getUserIdByProviderUid = async (
    providerUid: string,
    orgId: string,
    transactionConn: PoolConnection
  ) =>
    getDb<Api.Db.OrgUserIdByProviderUid>(
      {
        pkey: ["provider", providerUid].join("|"),
        skey: orgId,
      },
      { transactionConn }
    );
