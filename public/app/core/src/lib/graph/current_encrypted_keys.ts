import { log } from "./../utils/logger";
import { Graph, Rbac, Model, Blob } from "../../types";
import * as R from "ramda";
import { getActiveGraph, graphTypes } from "./base";
import {
  getEnvParentPermissions,
  getOrgPermissions,
  getEnvironmentPermissions,
} from "./permissions";
import { getDeviceIdsForUser } from "./devices";
import {
  getConnectedBlocksForApp,
  getConnectedBlockEnvironmentsForApp,
} from "./app_blocks";
import memoize from "../utils/memoize";
import { getScoped } from "./scoped";
import set from "lodash.set";
import { getObjectName } from "./names";

export const getCurrentEncryptedKeys = memoize(
  (
    graph: Graph.Graph,
    scope: Rbac.OrgAccessScope,
    now: number,
    skipFilterActive = false
  ): Blob.KeySet => {
    // log("getCurrentEncryptedKeys");
    const start = Date.now();

    let keys: Blob.KeySet = { type: "keySet" };

    const active = skipFilterActive ? graph : getActiveGraph(graph);

    const activeByType = graphTypes(skipFilterActive ? graph : active);

    // log("activeByType " + (Date.now() - start).toString());

    const allUsers = [...activeByType.orgUsers, ...activeByType.cliUsers];

    // log("allUsers " + (Date.now() - start).toString());

    let {
      scopeUsers,
      scopeApps,
      scopeBlocks,
      scopeEnvironments,
      scopeGeneratedEnvkeys,
    } = getScoped(active, scope);

    scopeUsers = scopeUsers.filter(({ deactivatedAt }) => !deactivatedAt);

    const scopeEnvParents = [...scopeApps, ...scopeBlocks];

    // log("getScoped " + (Date.now() - start).toString());

    const deviceIdsByUserId: Record<string, string[] | undefined> = {};

    const addUserPath = (
      userId: string,
      path: [string, "environments" | "locals", string, keyof Blob.UserEnvSet]
    ) => {
      let deviceIds = deviceIdsByUserId[userId];

      if (!deviceIds) {
        deviceIds = getDeviceIdsForUser(active, userId, now);
        if (scope != "all" && scope.deviceIds && scope.deviceIds != "all") {
          deviceIds = deviceIds.filter((id) =>
            (scope.deviceIds as Set<string>).has(id)
          );
        }
        deviceIdsByUserId[userId] = deviceIds;
      }

      deviceIds.forEach((deviceId) =>
        set(keys, ["users", userId, deviceId, ...path], true)
      );
    };

    // log("", {
    //   "scopeUsers.length": scopeUsers.length,
    //   "scopeEnvironments.length": scopeEnvironments.length,
    // });

    for (let { id: userId } of scopeUsers) {
      // environments
      for (let environment of scopeEnvironments) {
        if (environment.envUpdatedAt) {
          const addEnvironmentPath = (k: keyof Blob.UserEnvSet) =>
            addUserPath(userId, [
              environment.envParentId,
              "environments",
              environment.id,
              k,
            ]);

          const permissions = getEnvironmentPermissions(
            active,
            environment.id,
            userId
          );

          if (permissions.has("read")) {
            addEnvironmentPath("env");
          }
          if (permissions.has("read_meta")) {
            addEnvironmentPath("meta");
          }
          if (permissions.has("read_inherits")) {
            addEnvironmentPath("inherits");
          }

          if (permissions.has("read_history")) {
            addEnvironmentPath("changesets");
          }
        }
      }
    }
    // log("users " + (Date.now() - start).toString());

    // keyable parents
    for (let generatedEnvkey of scopeGeneratedEnvkeys) {
      const keyableParent = active[
        generatedEnvkey.keyableParentId
      ] as Model.KeyableParent;
      const appProps: (keyof Blob.GeneratedEnvkeySet)[] = [];

      const environment = active[
        keyableParent.environmentId
      ] as Model.Environment;

      const environmentRole = active[
        environment.environmentRoleId
      ] as Rbac.EnvironmentRole;
      const app = active[environment.envParentId] as Model.App;

      if (environment.isSub) {
        const parentEnvironment = active[
          environment.parentEnvironmentId
        ] as Model.Environment;

        if (parentEnvironment.envUpdatedAt) {
          appProps.push("env");
        }

        if (environment.envUpdatedAt) {
          appProps.push("subEnv");
        }

        if (parentEnvironment.envUpdatedAt || environment.envUpdatedAt) {
          appProps.push("inheritanceOverrides");
        }
      } else {
        if (environment.envUpdatedAt) {
          appProps.push("env", "inheritanceOverrides");
        }
      }

      if (keyableParent.type == "localKey") {
        const app = active[keyableParent.appId] as Model.App;
        if (app.localsUpdatedAtByUserId[keyableParent.userId]) {
          appProps.push("localOverrides");
        }
      }

      for (let prop of appProps) {
        set(
          keys,
          ["keyableParents", keyableParent.id, generatedEnvkey.id, prop],
          true
        );
      }

      const connectedBlocks = getConnectedBlocksForApp(
        active,
        keyableParent.appId
      );
      for (let { id: blockId, localsUpdatedAtByUserId } of connectedBlocks) {
        if (
          scope != "all" &&
          scope.envParentIds &&
          scope.envParentIds != "all" &&
          !scope.envParentIds.has(blockId)
        ) {
          continue;
        }

        const blockProps: (keyof Blob.GeneratedEnvkeySet)[] = [];

        const [blockEnvironment] = getConnectedBlockEnvironmentsForApp(
          active,
          keyableParent.appId,
          blockId,
          keyableParent.environmentId
        );

        if (blockEnvironment) {
          if (blockEnvironment.isSub) {
            const parentEnvironment = active[
              blockEnvironment.parentEnvironmentId
            ] as Model.Environment;

            if (parentEnvironment.envUpdatedAt) {
              blockProps.push("env");
            }

            if (blockEnvironment.envUpdatedAt) {
              blockProps.push("subEnv");
            }

            if (
              parentEnvironment.envUpdatedAt ||
              blockEnvironment.envUpdatedAt
            ) {
              blockProps.push("inheritanceOverrides");
            }
          } else {
            const block = active[
              blockEnvironment.envParentId
            ] as Model.EnvParent;
            const environmentRole = active[
              blockEnvironment.environmentRoleId
            ] as Rbac.EnvironmentRole;

            if (blockEnvironment.envUpdatedAt) {
              blockProps.push("env", "inheritanceOverrides");
            }
          }
        }

        if (
          keyableParent.type == "localKey" &&
          localsUpdatedAtByUserId[keyableParent.userId]
        ) {
          blockProps.push("localOverrides");
        }

        for (let prop of blockProps) {
          set(
            keys,
            [
              "blockKeyableParents",
              blockId,
              keyableParent.id,
              generatedEnvkey.id,
              prop,
            ],
            true
          );
        }
      }
    }
    // log("keyable parents " + (Date.now() - start).toString());

    for (let envParent of scopeEnvParents) {
      if (R.isEmpty(envParent.localsUpdatedAtByUserId)) {
        continue;
      }

      const addLocalsPath = (
        userId: string,
        localsUserId: string,
        k: keyof Blob.UserEnvSet
      ) => addUserPath(userId, [envParent.id, "locals", localsUserId, k]);

      const addLocals = (userId: string, localsUserId: string) => {
        addLocalsPath(userId, localsUserId, "env");
        addLocalsPath(userId, localsUserId, "meta");
        addLocalsPath(userId, localsUserId, "changesets");
      };

      const maybeAddLocals = (userId: string, localsUserId: string) => {
        const user = active[userId] as Model.OrgUser | Model.CliUser;

        const orgPermissions = getOrgPermissions(active, user.orgRoleId);

        if (
          envParent.type == "block" &&
          orgPermissions.has("blocks_read_all")
        ) {
          addLocals(userId, localsUserId);
          return;
        }

        const envParentPermissions = getEnvParentPermissions(
          active,
          envParent.id,
          userId
        );

        if (envParentPermissions.has("app_read_user_locals")) {
          addLocals(userId, localsUserId);
        }
      };

      for (let { id: localsUserId } of scopeUsers) {
        if (!envParent.localsUpdatedAtByUserId[localsUserId]) {
          continue;
        }

        for (let { id: userId } of allUsers) {
          maybeAddLocals(userId, localsUserId);
        }
      }

      if (scope != "all" && scope.userIds && scope.userIds != "all") {
        for (let { id: localsUserId } of allUsers) {
          if (!envParent.localsUpdatedAtByUserId[localsUserId]) {
            continue;
          }
          for (let { id: userId } of scopeUsers) {
            maybeAddLocals(userId, localsUserId);
          }
        }
      }
    }
    // log("env parents " + (Date.now() - start).toString());

    return keys;
  }
);
