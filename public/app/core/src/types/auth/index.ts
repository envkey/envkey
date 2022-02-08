import Api from "../api";
import { Rbac, Billing, Model } from "..";
import * as z from "zod";

export namespace Auth {
  export const CLOUD_OAUTH_PROVIDERS = {
      github: "GitHub",
      gitlab: "GitLab",
      google: "Google",
    },
    HOSTED_OAUTH_PROVIDERS = {
      github_hosted: "GitHub Business",
      gitlab_hosted: "GitLab Self-hosted",
    },
    OAUTH_PROVIDERS = {
      ...CLOUD_OAUTH_PROVIDERS,
      ...HOSTED_OAUTH_PROVIDERS,
    },
    SSO_PROVIDERS = {
      saml: "SAML",
    },
    EXTERNAL_AUTH_PROVIDERS = {
      ...OAUTH_PROVIDERS,
      ...SSO_PROVIDERS,
    },
    AUTH_PROVIDERS = {
      email: "Email",
      ...EXTERNAL_AUTH_PROVIDERS,
    },
    PROVIDER_AUTH_METHODS = <const>{
      email: "email",
      github: "oauth_cloud",
      gitlab: "oauth_cloud",
      google: "oauth_cloud",
      gitlab_hosted: "oauth_hosted",
      github_hosted: "oauth_hosted",
      saml: "saml",
    },
    SAML_NAME_ID_FORMATS = <const>{
      email: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
      persistent: "urn:oasis:names:tc:SAML:2.0:nameid-format:persistent",
    },
    SAML_ATTRIBUTE_DEFAULT_MAPPINGS = <const>{
      emailAddress: "email_address",
      firstName: "first_name",
      lastName: "last_name",
    },
    SAML_KNOWN_IDENTITY_PROVIDERS = <const>{
      okta: "Okta",
      google: "Google",
      azure_ad: "Azure AD",
      other: "Other",
    },
    PROVISIONING_PROVIDER_AUTH_SCHEMES = <const>{
      bearer: "bearer",
      // "oauth2", "http-basic-auth"
    },
    PROVISIONING_PROVIDER_AUTH_FRIENDLY_NAMES: Record<
      ProvisioningAuthScheme,
      string
    > = {
      bearer: "Long-lived Auth Header Bearer Token",
    },
    AUTH_TYPE_ACTION_NAMES = <const>{
      sign_up: "create an organization",
      sign_in: "sign in",
      invite_users: "send an invitation",
      accept_invite: "accept an invitation",
      accept_device_grant: "accept a device invitation",
      redeem_recovery_key: "redeem a recovery key",
    };

  export type SamlMappable = keyof typeof SAML_ATTRIBUTE_DEFAULT_MAPPINGS;
  export type SamlKnownIDP = keyof typeof SAML_KNOWN_IDENTITY_PROVIDERS;

  export type AuthType = keyof typeof AUTH_TYPE_ACTION_NAMES;
  export const AuthTypeSchema = z.enum(
    Object.keys(AUTH_TYPE_ACTION_NAMES) as [AuthType, ...AuthType[]]
  );

  export type ProvisioningAuthScheme =
    keyof typeof PROVISIONING_PROVIDER_AUTH_SCHEMES;

  export const ExternalAuthMethodSchema = z.enum([
    "oauth_cloud",
    "oauth_hosted",
    "saml",
  ]);
  export type ExternalAuthMethod = z.infer<typeof ExternalAuthMethodSchema>;

  export const AuthMethodSchema = z.union([
    z.literal("email"),
    ExternalAuthMethodSchema,
  ]);
  export type AuthMethod = z.infer<typeof AuthMethodSchema>;

  export const CloudOauthProviderTypeSchema = z.enum(
    Object.keys(CLOUD_OAUTH_PROVIDERS) as [
      keyof typeof CLOUD_OAUTH_PROVIDERS,
      keyof typeof CLOUD_OAUTH_PROVIDERS,
      ...(keyof typeof CLOUD_OAUTH_PROVIDERS)[]
    ]
  );
  export type CloudOauthProviderType = z.infer<
    typeof CloudOauthProviderTypeSchema
  >;

  export const HostedOauthProviderTypeSchema = z.enum(
    Object.keys(HOSTED_OAUTH_PROVIDERS) as [
      keyof typeof HOSTED_OAUTH_PROVIDERS,
      keyof typeof HOSTED_OAUTH_PROVIDERS,
      ...(keyof typeof HOSTED_OAUTH_PROVIDERS)[]
    ]
  );
  export type HostedOauthProviderType = z.infer<
    typeof HostedOauthProviderTypeSchema
  >;

  export const OauthProviderTypeSchema = z.enum(
    Object.keys(OAUTH_PROVIDERS) as [
      keyof typeof OAUTH_PROVIDERS,
      keyof typeof OAUTH_PROVIDERS,
      ...(keyof typeof OAUTH_PROVIDERS)[]
    ]
  );
  export type OauthProviderType = z.infer<typeof OauthProviderTypeSchema>;

  export const ExternalAuthProviderTypeSchema = z.enum(
    Object.keys(EXTERNAL_AUTH_PROVIDERS) as [
      keyof typeof EXTERNAL_AUTH_PROVIDERS,
      keyof typeof EXTERNAL_AUTH_PROVIDERS,
      ...(keyof typeof EXTERNAL_AUTH_PROVIDERS)[]
    ]
  );
  export type ExternalAuthProviderType = z.infer<
    typeof ExternalAuthProviderTypeSchema
  >;

  export const AuthProviderTypeSchema = z.enum(
    Object.keys(AUTH_PROVIDERS) as [
      keyof typeof AUTH_PROVIDERS,
      keyof typeof AUTH_PROVIDERS,
      ...(keyof typeof AUTH_PROVIDERS)[]
    ]
  );
  export type AuthProviderType = z.infer<typeof AuthProviderTypeSchema>;

  export const InviteExternalAuthUsersTypeSchema = z.enum([
    "initial",
    "re-authenticate",
  ]);
  export type InviteExternalAuthUsersTyp = z.infer<
    typeof InviteExternalAuthUsersTypeSchema
  >;

  export const ProvisioningProviderAuthSchemeTypeSchema = z.enum(
    Object.keys(PROVISIONING_PROVIDER_AUTH_SCHEMES) as [
      keyof typeof PROVISIONING_PROVIDER_AUTH_SCHEMES,
      keyof typeof PROVISIONING_PROVIDER_AUTH_SCHEMES,
      ...(keyof typeof PROVISIONING_PROVIDER_AUTH_SCHEMES)[]
    ]
  );

  export const BearerTokenAuthParamsSchema = z.object({
    type: z.literal("bearerTokenAuthParams"),
    providerId: z.string(),
    secret: z.string().optional(),
  });
  export type BearerTokenAuthParams = z.infer<
    typeof BearerTokenAuthParamsSchema
  >;

  export const TokenAuthParamsSchema = z.object({
    type: z.literal("tokenAuthParams"),
    token: z.string(),
    userId: z.string(),
    orgId: z.string(),
    deviceId: z.string(),
    signature: z.string(),
  });
  export type TokenAuthParams = z.infer<typeof TokenAuthParamsSchema>;

  export const CliAuthParamsSchema = z.object({
    type: z.literal("cliAuthParams"),
    userId: z.string(),
    orgId: z.string(),
    signature: z.string(),
  });
  export type CliAuthParams = z.infer<typeof CliAuthParamsSchema>;

  export const LoadInviteAuthParamsSchema = z.object({
    type: z.literal("loadInviteAuthParams"),
    identityHash: z.string(),
    emailToken: z.string(),
  });
  export type LoadInviteAuthParams = z.infer<typeof LoadInviteAuthParamsSchema>;

  export const LoadDeviceGrantAuthParamsSchema = z.object({
    type: z.literal("loadDeviceGrantAuthParams"),
    identityHash: z.string(),
    emailToken: z.string(),
  });
  export type LoadDeviceGrantAuthParams = z.infer<
    typeof LoadDeviceGrantAuthParamsSchema
  >;

  export const LoadRecoveryKeyAuthParamsSchema = z.object({
    type: z.literal("loadRecoveryKeyAuthParams"),
    identityHash: z.string(),
  });
  export type LoadRecoveryKeyAuthParams = z.infer<
    typeof LoadRecoveryKeyAuthParamsSchema
  >;

  export const AcceptInviteAuthParamsSchema = z.object({
    type: z.literal("acceptInviteAuthParams"),
    identityHash: z.string(),
    emailToken: z.string(),
    signature: z.string(),
  });
  export type AcceptInviteAuthParams = z.infer<
    typeof AcceptInviteAuthParamsSchema
  >;

  export const AcceptDeviceGrantAuthParamsSchema = z.object({
    type: z.literal("acceptDeviceGrantAuthParams"),
    identityHash: z.string(),
    signature: z.string(),
    emailToken: z.string(),
  });
  export type AcceptDeviceGrantAuthParams = z.infer<
    typeof AcceptDeviceGrantAuthParamsSchema
  >;

  export const RedeemRecoveryKeyAuthParamsSchema = z.object({
    type: z.literal("redeemRecoveryKeyAuthParams"),
    identityHash: z.string(),
    signature: z.string(),
  });
  export type RedeemRecoveryKeyAuthParams = z.infer<
    typeof RedeemRecoveryKeyAuthParamsSchema
  >;

  export const FetchEnvkeySocketAuthParamsSchema = z.object({
    type: z.literal("fetchEnvkeySocketAuthParams"),
    envkeyIdPart: z.string(),
    connectionId: z.string(),
  });
  export type FetchEnvkeySocketAuthParams = z.infer<
    typeof FetchEnvkeySocketAuthParamsSchema
  >;

  export const AuthParamsSchema = z.union([
    TokenAuthParamsSchema,
    BearerTokenAuthParamsSchema,
    CliAuthParamsSchema,
    LoadInviteAuthParamsSchema,
    LoadDeviceGrantAuthParamsSchema,
    LoadRecoveryKeyAuthParamsSchema,
    AcceptInviteAuthParamsSchema,
    AcceptDeviceGrantAuthParamsSchema,
    RedeemRecoveryKeyAuthParamsSchema,
  ]);
  export type ApiAuthParams = z.infer<typeof AuthParamsSchema>;

  export type DefaultAuthParams = TokenAuthParams | CliAuthParams;

  type UserAuthContextBase = {
    user: Api.Db.OrgUser;
    org: Api.Db.Org;
    orgStats?: Model.OrgStats;
    license: Billing.License;
    orgRole: Api.Db.OrgRole;
    orgPermissions: Set<Rbac.OrgPermission>;
  };

  export type ProvisioningBearerAuthContext = {
    type: "provisioningBearerAuthContext";
    provisioningProvider: Api.Db.ScimProvisioningProvider;
    org: Api.Db.Org;
    orgStats?: Model.OrgStats;
    license: Billing.License;
  };

  export type TokenAuthContext = UserAuthContextBase & {
    type: "tokenAuthContext";
    authToken: Api.Db.AuthToken;
    orgUserDevice: Api.Db.OrgUserDevice;
  };
  export type InviteAuthContext = UserAuthContextBase & {
    type: "inviteAuthContext";
    invite: Api.Db.Invite;
  };

  export type DeviceGrantAuthContext = UserAuthContextBase & {
    type: "deviceGrantAuthContext";
    deviceGrant: Api.Db.DeviceGrant;
  };

  export type RecoveryKeyAuthContext = UserAuthContextBase & {
    type: "recoveryKeyAuthContext";
    recoveryKey: Api.Db.RecoveryKey;
  };

  export type CliUserAuthContext = {
    type: "cliUserAuthContext";
    org: Api.Db.Org;
    orgStats?: Model.OrgStats;
    license: Billing.License;
    user: Api.Db.CliUser;
    orgRole: Api.Db.OrgRole;
    orgPermissions: Set<Rbac.OrgPermission>;
  };

  export type DefaultAuthContext = TokenAuthContext | CliUserAuthContext;

  export type UserAuthContext =
    | TokenAuthContext
    | InviteAuthContext
    | DeviceGrantAuthContext
    | CliUserAuthContext
    | RecoveryKeyAuthContext;

  export type AuthContext = UserAuthContext | ProvisioningBearerAuthContext;

  export type EnvkeySocketAuthContext = {
    type: "envkeySocketAuthContext";
    generatedEnvkey: Api.Db.GeneratedEnvkey;
    connectionId: string;
  };
}
