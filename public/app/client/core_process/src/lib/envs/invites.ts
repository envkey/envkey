import * as R from "ramda";
import { Client, Api, Model, Crypto } from "@core/types";
import {
  graphTypes,
  getEnvironmentPermissions,
  getEnvParentPermissions,
  getOrgPermissions,
  getOrg,
} from "@core/lib/graph";
import {
  getUserEncryptedKeyOrBlobComposite,
  parseUserEncryptedKeyOrBlobComposite,
} from "@core/lib/blob";
import { encrypt } from "@core/lib/crypto/proxy";
import { log } from "@core/lib/utils/logger";
import { dispatch } from "../../handler";
import set from "lodash.set";
import {
  CRYPTO_ASYMMETRIC_BATCH_SIZE,
  CRYPTO_ASYMMETRIC_BATCH_DELAY_MS,
  CRYPTO_ASYMMETRIC_STATUS_INTERVAL,
} from "./constants";
import { wait } from "@core/lib/utils/wait";

export const encryptedKeyParamsForDeviceOrInvitee = async (params: {
  state: Client.State;
  privkey: Crypto.Privkey;
  pubkey: Crypto.Pubkey;
  userId?: string;
  accessParams?: Model.AccessParams;
  context: Client.Context;
}): Promise<Api.Net.EnvParams> => {
  // log("encryptedKeyParamsForDeviceOrInvitee");

  const { state, privkey, pubkey, userId, accessParams, context } = params;

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

        if (key) {
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

  // log("encryptedKeyParamsForDeviceOrInvitee - got toEncrypt", {
  //   toEncrypt: toEncrypt.length,
  // });

  await dispatch(
    {
      type: Client.ActionType.SET_CRYPTO_STATUS,
      payload: {
        processed: 0,
        total: toEncrypt.length,
        op: "encrypt",
        dataType: "keys",
      },
    },
    context
  );

  // log("encryptedKeyParamsForDeviceOrInvitee - starting encryption");

  let pathResults: [string[], Crypto.EncryptedData][] = [];
  let encryptedSinceStatusUpdate = 0;
  for (let batch of R.splitEvery(CRYPTO_ASYMMETRIC_BATCH_SIZE, toEncrypt)) {
    const res = await Promise.all(
      batch.map(([path, params]) =>
        encrypt(params).then((encrypted) => {
          encryptedSinceStatusUpdate++;
          if (encryptedSinceStatusUpdate >= CRYPTO_ASYMMETRIC_STATUS_INTERVAL) {
            dispatch(
              {
                type: Client.ActionType.CRYPTO_STATUS_INCREMENT,
                payload: encryptedSinceStatusUpdate,
              },
              context
            );
            encryptedSinceStatusUpdate = 0;
          }

          return [path, encrypted];
        })
      ) as Promise<[string[], Crypto.EncryptedData]>[]
    );

    await wait(CRYPTO_ASYMMETRIC_BATCH_DELAY_MS);

    pathResults = pathResults.concat(res);
  }

  // log("encryptedKeyParamsForDeviceOrInvitee - encrypted all");

  await dispatch(
    {
      type: Client.ActionType.SET_CRYPTO_STATUS,
      payload: undefined,
    },
    context
  );

  for (let [path, data] of pathResults) {
    set(keys, path, data);
  }

  // log("encryptedKeyParamsForDeviceOrInvitee - set pathResults");

  // log("invites", { pathResults });

  return {
    keys,
    blobs: {},
  };
};
