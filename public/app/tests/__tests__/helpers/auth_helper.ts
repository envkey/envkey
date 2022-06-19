import { getDefaultOrgSettings } from "@core/lib/client/defaults";
import * as R from "ramda";
import {
  dispatch,
  getState,
  hostUrl,
  getTestId,
  getDeviceStore,
} from "./test_helper";
import { acceptDeviceGrant } from "./device_grants_helper";
import { Client, Api, Auth, Model } from "@core/types";
import { getActiveVerificationsWithEmail } from "@api_shared/models/email_verifications";
import { log } from "@core/lib/utils/logger";
import { graphTypes } from "@core/lib/graph";
import { getPubkeyHash } from "@core/lib/client";

export const getEmailToken = async (
    authType: Extract<Auth.AuthType, "sign_up" | "sign_in">,
    email: string
  ) => {
    let state: Client.State;
    const verifyEmailPromise = dispatch<
      Api.Action.RequestActions["CreateEmailVerification"]
    >(
      {
        type: Api.ActionType.CREATE_EMAIL_VERIFICATION,
        payload: {
          authType,
          email,
          communityAuth: process.env.COMMUNITY_AUTH_DEV_ONLY,
        },
      },
      undefined
    );

    state = getState(undefined);
    expect(state.isVerifyingEmail).toBeTrue();

    const verifyEmailRes = await verifyEmailPromise;
    expect(verifyEmailRes.success).toBeTrue();

    state = verifyEmailRes.state;
    expect(state.isVerifyingEmail).toBeUndefined();
    expect(state.verifyingEmail).toBe(email);

    const emailVerification = await getActiveVerificationsWithEmail(
      email,
      undefined
    ).then((res) => res[0]);
    expect(emailVerification).toBeObject();

    return emailVerification.token;
  },
  registerWithEmail = async (
    email: string,
    orgName?: string,
    firstName?: string,
    lastName?: string,
    deviceName?: string,
    setLicenseFn?: (
      orgId: string,
      accountId: string,
      deviceStoreId: string
    ) => Promise<void>
  ) => {
    let state: Client.State;
    const emailVerificationToken = await getEmailToken("sign_up", email),
      registerPromise = dispatch(
        {
          type: Client.ActionType.REGISTER,
          payload: {
            user: {
              firstName: firstName ?? "Test",
              lastName: lastName ?? "User",
              email: email,
            },
            org: {
              name: orgName ?? "Test",
              settings: getDefaultOrgSettings(),
            },
            device: {
              name: deviceName ?? "test",
            },
            provider: "email",
            emailVerificationToken,

            ...(process.env.COMMUNITY_AUTH_DEV_ONLY
              ? {
                  hostType: "community",
                  communityAuth: process.env.COMMUNITY_AUTH_DEV_ONLY,
                }
              : {
                  hostType: "cloud",
                }),
          },
        },
        undefined
      );

    state = getState(undefined);

    expect(state.isRegistering).toBeTrue();

    const registerRes = await registerPromise;

    expect(registerRes.success).toBeTrue();

    const { userId: accountId, orgId } = (registerRes.resultAction as any)
      .payload as Api.Net.RegisterResult;

    // expectations for newly created org
    verifySession(
      registerRes.state,
      accountId,
      email,
      true,
      orgName,
      firstName,
      lastName
    );

    const deviceStoreId = getTestId();

    if (setLicenseFn) {
      await setLicenseFn(orgId, accountId, deviceStoreId);
    }

    // establish device context
    await dispatch(
      {
        type: Client.ActionType.APPROVE_DEVICES,
        payload: [{ granteeId: accountId }],
      },
      accountId,
      deviceStoreId
    );

    state = getState(accountId, deviceStoreId);
    const generatedDeviceGrant = state.generatedDeviceGrants[0];

    const newDeviceStoreId = await acceptDeviceGrant(
      accountId,
      generatedDeviceGrant,
      undefined
    );

    const procState = getDeviceStore(
        newDeviceStoreId ?? getTestId()
      ).getState(),
      auth = Object.values(
        procState.orgUserAccounts
      )[0] as Client.ClientUserAuth;

    return auth;
  },
  verifySession = (
    state: Client.State,
    accountId: string,
    email: string,
    isRegistration?: true,
    orgName?: string,
    firstName?: string,
    lastName?: string
  ) => {
    expect(state.orgUserAccounts[accountId]?.deviceId).toBeString();

    const auth = state.orgUserAccounts[accountId]!,
      { pubkey } = state.graph[auth.deviceId] as Model.OrgUserDevice,
      pubkeyId = getPubkeyHash(pubkey);

    if (isRegistration) {
      expect(state.trustedRoot).toEqual(
        expect.objectContaining({
          [pubkeyId]: [
            "root",
            expect.objectContaining({
              keys: expect.objectContaining({
                encryptionKey: expect.toBeString(),
                signingKey: expect.toBeString(),
              }),
            }),
          ],
        })
      );
    }

    expect(Object.values(state.orgUserAccounts).length).toBeGreaterThanOrEqual(
      1
    );

    expect(auth).toEqual(
      expect.objectContaining({
        type: "clientUserAuth",
        token: expect.toBeString(),
        userId: expect.toBeString(),
        orgId: expect.toBeString(),
        orgName: expect.toBeString(),
        hostUrl,
        email: email.toLowerCase(),
        provider: "email",
        uid: expect.toBeString(),
        firstName: firstName ?? "Test",
        lastName: lastName ?? "User",
      })
    );
    expect(auth).toEqual(
      expect.objectContaining({
        privkey: expect.objectContaining({
          keys: expect.objectContaining({
            encryptionKey: expect.toBeString(),
            signingKey: expect.toBeString(),
          }),
        }),
      })
    );

    expect(Object.values(state.graph)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "org",
          name: orgName ?? "Test",
          id: auth.orgId,
        }),

        expect.objectContaining({
          type: "orgUser",
          firstName: firstName ?? "Test",
          lastName: lastName ?? "User",
          provider: "email",
          id: auth.userId,
          isCreator: true,
        }),

        expect.objectContaining({
          type: "orgRole",
          name: "Basic User",
        }),
        expect.objectContaining({
          type: "orgRole",
          name: "Org Admin",
        }),
        expect.objectContaining({
          type: "orgRole",
          name: "Org Owner",
        }),

        expect.objectContaining({
          type: "appRole",
          name: "Developer",
        }),
        expect.objectContaining({
          type: "appRole",
          name: "DevOps",
        }),
        expect.objectContaining({
          type: "appRole",
          name: "Admin",
        }),
        expect.objectContaining({
          type: "appRole",
          name: "Org Admin",
        }),
        expect.objectContaining({
          type: "appRole",
          name: "Org Owner",
        }),

        expect.objectContaining({
          type: "environmentRole",
          name: "Development",
        }),
        expect.objectContaining({
          type: "environmentRole",
          name: "Staging",
        }),
        expect.objectContaining({
          type: "environmentRole",
          name: "Production",
        }),
      ])
    );

    expect(Object.values(state.graph)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "orgUserDevice",
          id: auth.deviceId,
        }),
      ])
    );
  },
  loadAccount = async (userId: string, deviceStoreIdArg?: string) => {
    const deviceStoreId = deviceStoreIdArg ?? userId;
    let state = getState(userId, deviceStoreId),
      sessionRes: Client.DispatchResult | undefined;

    sessionRes = await dispatch(
      {
        type: Client.ActionType.GET_SESSION,
      },
      userId,
      deviceStoreId
    );

    if (!sessionRes.success) {
      return sessionRes;
    }

    state = getState(userId, deviceStoreId);

    const { apps, blocks } = graphTypes(state.graph),
      envParentIds = [...apps.map(R.prop("id")), ...blocks.map(R.prop("id"))];

    return dispatch(
      {
        type: Client.ActionType.FETCH_ENVS,
        payload: {
          byEnvParentId: envParentIds.reduce(
            (agg, id) => ({ ...agg, [id]: { envs: true } }),
            {}
          ),
        },
      },
      userId,
      deviceStoreId
    );
  };
