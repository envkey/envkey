import { getCurrentEncryptedKeys } from "../graph/current_encrypted_keys";
import { Client, Model, Rbac } from "../../types";
import { parseUserEncryptedKeyOrBlobComposite } from "../blob";
import { Draft } from "immer";
import { authz } from "../graph";

type BlobState = Pick<
  Client.State,
  "graph" | "envsFetchedAt" | "changesetsFetchedAt"
> & {
  envs: string[];
  changesets: string[];
};

export const clearOrphanedBlobPaths = (
  blobState: BlobState,
  currentUserId: string,
  currentDeviceId: string
) => {
  const paths: string[][] = [];

  const envParentIds = new Set(
    Object.keys(blobState.envsFetchedAt).concat(
      Object.keys(blobState.changesetsFetchedAt)
    )
  );

  const currentUserEncryptedKeys = getCurrentEncryptedKeys(
    blobState.graph,
    {
      envParentIds,
      userIds: new Set([currentUserId]),
      deviceIds: new Set([currentDeviceId]),
    },
    Date.now(),
    true
  ).users?.[currentUserId]?.[currentDeviceId];

  for (let composite of blobState.envs) {
    const { environmentId } = parseUserEncryptedKeyOrBlobComposite(composite);
    if (blobState.graph[environmentId]) {
      const { envParentId } = blobState.graph[
          environmentId
        ] as Model.Environment,
        blob =
          currentUserEncryptedKeys?.[envParentId]?.environments?.[
            environmentId
          ];
      if (!blob || !(blob.env || blob.meta || blob.inherits)) {
        paths.push(["envs", composite]);
      }
    } else {
      const [envParentId, localsUserId] = environmentId.split("|"),
        blob = currentUserEncryptedKeys?.[envParentId]?.locals?.[localsUserId];
      if (blobState.graph[envParentId]) {
        if (!blob || !blob.env) {
          paths.push(["envs", composite]);
        }
      } else {
        paths.push(["envs", composite]);
      }
    }
  }

  for (let envParentId in blobState.envsFetchedAt) {
    if (blobState.graph[envParentId]) {
      if (!currentUserEncryptedKeys?.[envParentId]) {
        paths.push(["envsFetchedAt", envParentId]);
      }
    } else {
      paths.push(["envsFetchedAt", envParentId]);
    }
  }

  for (let environmentId of blobState.changesets) {
    if (blobState.graph[environmentId]) {
      const { envParentId } = blobState.graph[
          environmentId
        ] as Model.Environment,
        blob =
          currentUserEncryptedKeys?.[envParentId]?.environments?.[
            environmentId
          ];
      if (!blob || !blob.changesets) {
        paths.push(["changesets", environmentId]);
      }
    } else {
      const [envParentId, localsUserId] = environmentId.split("|"),
        blob = currentUserEncryptedKeys?.[envParentId]?.locals?.[localsUserId];
      if (blobState.graph[envParentId]) {
        if (!blob || !blob.env) {
          paths.push(["changesets", environmentId]);
        }
      } else {
        paths.push(["changesets", environmentId]);
      }
    }
  }

  for (let envParentId in blobState.changesetsFetchedAt) {
    if (blobState.graph[envParentId]) {
      if (!currentUserEncryptedKeys?.[envParentId]) {
        paths.push(["changesetsFetchedAt", envParentId]);
      }
    } else {
      paths.push(["changesetsFetchedAt", envParentId]);
    }
  }

  return paths;
};

export const clearOrphanedEnvUpdatesProducer = (
  draft: Draft<Client.PartialAccountState>,
  currentUserId: string
): void => {
  draft.pendingEnvUpdates = draft.pendingEnvUpdates.filter((update) => {
    const envParent = draft.graph[update.meta.envParentId];
    if (!envParent) {
      return false;
    }

    const environment = draft.graph[update.meta.environmentId];
    if (environment) {
      if (!authz.canUpdateEnv(draft.graph, currentUserId, environment.id)) {
        return false;
      }
    } else {
      const [envParentId, localsUserId] = update.meta.environmentId.split("|");
      if (
        !envParentId ||
        !localsUserId ||
        !draft.graph[envParentId] ||
        !draft.graph[localsUserId]
      ) {
        return false;
      }

      if (
        !authz.canUpdateLocals(
          draft.graph,
          currentUserId,
          envParentId,
          localsUserId
        )
      ) {
        return false;
      }
    }

    return true;
  });
};
