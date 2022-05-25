import { getDb, query } from "../db";
import { Api } from "@core/types";
import { PoolConnection } from "mysql2/promise";
import * as graphKey from "../graph_key";
import * as R from "ramda";
import { wait } from "@core/lib/utils/wait";

export const getOrg = async <T extends Api.Db.Org>(
  id: string,
  transactionConn: PoolConnection | undefined,
  forUpdate = false
) =>
  getDb<T>(graphKey.org(id), {
    transactionConn,
    lockType: forUpdate ? "FOR UPDATE" : undefined,
  });

export const getOrgUser = async <T extends Api.Db.OrgUser>(
  orgId: string,
  userId: string,
  transactionConn: PoolConnection | undefined
) =>
  getDb<T>(graphKey.orgUser(orgId, userId), {
    transactionConn,
  });

export const getAllOrgs = async (transactionConn: PoolConnection) => {
  return query<Api.Db.Org>({
    scope: "g|org$",
    transactionConn,
  });
};

export const processAllOrgUsersInBatches = async <
  OrgUserType extends Api.Db.OrgUser = Api.Db.OrgUser,
  OrgType extends Api.Db.Org = Api.Db.Org
>(
  params: {
    batchSize: number;
    batchDelay: number;
    tertiaryIndex?: string;
  },
  processFn: (
    orgs: OrgType[],
    orgUsersByOrgId: Record<string, OrgUserType[] | undefined>
  ) => Promise<void>
) => {
  const { batchSize, batchDelay, tertiaryIndex } = params;

  let batchNum = 0;

  while (true) {
    const orgUsers = await query<OrgUserType>({
      scope: "g|orgUser|",
      transactionConn: undefined,
      tertiaryIndex,
      limit: batchSize,
      offset: batchNum * batchSize,
    });

    if (orgUsers.length > 0) {
      const orgIds = R.uniq(orgUsers.map(R.prop("pkey")));
      const orgs = await query<OrgType>({
        pkey: orgIds,
        scope: "g|org$",
        transactionConn: undefined,
      });

      await processFn(orgs, R.groupBy(R.prop("pkey"), orgUsers));
    }

    if (orgUsers.length < batchSize) {
      break;
    }

    await wait(batchDelay);

    batchNum++;
  }
};
