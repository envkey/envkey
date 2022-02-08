import { getDb, query } from "../db";
import { Api } from "@core/types";
import { PoolConnection } from "mysql2/promise";
import * as graphKey from "../graph_key";

export const getOrg = async (
  id: string,
  transactionConn: PoolConnection | undefined,
  forUpdate = false
) =>
  getDb<Api.Db.Org>(graphKey.org(id), {
    transactionConn,
    lockType: forUpdate ? "FOR UPDATE" : undefined,
  });

export const getOrgUser = async (
  orgId: string,
  userId: string,
  transactionConn: PoolConnection | undefined
) =>
  getDb<Api.Db.OrgUser>(graphKey.orgUser(orgId, userId), {
    transactionConn,
  });

export const getAllOrgs = async (transactionConn: PoolConnection) => {
  return query<Api.Db.Org>({
    scope: "g|org$",
    transactionConn,
  });
};
