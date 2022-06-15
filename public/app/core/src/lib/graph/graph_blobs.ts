import { Graph, Blob, Model, Rbac } from "../../types";
import {
  graphTypes,
  authz,
  getEnvParentPermissions,
  getOrgPermissions,
  getConnectedBlockEnvironmentsForApp,
} from ".";
import memoize from "../utils/memoize";

export const getRequiredBlobPathsForDeleteEncryptedKeys = (
  graph: Graph.Graph,
  userId: string,
  toDeleteEncryptedKeys: Blob.KeySet
) => {
  const blobPaths = new Set<string>();

  const addBlobPaths = (
    envParentId: string,
    environmentType: "environments" | "locals",
    environmentOrLocalsUserId: string,
    blobType: "env" | "changeset",
    envParts: ("env" | "meta" | "inherits")[] = ["env", "meta", "inherits"]
  ) => {
    if (blobType == "env") {
      for (let envPart of envParts) {
        blobPaths.add(
          envParentId +
            "|" +
            environmentType +
            "|" +
            environmentOrLocalsUserId +
            "|" +
            envPart
        );
      }
    } else {
      blobPaths.add(
        envParentId +
          "|" +
          environmentType +
          "|" +
          environmentOrLocalsUserId +
          "|" +
          "changesetsById"
      );
    }
  };

  if (toDeleteEncryptedKeys.users) {
    for (let userId in toDeleteEncryptedKeys.users) {
      for (let deviceId in toDeleteEncryptedKeys.users[userId]) {
        for (let envParentId in toDeleteEncryptedKeys.users[userId][deviceId]) {
          const { environments, locals } =
            toDeleteEncryptedKeys.users[userId][deviceId][envParentId];

          const envParent = graph[envParentId] as Model.EnvParent;

          if (!envParent || envParent.deletedAt) {
            continue;
          }

          const envParentPermissions = getEnvParentPermissions(
            graph,
            envParentId
          );

          if (environments) {
            for (let environmentId in environments) {
              const environment = graph[environmentId] as Model.Environment;

              if (!environment || environment.deletedAt) {
                continue;
              }

              if (authz.canUpdateEnv(graph, userId, environmentId)) {
                const envProps = environments[environmentId];

                if (envProps.env || envProps.meta || envProps.inherits) {
                  addBlobPaths(
                    envParentId,
                    "environments",
                    environmentId,
                    "env"
                  );
                }

                if (envProps.changesets) {
                  addBlobPaths(
                    envParentId,
                    "environments",
                    environmentId,
                    "changeset"
                  );
                }
              }
            }
          }

          if (locals) {
            for (let localsUserId in locals) {
              const localsUser = graph[localsUserId] as
                | Model.OrgUser
                | Model.CliUser
                | undefined;
              if (
                !localsUser ||
                localsUser.deletedAt ||
                localsUser.deactivatedAt
              ) {
                continue;
              }

              const orgPermissions = getOrgPermissions(
                graph,
                localsUser.orgRoleId
              );

              if (
                !(
                  (envParent.type == "block" &&
                    orgPermissions.has("blocks_read_all")) ||
                  envParentPermissions.has("app_read_own_locals")
                )
              ) {
                continue;
              }

              if (
                authz.canUpdateLocals(graph, userId, envParentId, localsUserId)
              ) {
                const localsProps = locals[localsUserId];

                if (localsProps.env || localsProps.meta) {
                  addBlobPaths(envParentId, "locals", localsUserId, "env");
                }

                if (localsProps.changesets) {
                  addBlobPaths(
                    envParentId,
                    "locals",
                    localsUserId,
                    "changeset"
                  );
                }
              }
            }
          }
        }
      }
    }
  }

  if (toDeleteEncryptedKeys.blockKeyableParents) {
    for (let blockId in toDeleteEncryptedKeys.blockKeyableParents) {
      for (let keyableParentId in toDeleteEncryptedKeys.blockKeyableParents[
        blockId
      ]) {
        const keyableParent = graph[keyableParentId] as Model.KeyableParent;

        if (!keyableParent || keyableParent.deletedAt) {
          continue;
        }

        const [blockEnvironment] = getConnectedBlockEnvironmentsForApp(
          graph,
          keyableParent.appId,
          blockId,
          keyableParent.environmentId
        );

        if (authz.canUpdateEnv(graph, userId, blockEnvironment.id)) {
          addBlobPaths(blockId, "environments", blockEnvironment.id, "env", [
            "env",
          ]);
        }

        if (keyableParent.type == "localKey") {
          if (
            authz.canUpdateLocals(graph, userId, blockId, keyableParent.userId)
          ) {
            addBlobPaths(blockId, "locals", keyableParent.userId, "env", [
              "env",
            ]);
          }
        }
      }
    }
  }

  if (toDeleteEncryptedKeys.keyableParents) {
    for (let keyableParentId in toDeleteEncryptedKeys.keyableParents) {
      const keyableParent = graph[keyableParentId] as Model.KeyableParent;

      if (!keyableParent || keyableParent.deletedAt) {
        continue;
      }

      if (authz.canUpdateEnv(graph, userId, keyableParent.environmentId)) {
        addBlobPaths(
          keyableParent.appId,
          "environments",
          keyableParent.environmentId,
          "env",
          ["env"]
        );
      }

      if (keyableParent.type == "localKey") {
        if (
          authz.canUpdateLocals(
            graph,
            userId,
            keyableParent.appId,
            keyableParent.userId
          )
        ) {
          addBlobPaths(
            keyableParent.appId,
            "locals",
            keyableParent.userId,
            "env",
            ["env"]
          );
        }
      }
    }
  }

  return blobPaths;
};

export const getEnvironmentsQueuedForReencryptionIds = memoize(
  (graph: Graph.Graph, currentUserId: string) => {
    const user = graph[currentUserId] as Model.OrgUser;
    if (!user) {
      return [];
    }
    const role = graph[user.orgRoleId] as Rbac.OrgRole;

    // quick fix for tricky issue with allowing basic users to re-encrypt
    // now only org owners and org admins can re-encrypt
    if (role.defaultName != "Org Owner" && role.defaultName != "Org Admin") {
      return [];
    }

    const { apps, blocks, environments } = graphTypes(graph);
    const ids: string[] = [];

    for (let environment of environments) {
      if (environment.reencryptionRequiredAt) {
        if (
          authz.canUpdateEnv(graph, currentUserId, environment.id) &&
          environment.envUpdatedAt
        ) {
          ids.push(environment.id);
        }
      }
    }

    for (let envParent of [...apps, ...blocks]) {
      for (let localsUserId in envParent.localsReencryptionRequiredAt) {
        if (
          authz.canUpdateLocals(
            graph,
            currentUserId,
            envParent.id,
            localsUserId
          ) &&
          envParent.localsUpdatedAtByUserId[localsUserId]
        ) {
          ids.push(envParent.id + "|" + localsUserId);
        }
      }
    }

    return ids;
  }
);

export const getBlobSetNumUpdatedSummary = (
  graph: Graph.Graph,
  blobSet: Blob.BlobSet
) => {
  let numApps = 0;
  let numBlocks = 0;
  let numEnvironments = 0;

  const countedIds = new Set<string>();

  for (let envParentId in blobSet) {
    const envParent = graph[envParentId] as Model.EnvParent;
    const { environments, locals } = blobSet[envParentId];

    if (!countedIds.has(envParentId)) {
      if (envParent.type == "app") {
        numApps++;
      } else {
        numBlocks++;
      }
      countedIds.add(envParentId);
    }

    for (let environmentId in environments) {
      if (!countedIds.has(environmentId)) {
        numEnvironments++;
        countedIds.add(environmentId);
      }
    }

    for (let localsUserId in locals) {
      numEnvironments++;
      countedIds.add(envParentId + "|" + localsUserId);
    }
  }

  let s = "";
  if (numApps && numBlocks) {
    s += `${numApps} app${numApps > 1 ? "s" : ""}, ${numBlocks} block${
      numBlocks > 1 ? "s" : ""
    }`;
  } else if (numApps) {
    s += `${numApps} app${numApps > 1 ? "s" : ""}`;
  } else if (numBlocks) {
    s += `${numBlocks} block${numBlocks > 1 ? "s" : ""}`;
  }

  s += `, ${numEnvironments} environment${numEnvironments > 1 ? "s" : ""}`;

  return s;
};
