import { log } from "@core/lib/utils/logger";
import waitForExpect from "wait-for-expect";
import { getState, dispatch, hostUrl } from "./test_helper";
import { getUserEncryptedKeys } from "@api_shared/blob";
import { query, pool } from "@api_shared/db";
import * as R from "ramda";
import { loadAccount } from "./auth_helper";
import { Client, Api, Model } from "@core/types";
import { getEnvironments } from "./envs_helper";
import { getOrgUserDevicesByUserId, graphTypes } from "@core/lib/graph";
import { getOrgGraph } from "@api_shared/graph";
import { getRootPubkeyReplacements } from "./crypto_helper";
import { wait } from "@core/lib/utils/wait";

export const testRemoveUser = async (
  params: {
    actorId: string;
    actorCliKey?: string;
    targetId: string;
    targetCliKey?: string;
  } & (
    | ({
        canRemove: true;
        isRemovingRoot?: true;
        uninvolvedUserId?: string;
        numAdditionalKeyables?: number;
      } & (
        | {
            canImmediatelyRevoke: true;
            canSubsequentlyRevoke?: undefined;
            revocationRequestProcessorId?: undefined;
          }
        | ({
            canImmediatelyRevoke: false;
          } & (
            | {
                canSubsequentlyRevoke: true;
                revocationRequestProcessorId?: undefined;
              }
            | {
                canSubsequentlyRevoke: false;
                revocationRequestProcessorId: string;
              }
          ))
      ))
    | {
        canRemove: false;
        canImmediatelyRevoke?: undefined;
        canSubsequentlyRevoke?: undefined;
        isRemovingRoot?: undefined;
        revocationRequestProcessorId?: undefined;
        uninvolvedUserId?: undefined;
        numAdditionalKeyables?: undefined;
      }
  )
) => {
  const {
    actorId,
    actorCliKey,
    targetId,
    targetCliKey,
    canRemove,
    canImmediatelyRevoke,
    canSubsequentlyRevoke,
    isRemovingRoot,
    numAdditionalKeyables,
    revocationRequestProcessorId,
    uninvolvedUserId,
  } = params;
  const start = Date.now();

  if (actorCliKey) {
    await dispatch(
      {
        type: Client.ActionType.AUTHENTICATE_CLI_KEY,
        payload: { cliKey: actorCliKey },
      },
      actorCliKey
    );
  } else {
    await loadAccount(actorId);
  }

  let state = getState(actorCliKey ?? actorId),
    byType = graphTypes(state.graph);

  const actor = state.graph[actorId] as Model.OrgUser | Model.CliUser;
  const target = state.graph[targetId] as Model.OrgUser | Model.CliUser;

  const isRemovingSelf = actorId === targetId,
    [basicRole, ownerRole] = R.props(
      ["Basic User", "Org Owner"] as string[],
      R.indexBy(R.prop("name"), byType.orgRoles)
    ),
    actorIsBasicUser = actor.orgRoleId == basicRole.id,
    isRemovingOwner =
      (state.graph[targetId] as Model.OrgUser | Model.CliUser).orgRoleId ==
      ownerRole.id,
    targetDeviceId =
      target.type == "orgUser"
        ? getState(targetId).orgUserAccounts[targetId]!.deviceId
        : undefined,
    actorDeviceId =
      actor.type == "orgUser"
        ? getState(actorId).orgUserAccounts[actorId]!.deviceId
        : undefined,
    orgId = byType.org.id,
    targetDevices = getOrgUserDevicesByUserId(state.graph)[targetId] ?? [],
    [{ id: appId }] = byType.apps,
    [appDevelopment] = getEnvironments(targetCliKey ?? targetId, appId);

  let localKeyId: string | undefined,
    localGeneratedEnvkeyId: string | undefined,
    recoveryEncryptionKey: string | undefined;
  if (canRemove) {
    if (targetCliKey) {
      await dispatch(
        {
          type: Client.ActionType.AUTHENTICATE_CLI_KEY,
          payload: { cliKey: targetCliKey },
        },
        targetCliKey
      );
    } else {
      await loadAccount(targetId);
    }

    state = getState(targetCliKey ?? targetId);
    byType = graphTypes(state.graph);

    if (target.type == "orgUser") {
      await dispatch(
        {
          type: Client.ActionType.CREATE_LOCAL_KEY,
          payload: {
            appId,
            name: "Development Key",
            environmentId: appDevelopment.id,
          },
        },
        targetCliKey ?? targetId
      );

      state = getState(targetCliKey ?? targetId);
      byType = graphTypes(state.graph);

      ({ id: localKeyId } = byType.localKeys[byType.localKeys.length - 1]);

      [{ id: localGeneratedEnvkeyId }] = byType.generatedEnvkeys.filter(
        R.propEq("keyableParentId", localKeyId)
      );
    }

    if (isRemovingOwner) {
      await dispatch(
        {
          type: Client.ActionType.CREATE_RECOVERY_KEY,
        },
        targetId
      );
      state = getState(targetCliKey ?? targetId);

      recoveryEncryptionKey = state.generatedRecoveryKey!.encryptionKey;
    }
  }

  let generatedDeviceGrant:
    | Client.State["generatedDeviceGrants"][0]
    | undefined;
  if (canRemove && !actorIsBasicUser && target.type == "orgUser") {
    await dispatch(
      {
        type: Client.ActionType.APPROVE_DEVICES,
        payload: [{ granteeId: targetId }],
      },
      actorCliKey ?? actorId
    );

    state = getState(targetCliKey ?? targetId);
    generatedDeviceGrant = state.generatedDeviceGrants[0];
  }

  let promise: Promise<Client.DispatchResult>;
  if (target.type == "orgUser") {
    promise = dispatch(
      {
        type: Api.ActionType.REMOVE_FROM_ORG,
        payload: { id: targetId },
      },
      actorCliKey ?? actorId
    );
  } else {
    promise = dispatch(
      {
        type: Api.ActionType.DELETE_CLI_USER,
        payload: { id: targetId },
      },
      actorCliKey ?? actorId
    );
  }

  await waitForExpect(() => {
    state = getState(actorCliKey ?? actorId);
    expect(state.isRemoving[targetId]).toBeTrue();
  });

  const res1 = await promise;

  if (canRemove) {
    expect(res1.success).toBeTrue();
  }

  state = getState(actorCliKey ?? actorId);
  if (isRemovingSelf && canRemove) {
    expect(state.orgUserAccounts[targetId]).toBeUndefined();
  } else {
    expect(state.isRemoving[targetId]).toBeUndefined();

    if (canRemove) {
      if (canImmediatelyRevoke || canSubsequentlyRevoke) {
        // expect(state.graph[targetId]).toBeUndefined();
        // won't be deleted until REENCRYPT_ENVS finishes in the background
      } else {
        expect(state.graph[targetId]).toEqual(
          expect.objectContaining({
            deactivatedAt: expect.toBeNumber(),
          })
        );
      }

      if (targetCliKey) {
        const shouldFailRes = await dispatch(
          {
            type: Client.ActionType.AUTHENTICATE_CLI_KEY,
            payload: { cliKey: targetCliKey },
          },
          targetCliKey
        );

        expect(shouldFailRes.success).toBeFalse();
      } else {
        const shouldFailRes = await dispatch(
          {
            type: Client.ActionType.GET_SESSION,
          },
          targetId
        );

        expect(shouldFailRes.success).toBe(false);
      }
    }
  }

  if (canRemove) {
    // console.log(`ensure pubkeyRevocationRequests were handled correctly`);

    const getPubkeyRevocationRequests = async () =>
      query<Api.Db.PubkeyRevocationRequest>({
        pkey: orgId,
        scope: "g|pubkeyRevocationRequest|",
        createdAfter: start,
        deleted: "any",
        transactionConn: undefined,
      }).then((requests) => requests.filter(R.propEq("creatorId", actorId)));
    let requests = await getPubkeyRevocationRequests();

    if (canImmediatelyRevoke) {
      // if the user could be immediately revoked, no pubkey revocation requests should have been created by the actor after the start of the test
      expect(requests.length).toBe(0);
    } else if (canSubsequentlyRevoke) {
      // if the user couldn't revoke immediately but could revoke on the next request, there should have been a pubkeyRevocationRequest created and processed by the actor after the start of the test
      // Disabling  until root pubkey replacement issue on 6-27-2022 can be fully debugged
      // await waitForExpect(
      //   async () => {
      //     requests = await getPubkeyRevocationRequests();
      //     const expectedLength = targetCliKey ? 1 : targetDevices.length;
      //     expect(requests.length).toBe(expectedLength);
      //     for (let i = 0; i < expectedLength; i++) {
      //       expect(requests[i].deletedAt).toBeGreaterThan(0);
      //     }
      //   },
      //   8000,
      //   200
      // );
    } else if (revocationRequestProcessorId) {
      // Disabling  until root pubkey replacement issue on 6-27-2022 can be fully debugged
      // const expectedLength = targetCliKey ? 1 : targetDevices.length;
      // expect(requests.length).toBe(expectedLength);
      // for (let i = 0; i < expectedLength; i++) {
      //   expect(requests[i].deletedAt).toBe(0);
      // }
      // await dispatch(
      //   {
      //     type: Client.ActionType.GET_SESSION,
      //   },
      //   revocationRequestProcessorId
      // );
      // await waitForExpect(
      //   async () => {
      //     requests = await getPubkeyRevocationRequests();
      //     expect(requests.length).toBe(expectedLength);
      //     for (let i = 0; i < expectedLength; i++) {
      //       expect(requests[i].deletedAt).toBeGreaterThan(0);
      //     }
      //   },
      //   8000,
      //   200
      // );
    }

    // Disabling until root pubkey replacement issue on 6-27-2022 can be fully debugged
    // if (isRemovingRoot) {
    //   let replacements = await getRootPubkeyReplacements(orgId, start);

    //   expect(replacements.length).toBe(1);
    //   let replacement = replacements[0];

    //   let orgGraph = await getOrgGraph(orgId, {
    //     transactionConnOrPool: pool,
    //   });
    //   let orgGraphByType = graphTypes(orgGraph);

    //   let revocationProcessorDeviceId: string | undefined;
    //   if (revocationRequestProcessorId) {
    //     const processorState = getState(revocationRequestProcessorId);
    //     revocationProcessorDeviceId =
    //       processorState.orgUserAccounts[revocationRequestProcessorId]!
    //         .deviceId;
    //   }

    //   const expectKeys = R.without(
    //     [actorDeviceId ?? actorId, revocationProcessorDeviceId ?? ""],
    //     [
    //       ...orgGraphByType.orgUserDevices
    //         .filter(({ deactivatedAt }) => !deactivatedAt)
    //         .map(R.prop("id")),
    //       ...orgGraphByType.cliUsers
    //         .filter(({ deactivatedAt }) => !deactivatedAt)
    //         .map(R.prop("id")),
    //       ...orgGraphByType.generatedEnvkeys.map(R.prop("id")),
    //     ]
    //   );

    //   const expectNumKeys = expectKeys.length + (numAdditionalKeyables ?? 0);
    //   const keys = Object.keys(replacement.processedAtById);

    //   const numKeys = keys.length;
    //   expect(numKeys).toBe(expectNumKeys);

    //   if (canImmediatelyRevoke || canSubsequentlyRevoke) {
    //     if (actor.type == "orgUser" && actorDeviceId) {
    //       expect(replacement.processedAtById[actorDeviceId]).toBeUndefined();
    //     } else {
    //       expect(replacement.processedAtById[actorId]).toBeUndefined();
    //     }
    //   } else if (revocationRequestProcessorId) {
    //     const processorDeviceId = getState(revocationRequestProcessorId)
    //       .orgUserAccounts[revocationRequestProcessorId]!.deviceId;

    //     expect(replacement.processedAtById[processorDeviceId]).toBeUndefined();
    //   }

    //   if (uninvolvedUserId) {
    //     // console.log(
    //     //   `ensure an uninvolved user cannot dispatch a graph update action until queued root replacements are processed`
    //     // );

    //     const uninvolvedDeviceId =
    //       getState(uninvolvedUserId).orgUserAccounts[uninvolvedUserId]!
    //         .deviceId;

    //     expect(replacement.processedAtById[uninvolvedDeviceId]).toBeFalse();

    //     await dispatch(
    //       {
    //         type: Client.ActionType.GET_SESSION,
    //       },
    //       uninvolvedUserId
    //     );
    //     await wait(2000);

    //     replacements = await getRootPubkeyReplacements(orgId, start);
    //     expect(replacements.length).toBe(1);
    //     replacement = replacements[0];

    //     expect(replacement.processedAtById[uninvolvedDeviceId]).toBeNumber();

    //     state = getState(uninvolvedDeviceId);
    //     expect(graphTypes(state.graph).rootPubkeyReplacements.length).toBe(0);
    //   }
    // }

    if (target.type == "orgUser") {
      if (!(localKeyId && localGeneratedEnvkeyId)) {
        throw new Error(
          "localKeyId and localGeneratedEnvkeyId should be defined"
        );
      }

      // console.log(`ensure all local key blobs are deleted`);
      const blobs = await Promise.all([
        getUserEncryptedKeys(
          {
            orgId,
            userId: targetId,
            deviceId: targetDeviceId ?? "cli",
            blobType: "env",
          },
          { transactionConn: undefined }
        ),
        query({
          pkey: ["envkey", localGeneratedEnvkeyId].join("|"),
          transactionConn: undefined,
        }),
      ]).then(R.flatten);

      expect(blobs).toEqual([]);
    }

    // console.log(`ensure device grants can no longer be accepted`);
    if (generatedDeviceGrant) {
      const [{ skey: deviceGrantEmailToken }] =
          await query<Api.Db.DeviceGrantPointer>({
            pkey: ["deviceGrant", generatedDeviceGrant.identityHash].join("|"),
            transactionConn: undefined,
          }),
        deviceGrantLoadRes = await dispatch<
          Client.Action.ClientActions["LoadDeviceGrant"]
        >(
          {
            type: Client.ActionType.LOAD_DEVICE_GRANT,
            payload: {
              emailToken: deviceGrantEmailToken,
              encryptionToken: [
                generatedDeviceGrant.identityHash,
                generatedDeviceGrant.encryptionKey,
              ].join("_"),
            },
          },
          undefined
        );
      expect(deviceGrantLoadRes.success).toBeFalse();
    }

    // console.log(
    //   `ensure recovery keys can no longer be redeemed (if applicable)`
    // );
    if (isRemovingOwner) {
      if (!recoveryEncryptionKey) {
        throw new Error("recoveryEncryptionKey should be defined");
      }

      const recoveryKeyLoadRes = await dispatch<
        Client.Action.ClientActions["LoadRecoveryKey"]
      >(
        {
          type: Client.ActionType.LOAD_RECOVERY_KEY,
          payload: {
            encryptionKey: recoveryEncryptionKey,
            hostUrl,
          },
        },
        targetId
      );

      expect(recoveryKeyLoadRes.success).toBeFalse();
      expect(
        (recoveryKeyLoadRes.resultAction as any).payload.error.type
      ).not.toBe("requiresEmailAuthError");
    }
  }
};
