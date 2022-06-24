import "./helpers/dotenv_helper";
import { getTestId, dispatch, getState } from "./helpers/test_helper";
import { Client, Api } from "@core/types";
import {
  registerWithEmail,
  getEmailToken,
  verifySession,
  loadAccount,
} from "./helpers/auth_helper";
import { inviteAdminUser, acceptInvite } from "./helpers/invites_helper";
import { acceptDeviceGrant } from "./helpers/device_grants_helper";
import { log } from "@core/lib/utils/logger";

describe("registration", () => {
  describe("with email auth", () => {
    let email: string;

    beforeEach(() => {
      email = `success+${getTestId()}@simulator.amazonses.com`;
    });

    test("register", async () => {
      await registerWithEmail(email);
    });
  });

  describe("with external auth", () => {});
});

describe("sign in", () => {
  describe("with email auth", () => {
    let email: string, ownerId: string;

    beforeEach(async () => {
      email = `success+${getTestId()}@simulator.amazonses.com`;
      ({ userId: ownerId } = await registerWithEmail(email));
    });

    test("with existing device, already authenticated with org", async () => {
      let emailVerificationToken = await getEmailToken("sign_in", email);
      let state = getState(ownerId);

      const signInPromise = dispatch(
        {
          type: Client.ActionType.CREATE_SESSION,
          payload: {
            accountId: ownerId,
            emailVerificationToken,
          },
        },
        ownerId
      );

      state = getState(ownerId);
      expect(state.isCreatingSession).toBeTrue();

      let res = await signInPromise;

      if (!res.success) {
        log("", res.resultAction);
      }

      expect(res.success).toBeTrue();

      state = res.state;
      verifySession(state, ownerId, email);

      // below is to reproduce https://www.pivotaltracker.com/story/show/174282064
      // now sign out
      await dispatch(
        {
          type: Client.ActionType.SIGN_OUT,
          payload: {
            accountId: ownerId,
          },
        },
        ownerId
      );

      // now sign in again
      emailVerificationToken = await getEmailToken("sign_in", email);
      res = await dispatch(
        {
          type: Client.ActionType.CREATE_SESSION,
          payload: {
            accountId: ownerId,
            emailVerificationToken,
          },
        },
        ownerId
      );
      expect(res.success).toBeTrue();
      state = res.state;
      verifySession(state, ownerId, email);

      // sign out again
      await dispatch(
        {
          type: Client.ActionType.SIGN_OUT,
          payload: {
            accountId: ownerId,
          },
        },
        ownerId
      );

      // sign in again
      emailVerificationToken = await getEmailToken("sign_in", email);
      res = await dispatch(
        {
          type: Client.ActionType.CREATE_SESSION,
          payload: {
            accountId: ownerId,
            emailVerificationToken,
          },
        },
        ownerId
      );
      expect(res.success).toBeTrue();
      state = res.state;
      verifySession(state, ownerId, email);
    });
  });

  describe("with external auth", () => {});
});

describe("get session", () => {
  describe("with email auth", () => {
    let email: string, ownerId: string;

    beforeEach(async () => {
      email = `success+${getTestId()}@simulator.amazonses.com`;
      ({ userId: ownerId } = await registerWithEmail(email));
    });

    test("with token session", async () => {
      const fetchPromise = dispatch(
        {
          type: Client.ActionType.GET_SESSION,
        },
        ownerId
      );

      let state = getState(ownerId);
      expect(state.isFetchingSession).toBeTrue();

      const res = await fetchPromise;
      expect(res.success).toBeTrue();

      state = res.state;

      verifySession(state, ownerId, email);
    });
  });
});

describe("manage tokens", () => {
  let email: string, orgId: string, deviceId: string, ownerId: string;

  beforeEach(async () => {
    email = `success+${getTestId()}@simulator.amazonses.com`;
    ({ orgId, deviceId, userId: ownerId } = await registerWithEmail(email));
  });

  test("clear current token", async () => {
    const res = await dispatch(
      {
        type: Api.ActionType.CLEAR_TOKEN,
        payload: {},
      },
      ownerId
    );

    expect(res.success).toBeTrue();

    const res2 = await dispatch(
      {
        type: Client.ActionType.CREATE_APP,
        payload: { name: "App", settings: { autoCaps: true } },
      },
      ownerId
    );

    expect(res2.success).toBeFalse();
  });

  test("clear all of a user's tokens", async () => {
    const inviteParams = await inviteAdminUser(ownerId),
      inviteeId = inviteParams.user.id;

    const device1ContextId = await acceptInvite(inviteParams, true);

    await loadAccount(ownerId);

    await dispatch(
      {
        type: Client.ActionType.APPROVE_DEVICES,
        payload: [{ granteeId: inviteeId }],
      },
      ownerId
    );

    let state = getState(ownerId);
    const [generatedDeviceGrant] = state.generatedDeviceGrants.slice(-1);

    const device2ContextId = await acceptDeviceGrant(
      inviteeId,
      generatedDeviceGrant,
      true
    );

    const clearPromise = dispatch(
      {
        type: Api.ActionType.CLEAR_USER_TOKENS,
        payload: {
          userId: inviteeId,
        },
      },
      ownerId
    );

    state = getState(ownerId);
    expect(state.isClearingUserTokens[inviteeId]).toBeTrue();

    const res = await clearPromise;
    expect(res.success).toBeTrue();

    state = getState(ownerId);
    expect(state.isClearingUserTokens[inviteeId]).toBeUndefined();

    // ensure invitee cannot sign in from either device
    const device1Res = await loadAccount(inviteeId, device1ContextId);
    expect(device1Res!.success).toBeFalse();

    const device2Res = await loadAccount(inviteeId, device2ContextId);
    expect(device2Res!.success).toBeFalse();
  });

  test("clear all of an org's tokens", async () => {
    const inviteParams = await inviteAdminUser(ownerId),
      inviteeId = inviteParams.user.id,
      device1ContextId = await acceptInvite(inviteParams, true);

    await loadAccount(ownerId);

    await dispatch(
      {
        type: Client.ActionType.APPROVE_DEVICES,
        payload: [{ granteeId: inviteeId }],
      },
      ownerId
    );

    let state = getState(ownerId);
    const [generatedDeviceGrant] = state.generatedDeviceGrants.slice(-1),
      device2ContextId = await acceptDeviceGrant(
        inviteeId,
        generatedDeviceGrant,
        true
      ),
      clearPromise = dispatch(
        {
          type: Api.ActionType.CLEAR_ORG_TOKENS,
          payload: {},
        },
        ownerId
      );

    state = getState(ownerId);
    expect(state.isClearingOrgTokens).toBeTrue();

    const res = await clearPromise;

    expect(res.success).toBeTrue();

    state = getState(ownerId);
    expect(state.isClearingOrgTokens).toBeUndefined();

    // ensure invitee cannot sign in from either device
    const device1Res = await loadAccount(inviteeId, device1ContextId);
    expect(device1Res!.success).toBeFalse();

    const device2Res = await loadAccount(inviteeId, device2ContextId);
    expect(device2Res!.success).toBeFalse();

    await expect(async () => {
      await loadAccount(ownerId);
    }).rejects.toThrow(Error);
  });
});
