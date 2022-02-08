import {
  objectDifference,
  objectIntersection,
  objectPaths,
} from "../utils/object";
import { Blob, Api, Graph, Model } from "../../types";
import set from "lodash.set";
import * as R from "ramda";
import * as g from "../graph";

export const userEncryptedKeyPkey = (params: Blob.UserEncryptedKeyPkeyParams) =>
    [
      "encryptedKeys",
      ...R.props(["orgId", "userId", "deviceId"], params).filter(Boolean),
    ].join("|"),
  getSkeyOrScope = (params: Blob.ScopeParams | Blob.SkeyParams) => {
    const path: string[] = [];

    if (params.blobType) {
      path.push(params.blobType);
    }

    if (params.blobType && params.envParentId) {
      path.push(params.envParentId);

      if (params.blobType == "env") {
        if (params.environmentId) {
          path.push(params.environmentId);

          if (params.envPart) {
            path.push(params.envPart);

            if ("envType" in params) {
              path.push(params.envType);

              if (params.envType == "inheritanceOverrides") {
                path.push(params.inheritsEnvironmentId);
              }
            }
          }
        }
      } else if (params.environmentId) {
        path.push(params.environmentId);
      }

      if (params.blobType == "changeset" && "id" in params && params.id) {
        path.push(params.id);
      }
    }

    return path.join("|") || undefined;
  },
  getScope = (params: Blob.ScopeParams) => getSkeyOrScope(params),
  getSkey = (params: Blob.SkeyParams) => getSkeyOrScope(params),
  encryptedBlobPkey = (params: Blob.EncryptedBlobPkeyParams) =>
    ["encryptedBlobs", params.orgId].join("|"),
  keySetDifference = (set1: Blob.KeySet, set2: Blob.KeySet): Blob.KeySet => {
    return {
      ...objectDifference(set1, set2),
      type: "keySet",
    };
  },
  keySetIntersection = (set1: Blob.KeySet, set2: Blob.KeySet): Blob.KeySet => {
    return {
      ...objectIntersection(set1, set2),
      type: "keySet",
    };
  },
  keySetIsSubset = (maybeSubset: Blob.KeySet, maybeSuperset: Blob.KeySet) =>
    !R.equals(keySetDifference(maybeSubset, maybeSuperset), {
      type: "keySet",
    }),
  keySetEmpty = (keySet: Blob.KeySet) => R.equals(keySet, { type: "keySet" }),
  mergeKeySets = (res1: Blob.KeySet, res2: Blob.KeySet): Blob.KeySet =>
    R.mergeDeepWith(
      (l, r) =>
        Array.isArray(l) && Array.isArray(r)
          ? Array.from(new Set([...l, ...r]))
          : r,
      res1,
      res2
    ),
  getBlobParamsEnvParentIds = (blobs: Api.Net.EnvParams["blobs"]) => {
    const envParentIds = new Set<string>();

    for (let envParentId in blobs) {
      envParentIds.add(envParentId);
    }

    return envParentIds;
  },
  getBlobParamsEnvironmentAndLocalIds = (blobs: Api.Net.EnvParams["blobs"]) => {
    const ids = new Set<string>();

    for (let envParentId in blobs) {
      const { environments, locals } = blobs[envParentId];
      if (environments) {
        for (let environmentId in environments) {
          ids.add(environmentId);
        }
      }
      if (locals) {
        for (let localsUserId in locals) {
          ids.add([envParentId, localsUserId].join("|"));
        }
      }
    }

    return ids;
  },
  getGeneratedEnvkeyEncryptedKeyOrBlobComposite = ({
    blockId,
    environmentId,
    envType,
    inheritsEnvironmentId,
  }: Blob.GeneratedEnvkeyEncryptedKey | Blob.EncryptedBlob) =>
    [blockId, environmentId, envType, inheritsEnvironmentId]
      .filter(Boolean)
      .join("||"),
  getUserEncryptedKeyOrBlobComposite = ({
    environmentId,
    envPart,
    inheritsEnvironmentId,
  }:
    | Blob.UserEncryptedKey
    | Blob.EncryptedBlob
    | (Pick<Blob.UserEncryptedKey | Blob.EncryptedBlob, "envPart"> & {
        environmentId: string;
        inheritsEnvironmentId?: string;
      })) =>
    [environmentId, envPart ?? "env", inheritsEnvironmentId]
      .filter(Boolean)
      .join("||"),
  parseUserEncryptedKeyOrBlobComposite = (composite: string) => {
    const [environmentId, envPart, inheritsEnvironmentId] =
      composite.split("||");
    return {
      environmentId,
      inheritsEnvironmentId,
      envPart,
    } as Required<
      Pick<Blob.UserEncryptedKey | Blob.EncryptedBlob, "envPart">
    > & {
      environmentId: string;
      inheritsEnvironmentId?: string;
    };
  },
  filterKeySetByBlobPaths = (
    graph: Graph.Graph,
    keySet: Blob.KeySet,
    blobPaths: Set<string>
  ) => {
    let filteredKeySet: Blob.KeySet = { type: "keySet" };

    if (keySet.users) {
      for (let userId in keySet.users) {
        for (let deviceId in keySet.users[userId]) {
          const paths = objectPaths(keySet.users[userId][deviceId]);
          const filtered = paths.filter((path) =>
            blobPaths.has(path.join("|"))
          );
          for (let path of filtered) {
            set(filteredKeySet, ["users", userId, deviceId, ...path], true);
          }
        }
      }
    }

    if (keySet.blockKeyableParents) {
      for (let blockId in keySet.blockKeyableParents) {
        for (let keyableParentId in keySet.blockKeyableParents[blockId]) {
          const keyableParent = graph[keyableParentId] as Model.KeyableParent;

          const [blockEnvironment] = g.getConnectedBlockEnvironmentsForApp(
            graph,
            keyableParent.appId,
            blockId,
            keyableParent.environmentId
          );

          if (
            blobPaths.has(
              [blockId, "environments", blockEnvironment.id, "env"].join("|")
            ) ||
            (keyableParent.type == "localKey" &&
              blobPaths.has(
                [blockId, "locals", keyableParent.userId, "env"].join("|")
              ))
          ) {
            set(
              filteredKeySet,
              ["blockKeyableParents", blockId, keyableParent.id],
              true
            );
          }
        }
      }
    }

    if (keySet.keyableParents) {
      for (let keyableParentId in keySet.keyableParents) {
        const keyableParent = graph[keyableParentId] as Model.KeyableParent;

        if (
          blobPaths.has(
            [
              keyableParent.appId,
              "environments",
              keyableParent.environmentId,
              "env",
            ].join("|")
          ) ||
          (keyableParent.type == "localKey" &&
            blobPaths.has(
              [keyableParent.appId, "locals", keyableParent.userId, "env"].join(
                "|"
              )
            ))
        ) {
          set(filteredKeySet, ["keyableParents", keyableParent.id], true);
        }
      }
    }

    return filteredKeySet;
  },
  getUpdatedEnvironmentIdsForKeySet = (keySet: Blob.KeySet): string[] => {
    const environmentIds = new Set<string>();

    if (keySet.users) {
      for (let userId in keySet.users) {
        for (let deviceId in keySet.users[userId]) {
          for (let envParentId in keySet.users[userId][deviceId]) {
            const { environments, locals } =
              keySet.users[userId][deviceId][envParentId];

            for (let environmentId in environments ?? {}) {
              environmentIds.add(environmentId);
            }

            for (let userId in locals ?? {}) {
              environmentIds.add([envParentId, userId].join("|"));
            }
          }
        }
      }
    }

    return Array.from(environmentIds);
  },
  getUpdatedEnvironmentIdsForBlobSet = (blobSet: Blob.BlobSet): string[] => {
    const environmentIds = new Set<string>();

    for (let envParentId in blobSet) {
      const { environments, locals } = blobSet[envParentId];

      for (let environmentId in environments ?? {}) {
        environmentIds.add(environmentId);
      }

      for (let userId in locals ?? {}) {
        environmentIds.add([envParentId, userId].join("|"));
      }
    }

    return Array.from(environmentIds);
  };
