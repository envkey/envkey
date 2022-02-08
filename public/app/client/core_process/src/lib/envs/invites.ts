import * as R from "ramda";
import { Client, Api, Model, Crypto } from "@core/types";
import {
  graphTypes,
  getEnvironmentPermissions,
  getEnvParentPermissions,
  getOrgPermissions,
} from "@core/lib/graph";
import {
  getUserEncryptedKeyOrBlobComposite,
  parseUserEncryptedKeyOrBlobComposite,
} from "@core/lib/blob";
import { encrypt } from "@core/lib/crypto/proxy";
import { log } from "@core/lib/utils/logger";
import set from "lodash.set";

export const encryptedKeyParamsForDeviceOrInvitee = async (
  state: Client.State,
  privkey: Crypto.Privkey,
  pubkey: Crypto.Pubkey,
  userId?: string,
  accessParams?: Model.AccessParams
): Promise<Api.Net.EnvParams> => {
  let keys: Api.Net.EnvParams["keys"] = {},
    orgRoleId: string;

  if (userId) {
    ({ orgRoleId } = state.graph[userId] as Model.CliUser | Model.OrgUser);
  } else if (accessParams) {
    orgRoleId = accessParams.orgRoleId;
  } else {
    throw new Error("Either userId or accessParams is required");
  }

  const orgPermissions = getOrgPermissions(state.graph, orgRoleId),
    byType = graphTypes(state.graph),
    allEnvironments = byType.environments,
    allEnvParents = [...byType.apps, ...byType.blocks],
    toEncrypt: [string[], Parameters<typeof encrypt>[0]][] = [],
    inheritanceOverridesByEnvironmentId = R.groupBy(
      ([composite]) =>
        parseUserEncryptedKeyOrBlobComposite(composite).environmentId,
      R.toPairs(state.envs).filter(
        ([composite]) =>
          parseUserEncryptedKeyOrBlobComposite(composite).inheritsEnvironmentId
      )
    );

  for (let environment of allEnvironments) {
    const environmentPermissions = getEnvironmentPermissions(
      state.graph,
      environment.id,
      userId,
      accessParams
    );

    if (environmentPermissions.has("read")) {
      const key =
        state.envs[
          getUserEncryptedKeyOrBlobComposite({
            environmentId: environment.id,
          })
        ]?.key;

      if (key) {
        toEncrypt.push([
          [
            "newDevice",
            environment.envParentId,
            "environments",
            environment.id,
            "env",
          ],
          {
            data: key,
            pubkey,
            privkey,
          },
        ]);
      }
    }

    if (environmentPermissions.has("read_meta")) {
      const key =
        state.envs[
          getUserEncryptedKeyOrBlobComposite({
            environmentId: environment.id,
            envPart: "meta",
          })
        ]?.key;

      if (key) {
        toEncrypt.push([
          [
            "newDevice",
            environment.envParentId,
            "environments",
            environment.id,
            "meta",
          ],
          {
            data: key,
            pubkey,
            privkey,
          },
        ]);
      }
    }

    if (environmentPermissions.has("read_inherits")) {
      const key =
        state.envs[
          getUserEncryptedKeyOrBlobComposite({
            environmentId: environment.id,
            envPart: "inherits",
          })
        ]?.key;

      if (key) {
        toEncrypt.push([
          [
            "newDevice",
            environment.envParentId,
            "environments",
            environment.id,
            "inherits",
          ],
          {
            data: key,
            pubkey,
            privkey,
          },
        ]);
      }
    }

    if (environmentPermissions.has("read_history")) {
      const { key } = state.changesets[environment.id] ?? {};

      if (key) {
        const path = [
          "newDevice",
          environment.envParentId,
          "environments",
          environment.id,
          "changesets",
        ];

        toEncrypt.push([
          path,
          {
            data: key,
            pubkey,
            privkey,
          },
        ]);
      }
    }

    if (environmentPermissions.has("read")) {
      // add any inheritanceOverrides for this environment
      const environmentInheritanceOverrides =
        inheritanceOverridesByEnvironmentId[environment.id] ?? [];

      for (let [composite] of environmentInheritanceOverrides) {
        const { inheritsEnvironmentId } =
          parseUserEncryptedKeyOrBlobComposite(composite);

        const key = state.envs[composite].key;

        toEncrypt.push([
          [
            "newDevice",
            environment.envParentId,
            "environments",
            environment.id,
            "inheritanceOverrides",
            inheritsEnvironmentId!,
          ],
          {
            data: key,
            pubkey,
            privkey,
          },
        ]);
      }
    }
  }

  for (let envParent of allEnvParents) {
    const envParentPermissions = getEnvParentPermissions(
      state.graph,
      envParent.id,
      userId,
      accessParams
    );

    for (let localsUserId in envParent.localsUpdatedAtByUserId) {
      if (
        localsUserId == userId ||
        (envParent.type == "block" && orgPermissions.has("blocks_read_all")) ||
        envParentPermissions.has("app_read_user_locals")
      ) {
        const environmentId = envParent.id + "|" + localsUserId;

        const key =
          state.envs[
            getUserEncryptedKeyOrBlobComposite({
              environmentId,
            })
          ]?.key;

        const metaKey =
          state.envs[
            getUserEncryptedKeyOrBlobComposite({
              environmentId,
              envPart: "meta",
            })
          ]?.key;

        if (key) {
          toEncrypt.push([
            ["newDevice", envParent.id, "locals", localsUserId, "env"],
            {
              data: key,
              pubkey,
              privkey,
            },
          ]);
        }

        if (metaKey) {
          toEncrypt.push([
            ["newDevice", envParent.id, "locals", localsUserId, "meta"],
            {
              data: metaKey,
              pubkey,
              privkey,
            },
          ]);
        }
      }

      if (
        localsUserId == userId ||
        (envParent.type == "block" && orgPermissions.has("blocks_read_all")) ||
        envParentPermissions.has("app_read_user_locals_history")
      ) {
        const { key } =
          state.changesets[envParent.id + "|" + localsUserId] ?? {};

        if (key) {
          const path = [
            "newDevice",
            envParent.id,
            "locals",
            localsUserId,
            "changesets",
          ];

          toEncrypt.push([
            path,
            {
              data: key,
              pubkey,
              privkey,
            },
          ]);
        }
      }
    }
  }

  const promises = toEncrypt.map(([path, params]) =>
      encrypt(params).then((encrypted) => [path, encrypted])
    ) as Promise<[string[], Crypto.EncryptedData]>[],
    pathResults = await Promise.all(promises);

  for (let [path, data] of pathResults) {
    set(keys, path, data);
  }

  return {
    keys,
    blobs: {},
  };
};
