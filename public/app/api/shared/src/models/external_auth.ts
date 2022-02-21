import { v4 as uuid } from "uuid";
import * as R from "ramda";
import { Api, Auth } from "@core/types";

export const getNonSamlExternalAuthSessionSkey = (params: {
  orgId: string | undefined;
  userId: string | undefined;
  provider: Auth.ExternalAuthProviderType;
  authType: Auth.AuthType;
}) =>
  [params.orgId, params.userId, params.provider, params.authType]
    .filter(Boolean)
    .join("|");

export const getCreateExternalAuthProviderWithTransactionItems = (
  externalAuthSession: Api.Db.ExternalAuthSession,
  orgId: string,
  userId: string,
  now: number
): [Api.Db.ExternalAuthProvider, Api.Db.ObjectTransactionItems] | undefined => {
  if (externalAuthSession.provider === "saml") {
    throw new TypeError(
      `Cannot create external auth provider automatically for SAML`
    );
  }
  if (
    externalAuthSession.authMethod == "oauth_hosted" &&
    (externalAuthSession.authType == "sign_up" ||
      (externalAuthSession.authType == "invite_users" &&
        externalAuthSession.inviteExternalAuthUsersType == "initial"))
  ) {
    const id = uuid(),
      externalAuthProvider: Api.Db.ExternalAuthProvider = {
        type: "externalAuthProvider",
        id,
        pkey: [orgId, "externalAuthProviders"].join("|"),
        skey: id,
        ...R.pick(
          ["authMethod", "provider", "providerSettings", "orgId"],
          externalAuthSession
        ),
        nickname: externalAuthSession.provider,
        orgId,
        verifiedByExternalAuthSessionId: externalAuthSession.id,
        verifiedByUserId: (userId || externalAuthSession.userId)!,
        createdAt: now,
        updatedAt: now,
      };

    return [
      externalAuthProvider,
      {
        softDeleteKeys: [R.pick(["pkey", "skey"], externalAuthSession)],
        puts: [
          externalAuthProvider,
          {
            ...externalAuthSession,
            externalAuthProviderId: id,
            orgId,
            userId,
            updatedAt: now,
            skey: getNonSamlExternalAuthSessionSkey({
              orgId,
              userId,
              provider: externalAuthSession.provider,
              authType: externalAuthSession.authType,
            }),
          } as Api.Db.ExternalAuthSession,
        ],
        updates: [],
      },
    ];
  }

  return undefined;
};
