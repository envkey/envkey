import { log } from "@core/lib/utils/logger";
import { secureRandomAlphanumeric } from "@core/lib/crypto/utils";
import * as R from "ramda";
import { getTestId, getState, dispatch } from "./test_helper";
import { Client, Api, Rbac, Model } from "@core/types";
import { graphTypes } from "@core/lib/graph";
import { query } from "@api_shared/db";
import { v4 as uuid } from "uuid";

export const inviteUsers = async (accountId: string) => {
    let state = getState(accountId);

    const byType = graphTypes(state.graph),
      [basicUserRole, orgAdminRole, orgOwnerRole] = R.props<
        string,
        Rbac.OrgRole
      >(
        ["Basic User", "Org Admin", "Org Owner"],
        R.indexBy(R.prop("name"), byType.orgRoles)
      ),
      [devAppRole, prodAppRole, adminAppRole] = R.props<string, Rbac.AppRole>(
        ["Developer", "DevOps", "Admin"],
        R.indexBy(R.prop("name"), byType.appRoles)
      ),
      [app1, app2] = R.props<string, Model.App>(
        ["Test App 1", "Test App 2"],
        R.indexBy(R.prop("name"), byType.apps)
      );

    const inviteParams = [
        {
          user: {
            firstName: "Invited-Org-Owner",
            lastName: "Test",
            email: `success+user1-${getTestId()}@simulator.amazonses.com`,
            provider: <const>"email",
            uid: `success+user1-${getTestId()}@simulator.amazonses.com`,
            orgRoleId: orgOwnerRole.id,
          },
        },
        {
          user: {
            firstName: "Invited-Org-Admin",
            lastName: "Test",
            email: `success+user2-${getTestId()}@simulator.amazonses.com`,
            provider: <const>"email",
            uid: `success+user2-${getTestId()}@simulator.amazonses.com`,
            orgRoleId: orgAdminRole.id,
          },
        },
        {
          user: {
            firstName: "Invited-All-Apps-Admin",
            lastName: "Test",
            email: `success+user3-${getTestId()}@simulator.amazonses.com`,
            provider: <const>"email",
            uid: `success+user3-${getTestId()}@simulator.amazonses.com`,
            orgRoleId: basicUserRole.id,
          },
          appUserGrants: [
            {
              appId: app1.id,
              appRoleId: adminAppRole.id,
            },
            {
              appId: app2.id,
              appRoleId: adminAppRole.id,
            },
          ],
        },
        {
          user: {
            firstName: "Invited-Single-App-Prod",
            lastName: "Test",
            email: `success+user4-${getTestId()}@simulator.amazonses.com`,
            provider: <const>"email",
            uid: `success+user4-${getTestId()}@simulator.amazonses.com`,
            orgRoleId: basicUserRole.id,
          },
          appUserGrants: [
            {
              appId: app1.id,
              appRoleId: prodAppRole.id,
            },
          ],
        },
        {
          user: {
            firstName: "Invited-Single-App-Dev",
            lastName: "Test",
            email: `success+user5-${getTestId()}@simulator.amazonses.com`,
            provider: <const>"email",
            uid: `success+user5-${getTestId()}@simulator.amazonses.com`,
            orgRoleId: basicUserRole.id,
          },
          appUserGrants: [
            {
              appId: app1.id,
              appRoleId: devAppRole.id,
            },
          ],
        },
        {
          user: {
            firstName: "Invited-Mixed-App-Admin/Dev",
            lastName: "Test",
            email: `success+user6-${getTestId()}@simulator.amazonses.com`,
            provider: <const>"email",
            uid: `success+user6-${getTestId()}@simulator.amazonses.com`,
            orgRoleId: basicUserRole.id,
          },
          appUserGrants: [
            {
              appId: app1.id,
              appRoleId: adminAppRole.id,
            },
            {
              appId: app2.id,
              appRoleId: devAppRole.id,
            },
          ],
        },
      ],
      promise = dispatch<Client.Action.ClientActions["InviteUsers"]>(
        {
          type: Client.ActionType.INVITE_USERS,
          payload: inviteParams,
        },
        accountId
      );

    state = getState(accountId);
    expect(Object.values(state.generatingInvites)[0]).toEqual(inviteParams);

    const res = await promise;
    expect(res.success).toBeTrue();

    state = getState(accountId);
    expect(state.generatingInvites).toEqual({});
    expect(state.generatedInvites.length).toBe(inviteParams.length);

    const { invites, orgUsers, appUserGrants } = graphTypes(state.graph);
    expect(invites.length).toBe(6);
    expect(orgUsers.length).toBe(7);
    expect(appUserGrants.length).toBe(6);

    return state.generatedInvites;
  },
  inviteBasicUser = async (accountId: string, i?: number) => {
    await dispatch(
      {
        type: Client.ActionType.CLEAR_GENERATED_INVITES,
      },
      accountId
    );
    let state = getState(accountId);

    const byType = graphTypes(state.graph),
      [basicUserRole] = R.props<string, Rbac.OrgRole>(
        ["Basic User", "Org Admin", "Org Owner"],
        R.indexBy(R.prop("name"), byType.orgRoles)
      ),
      [devAppRole, _, adminAppRole] = R.props<string, Rbac.AppRole>(
        ["Developer", "DevOps", "Admin"],
        R.indexBy(R.prop("name"), byType.appRoles)
      ),
      [app1, app2] = R.props<string, Model.App>(
        ["Test App 1", "Test App 2"],
        R.indexBy(R.prop("name"), byType.apps)
      );

    const tag = i ? i.toString() : secureRandomAlphanumeric(22).toLowerCase(),
      inviteParams = [
        {
          user: {
            firstName: "Invited-Mixed-App-Admin/Dev",
            lastName: "Test",
            email: `success+basic-${tag}-${getTestId()}@simulator.amazonses.com`,
            provider: <const>"email",
            uid: `success+basic-${tag}-${getTestId()}@simulator.amazonses.com`,
            orgRoleId: basicUserRole.id,
          },
          appUserGrants: [
            {
              appId: app1.id,
              appRoleId: adminAppRole.id,
            },
            {
              appId: app2.id,
              appRoleId: devAppRole.id,
            },
          ],
        },
      ];

    const res = await dispatch<Client.Action.ClientActions["InviteUsers"]>(
      {
        type: Client.ActionType.INVITE_USERS,
        payload: inviteParams,
      },
      accountId
    );

    expect(res.success).toBeTrue();

    state = getState(accountId);

    return state.generatedInvites[0];
  },
  inviteAdminUser = async (accountId: string, i?: number) => {
    await dispatch(
      {
        type: Client.ActionType.CLEAR_GENERATED_INVITES,
      },
      accountId
    );
    let state = getState(accountId);

    const byType = graphTypes(state.graph),
      [_, orgAdminRole] = R.props<string, Rbac.OrgRole>(
        ["Basic User", "Org Admin", "Org Owner"],
        R.indexBy(R.prop("name"), byType.orgRoles)
      );

    const tag = i ? i.toString() : secureRandomAlphanumeric(22).toLowerCase(),
      inviteParams = [
        {
          user: {
            firstName: "Invited-Org-Admin",
            lastName: "Test",
            email: `success+admin-${tag}-${getTestId()}@simulator.amazonses.com`,
            provider: <const>"email",
            uid: `success+admin-${tag}-${getTestId()}@simulator.amazonses.com`,
            orgRoleId: orgAdminRole.id,
          },
        },
      ],
      res = await dispatch<Client.Action.ClientActions["InviteUsers"]>(
        {
          type: Client.ActionType.INVITE_USERS,
          payload: inviteParams,
        },
        accountId
      );

    if (!res.success) {
      log("INVITE_USERS failed", res.resultAction);
    }

    expect(res.success).toBeTrue();

    state = getState(accountId);

    return state.generatedInvites[0];
  },
  inviteOwner = async (accountId: string, i?: number) => {
    await dispatch(
      {
        type: Client.ActionType.CLEAR_GENERATED_INVITES,
      },
      accountId
    );
    let state = getState(accountId);

    const byType = graphTypes(state.graph),
      [_, __, ownerRole] = R.props<string, Rbac.OrgRole>(
        ["Basic User", "Org Admin", "Org Owner"],
        R.indexBy(R.prop("name"), byType.orgRoles)
      );

    const tag = i ? i.toString() : secureRandomAlphanumeric(22).toLowerCase(),
      inviteParams = [
        {
          user: {
            firstName: "Invited-Org-Admin",
            lastName: "Test",
            email: `success+owner-${tag}-${getTestId()}@simulator.amazonses.com`,
            provider: <const>"email",
            uid: `success+owner-${tag}-${getTestId()}@simulator.amazonses.com`,
            orgRoleId: ownerRole.id,
          },
        },
      ],
      promise = dispatch<Client.Action.ClientActions["InviteUsers"]>(
        {
          type: Client.ActionType.INVITE_USERS,
          payload: inviteParams,
        },
        accountId
      );

    state = getState(accountId);
    expect(Object.values(state.generatingInvites)[0]).toEqual(inviteParams);

    const res = await promise;
    expect(res.success).toBeTrue();

    state = getState(accountId);

    return state.generatedInvites[0];
  },
  acceptInvite = async (
    params: Client.State["generatedInvites"][0],
    newDeviceContext?: true
  ): Promise<string | undefined> => {
    let deviceStoreId = params.user.id;
    if (newDeviceContext) {
      deviceStoreId += "|" + uuid();
    }

    const [{ skey: emailToken }] = await query<Api.Db.InvitePointer>({
        pkey: ["invite", params.identityHash].join("|"),
        transactionConn: undefined,
      }),
      encryptionToken = [params.identityHash, params.encryptionKey].join("_"),
      loadPromise = dispatch<Client.Action.ClientActions["LoadInvite"]>(
        {
          type: Client.ActionType.LOAD_INVITE,
          payload: {
            emailToken,
            encryptionToken,
          },
        },
        undefined,
        deviceStoreId
      );

    let state = getState(undefined, deviceStoreId);
    expect(state.isLoadingInvite).toBe(true);

    const loadRes = await loadPromise;

    if (!loadRes.success) {
      log("", loadRes.resultAction);
    }

    expect(loadRes.success).toBeTrue();

    state = getState(undefined, deviceStoreId);
    expect(state.isLoadingInvite).toBeUndefined();
    expect(state.loadedInviteEmailToken).toBe(emailToken);
    expect(state.loadedInviteIdentityHash).toBe(params.identityHash);
    expect(state.loadedInvitePrivkey).toBeObject();
    expect(state.loadedInviteOrgId).toBeString();
    expect(state.loadedInvite).toEqual(
      expect.objectContaining({
        id: expect.toBeString(),
        encryptedPrivkey: expect.toBeObject(),
        pubkey: expect.toBeObject(),
        invitedByDeviceId: expect.toBeString(),
        invitedByUserId: expect.toBeString(),
        inviteeId: expect.toBeString(),
      })
    );

    expect(state.graph).toBeObject();

    const acceptPromise = dispatch<Client.Action.ClientActions["AcceptInvite"]>(
      {
        type: Client.ActionType.ACCEPT_INVITE,
        payload: {
          deviceName: "device1",
          emailToken,
          encryptionToken,
        },
      },
      params.user.id,
      deviceStoreId
    );

    state = getState(params.user.id, deviceStoreId);
    // expect(state.isAcceptingInvite).toBe(true);

    const acceptRes = await acceptPromise;

    if (!acceptRes.success) {
      log("", acceptRes.resultAction);
    }

    expect(acceptRes.success).toBeTrue();

    state = getState(params.user.id, deviceStoreId);
    expect(state.isAcceptingInvite).toBeUndefined();

    expect(state.isLoadingInvite).toBeUndefined();
    expect(state.loadedInviteEmailToken).toBeUndefined();
    expect(state.loadedInviteIdentityHash).toBeUndefined();
    expect(state.loadedInvitePrivkey).toBeUndefined();
    expect(state.loadedInviteOrgId).toBeUndefined();
    expect(state.loadedInvite).toBeUndefined();

    expect(state.graph).toBeObject();

    return deviceStoreId;
  };
