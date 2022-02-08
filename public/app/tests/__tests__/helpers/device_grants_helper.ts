import { getState, dispatch } from "./test_helper";
import { Client, Api } from "@core/types";
import { query } from "@api_shared/db";
import { v4 as uuid } from "uuid";
import { log } from "@core/lib/utils/logger";

export const acceptDeviceGrant = async (
  accountId: string,
  params: Client.State["generatedDeviceGrants"][0],
  newDeviceContext?: true
): Promise<string | undefined> => {
  let deviceStoreId: string = accountId;
  if (newDeviceContext) {
    deviceStoreId += "|" + uuid();
  }

  const encryptionToken = [params.identityHash, params.encryptionKey].join("_");

  const [{ skey: emailToken }] = await query<Api.Db.DeviceGrantPointer>({
      pkey: ["deviceGrant", params.identityHash].join("|"),
      transactionConn: undefined,
    }),
    loadPromise = dispatch<Client.Action.ClientActions["LoadDeviceGrant"]>(
      {
        type: Client.ActionType.LOAD_DEVICE_GRANT,
        payload: {
          emailToken,
          encryptionToken,
        },
      },
      undefined,
      deviceStoreId
    );

  let state = getState(undefined, deviceStoreId);
  expect(state.isLoadingDeviceGrant).toBe(true);

  const loadRes = await loadPromise;

  if (!loadRes.success) {
    log("loading device grant failed", (loadRes.resultAction as any).payload);
  }

  expect(loadRes.success).toBeTrue();

  state = getState(undefined, deviceStoreId);
  expect(state.isLoadingDeviceGrant).toBeUndefined();
  expect(state.loadedDeviceGrantEmailToken).toBe(emailToken);
  expect(state.loadedDeviceGrantIdentityHash).toBe(params.identityHash);
  expect(state.loadedDeviceGrantPrivkey).toBeObject();
  expect(state.loadedDeviceGrantOrgId).toBeString();
  expect(state.loadedDeviceGrant).toEqual(
    expect.objectContaining({
      id: expect.toBeString(),
      encryptedPrivkey: expect.toBeObject(),
      pubkey: expect.toBeObject(),
      grantedByDeviceId: expect.toBeString(),
      grantedByUserId: expect.toBeString(),
      granteeId: expect.toBeString(),
    })
  );

  expect(state.graph).toBeObject();

  const acceptPromise = dispatch(
    {
      type: Client.ActionType.ACCEPT_DEVICE_GRANT,
      payload: {
        deviceName: `device-${uuid()}`,
        emailToken,
        encryptionToken,
      },
    },
    accountId,
    deviceStoreId
  );

  state = getState(accountId, deviceStoreId);

  // expect(state.isAcceptingDeviceGrant).toBe(true);

  const acceptRes = await acceptPromise;

  expect(acceptRes.success).toBeTrue();

  state = getState(accountId, deviceStoreId);
  expect(state.isAcceptingDeviceGrant).toBeUndefined();

  expect(state.isLoadingDeviceGrant).toBeUndefined();
  expect(state.loadedDeviceGrantEmailToken).toBeUndefined();
  expect(state.loadedDeviceGrantIdentityHash).toBeUndefined();
  expect(state.loadedDeviceGrantPrivkey).toBeUndefined();
  expect(state.loadedDeviceGrantOrgId).toBeUndefined();
  expect(state.loadedDeviceGrant).toBeUndefined();

  expect(state.graph).toBeObject();

  return deviceStoreId;
};
