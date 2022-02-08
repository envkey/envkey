import * as R from "ramda";
import { graphObjects, graphTypes } from "./base";
import { getOrgUserDevicesByUserId } from "./indexed_graph";
import { Graph, Model } from "../../types";
import memoize from "../../lib/utils/memoize";
import { log } from "../utils/logger";
import { getObjectName } from "./names";

export const getKeyablesByPubkeyId = memoize((graph: Graph.Graph) => {
  const byPubkeyId: Record<string, Graph.GraphObject> = {};

  const objects = graphObjects(graph);

  for (let obj of objects) {
    if ("pubkeyId" in obj) {
      byPubkeyId[obj.pubkeyId] = obj;
    }
  }

  return byPubkeyId;
});

export const getEncryptedByEnvironmentIds = memoize(
  (graph: Graph.Graph, encryptedById: string) => {
    const environmentIds: string[] = [];
    const { environments } = graphTypes(graph);

    for (let environment of environments) {
      if (environment.encryptedById === encryptedById) {
        environmentIds.push(environment.id);
      }
    }

    return environmentIds;
  }
);

export const getEncryptedByLocalIds = memoize(
  (graph: Graph.Graph, encryptedById: string) => {
    const localIds: string[] = [];
    const { apps, blocks } = graphTypes(graph);

    for (let envParent of [...apps, ...blocks]) {
      for (let localsUserId in envParent.localsEncryptedBy) {
        if (envParent.localsEncryptedBy[localsUserId] === encryptedById) {
          localIds.push(envParent.id + "|" + localsUserId);
        }
      }
    }

    return localIds;
  }
);

export const getSignedByKeyableIds = memoize(
  (graph: Graph.Graph, signedById: string) => {
    const keyableIds: string[] = [];

    for (let obj of graphObjects(graph)) {
      if ("signedById" in obj && obj.signedById === signedById) {
        keyableIds.push(obj.id);
      }
    }

    return keyableIds;
  }
);

export const getSignedByNonLocalKeyableIds = memoize(
  (graph: Graph.Graph, signedById: string) => {
    const keyableIds: string[] = [];

    for (let obj of graphObjects(graph)) {
      if (
        "signedById" in obj &&
        obj.signedById === signedById &&
        !(obj.type == "generatedEnvkey" && obj.keyableParentType == "localKey")
      ) {
        keyableIds.push(obj.id);
      }
    }

    return keyableIds;
  }
);

export const getUserIsImmediatelyDeletable = (
  graph: Graph.Graph,
  userId: string
) => {
  const user = graph[userId] as Model.CliUser | Model.OrgUser;

  if (user.type == "orgUser" && !user.isCreator && !user.inviteAcceptedAt) {
    return true;
  }

  const targetIds =
    user.type == "cliUser"
      ? [user.id]
      : (getOrgUserDevicesByUserId(graph)[user.id] ?? []).map(R.prop("id"));

  return targetIds.every((targetId) =>
    getDeviceIsImmediatelyDeletable(graph, targetId, true)
  );
};

export const getDeviceIsImmediatelyDeletable = (
  graph: Graph.Graph,
  deviceId: string,
  excludeLocalKeys?: true
) => {
  const encryptedByEnvironmentIds = getEncryptedByEnvironmentIds(
    graph,
    deviceId
  );
  const encryptedByLocalIds = getEncryptedByLocalIds(graph, deviceId);
  const signedByKeyableIds = (
    excludeLocalKeys ? getSignedByNonLocalKeyableIds : getSignedByKeyableIds
  )(graph, deviceId);

  const encryptedOrSignedIds = [
    ...encryptedByEnvironmentIds,
    ...encryptedByLocalIds,
    ...signedByKeyableIds,
  ];

  return encryptedOrSignedIds.length === 0;
};
