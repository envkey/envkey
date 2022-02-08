import { Client, Auth } from "../../types";
import { sha256 } from "../crypto/utils";
import { pick } from "../utils/pick";
import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import * as R from "ramda";

export const getAuth = <
    T extends Client.ClientUserAuth | Client.ClientCliAuth =
      | Client.ClientUserAuth
      | Client.ClientCliAuth
  >(
    state: Client.State,
    accountIdOrCliKey: string | undefined
  ): T | undefined =>
    (accountIdOrCliKey
      ? state.orgUserAccounts[accountIdOrCliKey] ??
        state.cliKeyAccounts[sha256(accountIdOrCliKey)]
      : undefined) as T | undefined,
  getApiAuthParams = (
    accountAuth: Client.ClientUserAuth | Client.ClientCliAuth
  ) => {
    let authPropsBase: Partial<Auth.ApiAuthParams>, toSign: string[];

    if (accountAuth.type == "clientCliAuth") {
      const props = [<const>"userId", <const>"orgId"];
      toSign = R.props(props, accountAuth) as string[];
      authPropsBase = {
        type: "cliAuthParams",
        ...pick(props, accountAuth),
      };
    } else {
      if (!accountAuth.token) {
        throw new Error("Action requires authentication.");
      }

      const props = [
        <const>"token",
        <const>"userId",
        <const>"orgId",
        <const>"deviceId",
      ];
      toSign = R.props(
        props,
        accountAuth as Required<Client.ClientUserAuth>
      ) as string[];
      authPropsBase = {
        type: "tokenAuthParams",
        ...pick(props, accountAuth),
      };
    }

    return {
      ...authPropsBase,
      signature: naclUtil.encodeBase64(
        nacl.sign.detached(
          naclUtil.decodeUTF8(JSON.stringify(toSign)),
          naclUtil.decodeBase64(accountAuth.privkey.keys.signingKey)
        )
      ),
    } as Auth.ApiAuthParams;
  };
