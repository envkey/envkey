import { pick } from "@core/lib/utils/object";
import { query } from "../db";
import * as graphKey from "../graph_key";
import { Api, Crypto } from "@core/types";
import mysql from "mysql2/promise";
import * as R from "ramda";
import { graphTypes } from "@core/lib/graph";
import produce from "immer";

export const updateTrustedRoot = async (
  orgId: string,
  target: Api.Db.CliUser | Api.Db.OrgUserDevice | Api.Db.GeneratedEnvkey,
  replacementIds: string[],
  signedTrustedRoot: Crypto.SignedData,
  now: number,
  transactionConn: mysql.PoolConnection
) => {
  const graphKeys = replacementIds.map((id) =>
    graphKey.rootPubkeyReplacement(orgId, id)
  );

  const replacements = await query<Api.Db.RootPubkeyReplacement>({
    pkey: graphKeys.map(R.prop("pkey")),
    scope: graphKeys.map(R.prop("skey")),
    transactionConn,
  });

  if (!replacements || replacements.length == 0) {
    throw new Api.ApiError("Root pubkey replacement missing", 404);
  }

  const updates: Api.Db.ObjectTransactionItems["updates"] = [];

  for (let replacement of replacements) {
    if (
      replacement.deletedAt ||
      replacement.processedAtById[target.id] !== false
    ) {
      throw new Api.ApiError(
        "Root pubkey already processed or not valid for this user / device",
        400
      );
    }

    const replacementProcessedAtById = {
      ...replacement.processedAtById,
      [target.id]: now,
    };

    const replacementProcessedAll = R.all(
      Boolean,
      Object.values(replacementProcessedAtById)
    );

    const updatedReplacement: Api.Db.RootPubkeyReplacement = {
      ...replacement,
      processedAtById: replacementProcessedAtById,
      updatedAt: now,
      deletedAt: replacementProcessedAll ? now : undefined,
    };

    updates.push([pick(["pkey", "skey"], replacement), updatedReplacement]);
  }

  const transactionItems: Api.Db.ObjectTransactionItems = {
    puts: [
      {
        ...target,
        signedTrustedRoot: signedTrustedRoot,
        trustedRootUpdatedAt: now,
      } as typeof target,
    ],
    updates,
  };

  return {
    type: <const>"handlerResult",
    response: { type: <const>"success" },
    transactionItems,
    logTargetIds: [],
  };
};

export const clearOrphanedRootPubkeyReplacements = (
  orgGraph: Api.Graph.OrgGraph,
  now: number
) =>
  produce(orgGraph, (draft) => {
    const replacements = graphTypes(orgGraph)
      .rootPubkeyReplacements as Api.Db.RootPubkeyReplacement[];

    for (let replacement of replacements) {
      const replacementDraft = draft[
        replacement.id
      ] as Api.Db.RootPubkeyReplacement;
      for (let keyableId of Object.keys(replacementDraft.processedAtById)) {
        const keyable = orgGraph[keyableId];
        if (
          !keyable ||
          keyable.deletedAt ||
          ("deactivatedAt" in keyable && keyable.deactivatedAt)
        ) {
          delete replacementDraft.processedAtById[keyableId];
        }
      }

      if (R.all(Boolean, Object.values(replacementDraft.processedAtById))) {
        replacementDraft.deletedAt = now;
      }
    }
  });
