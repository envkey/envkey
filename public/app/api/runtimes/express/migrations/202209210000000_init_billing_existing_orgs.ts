import { log, logStderr } from "@core/lib/utils/logger";
import { env } from "../../../shared/src/env";
import * as Knex from "knex";
import {
  getNewTransactionConn,
  releaseTransaction,
  query,
  getPoolConn,
} from "../../../shared/src/db";
import { getAllOrgs } from "../../../shared/src/models/orgs";
import {
  executeTransactionStatements,
  objectTransactionStatements,
} from "../../../shared/src/db_fns";
import { Api } from "@core/types";
import { PoolConnection } from "mysql2/promise";

let initBillingFn:
  | ((
      transactionConn: PoolConnection,
      org: Api.Db.Org,
      orgUser: Api.Db.OrgUser,
      orgGraph: Api.Graph.OrgGraph,
      now: number,
      v1Upgrade?: Api.V1Upgrade.Upgrade
    ) => Promise<[Api.Graph.OrgGraph, Api.Db.ObjectTransactionItems]>)
  | undefined;
export const registerInitBillingMigrationFn = (fn: typeof initBillingFn) => {
  initBillingFn = fn;
};

export const up = async (knex: Knex) => {
  if (env.IS_CLOUD) {
    if (!initBillingFn) {
      throw new Error("initBillingFn not registered");
    }

    log(
      "Initializing billing for existing orgs that don't already have a custom license..."
    );

    const poolConn = await getPoolConn();
    let orgs: Api.Db.Org[];

    try {
      orgs = await getAllOrgs(poolConn);
    } finally {
      await poolConn.release();
    }

    for (let org of orgs) {
      if (org.signedLicense) {
        continue;
      }

      const now = Date.now();
      const transactionConn = await getNewTransactionConn();

      try {
        log(`Initializing billing for org '${org.name}'...`);

        const [orgRoles, orgUsers] = await Promise.all([
          query<Api.Db.OrgRole>({
            pkey: org.id,
            scope: "g|orgRole|",
            transactionConn,
          }),
          query<Api.Db.OrgUser>({
            pkey: org.id,
            scope: "g|orgUser|",
            transactionConn,
          }),
        ]);

        const ownerRole = orgRoles.find((role) => role.name == "Org Owner");
        if (!ownerRole) {
          throw new Error("Couldn't find owner role for org: " + org.name);
        }

        const owners = orgUsers.filter(
          (orgUser) => (orgUser.orgRoleId = ownerRole.id)
        );

        if (owners.length == 0) {
          throw new Error("Couldn't find owner for org: " + org.name);
        }

        let owner: Api.Db.OrgUser;
        const creatorOwner = owners.find((owner) => owner.id == org.creatorId);
        owner = creatorOwner ?? owners[0];

        const [_, transactionItems] = await initBillingFn(
          transactionConn,
          org,
          owner,
          {},
          now
        );
        await executeTransactionStatements(
          objectTransactionStatements(transactionItems, now),
          transactionConn
        );
      } catch (err) {
        logStderr("Error initializing stripe customer", { org, err });
      } finally {
        await releaseTransaction(transactionConn);
      }
    }
  }
};

export const down = async (knex: Knex) => {};
