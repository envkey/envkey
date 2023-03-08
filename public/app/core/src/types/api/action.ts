import { Net } from "./net";
import { Auth } from "../auth";
import { Logs } from "../logs";
import Client from "../client";
import ActionType from "./action_type";
import * as z from "zod";

export namespace Action {
  type RequestActionType<
    T extends ActionType,
    Meta extends {
      loggableType: Logs.LoggableType;
      loggableType2?: Logs.LoggableType;
      loggableType3?: Logs.LoggableType;
      loggableType4?: Logs.LoggableType;
      auth?: Auth.ApiAuthParams;
      graphUpdatedAt?: number;
    },
    Payload extends Net.ApiParams
  > = {
    type: T;
    meta: Meta & {
      client: Client.ClientParams;
    };
    payload: Payload;
  };

  export type HostActions = {
    CreateExternalAuthSession: RequestActionType<
      ActionType.CREATE_EXTERNAL_AUTH_SESSION,
      {
        loggableType: "hostAction";
      },
      Net.ApiParamTypes["CreateExternalAuthSession"]
    >;
    CreateExternalAuthInviteSession: RequestActionType<
      ActionType.CREATE_EXTERNAL_AUTH_INVITE_SESSION,
      {
        loggableType: "hostAction";
        auth: Auth.TokenAuthParams;
      },
      Net.ApiParamTypes["CreateExternalAuthInviteSession"]
    >;
    GetExternalAuthSession: RequestActionType<
      ActionType.GET_EXTERNAL_AUTH_SESSION,
      {
        loggableType: "hostAction";
      },
      Net.ApiParamTypes["GetExternalAuthSession"]
    >;
    CreateEmailVerification: RequestActionType<
      ActionType.CREATE_EMAIL_VERIFICATION,
      {
        loggableType: "hostAction";
      },
      Net.ApiParamTypes["CreateEmailVerification"]
    >;
    CheckEmailTokenValid: RequestActionType<
      ActionType.CHECK_EMAIL_TOKEN_VALID,
      {
        loggableType: "hostAction";
      },
      Net.ApiParamTypes["CheckEmailTokenValid"]
    >;
    OauthCallback: {
      type: ActionType.OAUTH_CALLBACK;
      payload: Net.ApiParamTypes["OauthCallback"];
      meta: {
        loggableType: "hostAction";
        client?: undefined;
      };
    };
    // Assertion Consumer Service
    SamlAcsCallback: {
      type: ActionType.SAML_ACS_CALLBACK;
      payload: Net.ApiParamTypes["SamlAcsCallback"];
      meta: {
        loggableType: "hostAction";
        client?: undefined;
      };
    };

    InitSelfHosted: RequestActionType<
      ActionType.INIT_SELF_HOSTED,
      {
        loggableType: "hostAction";
      },
      Net.ApiParamTypes["InitSelfHosted"]
    >;

    IntegrationsVantaOauthCallback: {
      type: ActionType.INTEGRATIONS_VANTA_OAUTH_CALLBACK;
      payload: Net.ApiParamTypes["IntegrationsVantaOauthCallback"];
      meta: {
        loggableType: "hostAction";
        client?: undefined;
      };
    };

    CloudBillingLoadProducts: RequestActionType<
      ActionType.CLOUD_BILLING_LOAD_PRODUCTS,
      {
        loggableType: "hostAction";
      },
      Net.ApiParamTypes["CloudBillingLoadProducts"]
    >;
  };

  export type AuthActions = {
    Register: RequestActionType<
      ActionType.REGISTER,
      {
        loggableType: "authAction";
        loggableType2: "orgAction";
      },
      Net.ApiParamTypes["Register"]
    >;

    CreateSession: RequestActionType<
      ActionType.CREATE_SESSION,
      {
        loggableType: "authAction";
      },
      Net.ApiParamTypes["CreateSession"]
    >;

    AuthenticateCliKey: RequestActionType<
      ActionType.AUTHENTICATE_CLI_KEY,
      {
        loggableType: "authAction";
      },
      Net.ApiParamTypes["AuthenticateCliKey"]
    >;

    DeleteOrg: RequestActionType<
      ActionType.DELETE_ORG,
      {
        loggableType: "authAction";
        loggableType2: "orgAction";
        auth: Auth.TokenAuthParams;
      },
      Net.ApiParamTypes["DeleteOrg"]
    >;

    GetExternalAuthProviders: RequestActionType<
      ActionType.GET_EXTERNAL_AUTH_PROVIDERS,
      {
        loggableType: "authAction";
        auth: Auth.TokenAuthParams;
      },
      Net.ApiParamTypes["GetExternalAuthProviders"]
    >;

    GetExternalAuthUsers: RequestActionType<
      ActionType.GET_EXTERNAL_AUTH_USERS,
      {
        loggableType: "authAction";
        auth: Auth.TokenAuthParams;
      },
      Net.ApiParamTypes["GetExternalAuthUsers"]
    >;

    GetExternalAuthOrgs: RequestActionType<
      ActionType.GET_EXTERNAL_AUTH_ORGS,
      {
        loggableType: "authAction";
        auth: Auth.TokenAuthParams;
      },
      Net.ApiParamTypes["GetExternalAuthOrgs"]
    >;

    UpdateTrustedRootPubkey: RequestActionType<
      ActionType.UPDATE_TRUSTED_ROOT_PUBKEY,
      {
        loggableType: "authAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["UpdateTrustedRootPubkey"]
    >;

    EnvkeyFetchUpdateTrustedRootPubkey: RequestActionType<
      ActionType.ENVKEY_FETCH_UPDATE_TRUSTED_ROOT_PUBKEY,
      {
        loggableType: "authAction";
      },
      Net.ApiParamTypes["EnvkeyFetchUpdateTrustedRootPubkey"]
    >;

    ClearToken: RequestActionType<
      ActionType.CLEAR_TOKEN,
      {
        loggableType: "authAction";
        auth: Auth.TokenAuthParams;
      },
      Net.ApiParamTypes["ClearToken"]
    >;

    ClearUserTokens: RequestActionType<
      ActionType.CLEAR_USER_TOKENS,
      {
        loggableType: "authAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["ClearUserTokens"]
    >;

    ClearOrgTokens: RequestActionType<
      ActionType.CLEAR_ORG_TOKENS,
      {
        loggableType: "authAction";
        auth: Auth.TokenAuthParams;
      },
      Net.ApiParamTypes["ClearOrgTokens"]
    >;

    ListInvitableScimUsers: RequestActionType<
      ActionType.LIST_INVITABLE_SCIM_USERS,
      {
        loggableType: "authAction";
        loggableType2: "scimAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["ListInvitableScimUsers"]
    >;

    FetchOrgStats: RequestActionType<
      ActionType.FETCH_ORG_STATS,
      {
        loggableType: "authAction";
        auth: Auth.TokenAuthParams;
      },
      Net.ApiParamTypes["FetchOrgStats"]
    >;

    CloudBillingFetchInvoices: RequestActionType<
      ActionType.CLOUD_BILLING_FETCH_INVOICES,
      {
        loggableType: "authAction";
        loggableType2: "billingAction";
        auth: Auth.TokenAuthParams;
      },
      Net.ApiParamTypes["CloudBillingFetchInvoices"]
    >;

    CloudBillingCheckPromotionCode: RequestActionType<
      ActionType.CLOUD_BILLING_CHECK_PROMOTION_CODE,
      {
        loggableType: "authAction";
        loggableType2: "billingAction";
        auth: Auth.TokenAuthParams;
      },
      Net.ApiParamTypes["CloudBillingCheckPromotionCode"]
    >;

    UnsubscribeCloudLifecycleEmails: RequestActionType<
      ActionType.UNSUBSCRIBE_CLOUD_LIFECYCLE_EMAILS,
      {
        loggableType: "authAction";
      },
      Net.ApiParamTypes["UnsubscribeCloudLifecycleEmails"]
    >;

    IntegrationsVantaCreateExternalAuthSession: RequestActionType<
      ActionType.INTEGRATIONS_VANTA_CREATE_EXTERNAL_AUTH_SESSION,
      {
        loggableType: "authAction";
        auth: Auth.TokenAuthParams;
      },
      Net.ApiParamTypes["IntegrationsVantaCreateExternalAuthSession"]
    >;
    IntegrationsVantaGetExternalAuthSession: RequestActionType<
      ActionType.INTEGRATIONS_VANTA_GET_EXTERNAL_AUTH_SESSION,
      {
        loggableType: "authAction";
        auth: Auth.TokenAuthParams;
      },
      Net.ApiParamTypes["IntegrationsVantaGetExternalAuthSession"]
    >;
  };

  export type ScimProvisioningActions = {
    CheckScimProvider: {
      type: ActionType.CHECK_SCIM_PROVIDER;
      payload: Net.ApiParamTypes["CheckScimProvider"];
      meta: {
        loggableType: "scimAction";
        auth: Auth.BearerTokenAuthParams;
        client?: undefined;
      };
    };

    GetScimUser: {
      type: ActionType.GET_SCIM_USER;
      payload: Net.ApiParamTypes["GetScimUser"];
      meta: {
        loggableType: "scimAction";
        auth: Auth.BearerTokenAuthParams;
        client?: undefined;
      };
    };
    ListScimUsers: {
      type: ActionType.LIST_SCIM_USERS;
      payload: Net.ApiParamTypes["ListScimUsers"];
      meta: {
        loggableType: "scimAction";
        auth: Auth.BearerTokenAuthParams;
        client?: undefined;
      };
    };
  };

  export type FetchActions = {
    GetSession: RequestActionType<
      ActionType.GET_SESSION,
      {
        loggableType: "fetchMetaAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["GetSession"]
    >;

    LoadInvite: RequestActionType<
      ActionType.LOAD_INVITE,
      {
        loggableType: "fetchMetaAction";
        loggableType2: "authAction";
        auth: Auth.LoadInviteAuthParams;
      },
      Net.ApiParamTypes["LoadInvite"]
    >;

    LoadRecoveryKey: RequestActionType<
      ActionType.LOAD_RECOVERY_KEY,
      {
        loggableType: "fetchMetaAction";
        loggableType2: "authAction";
        auth: Auth.TokenAuthParams;
      },
      Net.ApiParamTypes["LoadRecoveryKey"]
    >;

    LoadDeviceGrant: RequestActionType<
      ActionType.LOAD_DEVICE_GRANT,
      {
        loggableType: "fetchMetaAction";
        loggableType2: "authAction";
        auth: Auth.LoadDeviceGrantAuthParams;
      },
      Net.ApiParamTypes["LoadDeviceGrant"]
    >;
    FetchEnvs: RequestActionType<
      ActionType.FETCH_ENVS,
      {
        loggableType: "fetchEnvsAction";
        loggableType2: "fetchMetaAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["FetchEnvs"]
    >;
    FetchLogs: RequestActionType<
      ActionType.FETCH_LOGS,
      {
        loggableType: "fetchLogsAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["FetchLogs"]
    >;
    FetchDeletedGraph: RequestActionType<
      ActionType.FETCH_DELETED_GRAPH,
      {
        loggableType: "fetchLogsAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["FetchDeletedGraph"]
    >;
  };

  export type FetchEnvkeyActions = {
    FetchEnvkey: RequestActionType<
      ActionType.FETCH_ENVKEY,
      {
        loggableType: "fetchEnvkeyAction";
        fetchServiceVersion: string;
      },
      Pick<Net.ApiParamTypes["FetchEnvkey"], "envkeyIdPart">
    >;
    CheckEnvkey: RequestActionType<
      ActionType.CHECK_ENVKEY,
      {
        loggableType: "checkEnvkeyAction";
        loggableType2: "authAction";
        fetchServiceVersion: string;
      },
      Pick<Net.ApiParamTypes["CheckEnvkey"], "envkeyIdPart">
    >;
  };

  export type GraphActions = {
    CreateInvite: RequestActionType<
      ActionType.CREATE_INVITE,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["CreateInvite"]
    >;

    AcceptInvite: RequestActionType<
      ActionType.ACCEPT_INVITE,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        loggableType2: "authAction";
        auth: Auth.AcceptInviteAuthParams;
      },
      Net.ApiParamTypes["AcceptInvite"]
    >;

    CreateCliUser: RequestActionType<
      ActionType.CREATE_CLI_USER,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["CreateCliUser"]
    >;

    RenameCliUser: RequestActionType<
      ActionType.RENAME_CLI_USER,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["RenameCliUser"]
    >;

    CreateRecoveryKey: RequestActionType<
      ActionType.CREATE_RECOVERY_KEY,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.TokenAuthParams;
      },
      Net.ApiParamTypes["CreateRecoveryKey"]
    >;

    RedeemRecoveryKey: RequestActionType<
      ActionType.REDEEM_RECOVERY_KEY,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        loggableType2: "authAction";
        auth: Auth.TokenAuthParams;
      },
      Net.ApiParamTypes["RedeemRecoveryKey"]
    >;

    GrantAppAccess: RequestActionType<
      ActionType.GRANT_APP_ACCESS,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["GrantAppAccess"]
    >;
    ConnectBlock: RequestActionType<
      ActionType.CONNECT_BLOCK,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["ConnectBlock"]
    >;
    UpdateEnvs: RequestActionType<
      ActionType.UPDATE_ENVS,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        loggableType2: "updateEnvsAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["UpdateEnvs"]
    >;
    ReencryptEnvs: RequestActionType<
      ActionType.REENCRYPT_ENVS,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["ReencryptEnvs"]
    >;
    GenerateKey: RequestActionType<
      ActionType.GENERATE_KEY,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["GenerateKey"]
    >;
    UpdateUserRole: RequestActionType<
      ActionType.UPDATE_USER_ROLE,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["UpdateUserRole"]
    >;
    CreateDeviceGrant: RequestActionType<
      ActionType.CREATE_DEVICE_GRANT,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["CreateDeviceGrant"]
    >;
    AcceptDeviceGrant: RequestActionType<
      ActionType.ACCEPT_DEVICE_GRANT,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        loggableType2: "authAction";
        auth: Auth.AcceptDeviceGrantAuthParams;
      },
      Net.ApiParamTypes["AcceptDeviceGrant"]
    >;
    RbacUpdateOrgRole: RequestActionType<
      ActionType.RBAC_UPDATE_ORG_ROLE,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["RbacUpdateOrgRole"]
    >;
    RbacUpdateEnvironmentRole: RequestActionType<
      ActionType.RBAC_UPDATE_ENVIRONMENT_ROLE,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["RbacUpdateEnvironmentRole"]
    >;
    RbacUpdateEnvironmentRoleSettings: RequestActionType<
      ActionType.RBAC_UPDATE_ENVIRONMENT_ROLE_SETTINGS,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["RbacUpdateEnvironmentRoleSettings"]
    >;
    RbacReorderEnvironmentRoles: RequestActionType<
      ActionType.RBAC_REORDER_ENVIRONMENT_ROLES,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["RbacReorderEnvironmentRoles"]
    >;
    RbacUpdateAppRole: RequestActionType<
      ActionType.RBAC_UPDATE_APP_ROLE,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["RbacUpdateAppRole"]
    >;
    CreateGroupMembership: RequestActionType<
      ActionType.CREATE_GROUP_MEMBERSHIP,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["CreateGroupMembership"]
    >;
    CreateAppUserGroup: RequestActionType<
      ActionType.CREATE_APP_USER_GROUP,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["CreateAppUserGroup"]
    >;
    CreateAppGroupUserGroup: RequestActionType<
      ActionType.CREATE_APP_GROUP_USER_GROUP,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["CreateAppGroupUserGroup"]
    >;
    CreateAppGroupUser: RequestActionType<
      ActionType.CREATE_APP_GROUP_USER,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["CreateAppGroupUser"]
    >;
    CreateAppBlockGroup: RequestActionType<
      ActionType.CREATE_APP_BLOCK_GROUP,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["CreateAppBlockGroup"]
    >;
    CreateAppGroupBlock: RequestActionType<
      ActionType.CREATE_APP_GROUP_BLOCK,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["CreateAppGroupBlock"]
    >;
    CreateAppGroupBlockGroup: RequestActionType<
      ActionType.CREATE_APP_GROUP_BLOCK_GROUP,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["CreateAppGroupBlockGroup"]
    >;
    RbacCreateIncludedAppRole: RequestActionType<
      ActionType.RBAC_CREATE_INCLUDED_APP_ROLE,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["RbacCreateIncludedAppRole"]
    >;

    RenameOrg: RequestActionType<
      ActionType.RENAME_ORG,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["RenameOrg"]
    >;

    RenameUser: RequestActionType<
      ActionType.RENAME_USER,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["RenameUser"]
    >;
    RevokeInvite: RequestActionType<
      ActionType.REVOKE_INVITE,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["RevokeInvite"]
    >;

    RevokeDeviceGrant: RequestActionType<
      ActionType.REVOKE_DEVICE_GRANT,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["RevokeDeviceGrant"]
    >;

    RevokeDevice: RequestActionType<
      ActionType.REVOKE_DEVICE,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["RevokeDevice"]
    >;

    UpdateOrgSettings: RequestActionType<
      ActionType.UPDATE_ORG_SETTINGS,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["UpdateOrgSettings"]
    >;

    CreateOrgSamlProvider: RequestActionType<
      ActionType.CREATE_ORG_SAML_PROVIDER,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["CreateOrgSamlProvider"]
    >;

    UpdateOrgSamlSettings: RequestActionType<
      ActionType.UPDATE_ORG_SAML_SETTINGS,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["UpdateOrgSamlSettings"]
    >;

    DeleteExternalAuthProvider: RequestActionType<
      ActionType.DELETE_EXTERNAL_AUTH_PROVIDER,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["DeleteExternalAuthProvider"]
    >;

    CreateScimProvisioningProvider: RequestActionType<
      ActionType.CREATE_SCIM_PROVISIONING_PROVIDER,
      {
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["CreateScimProvisioningProvider"]
    >;
    UpdateScimProvisioningProvider: RequestActionType<
      ActionType.UPDATE_SCIM_PROVISIONING_PROVIDER,
      {
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["UpdateScimProvisioningProvider"]
    >;
    DeleteScimProvisioningProvider: RequestActionType<
      ActionType.DELETE_SCIM_PROVISIONING_PROVIDER,
      {
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["DeleteScimProvisioningProvider"]
    >;

    RemoveFromOrg: RequestActionType<
      ActionType.REMOVE_FROM_ORG,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["RemoveFromOrg"]
    >;

    DeleteCliUser: RequestActionType<
      ActionType.DELETE_CLI_USER,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["DeleteCliUser"]
    >;

    CreateApp: RequestActionType<
      ActionType.CREATE_APP,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["CreateApp"]
    >;
    RenameApp: RequestActionType<
      ActionType.RENAME_APP,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["RenameApp"]
    >;
    UpdateAppSettings: RequestActionType<
      ActionType.UPDATE_APP_SETTINGS,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["UpdateAppSettings"]
    >;
    DeleteApp: RequestActionType<
      ActionType.DELETE_APP,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["DeleteApp"]
    >;

    RemoveAppAccess: RequestActionType<
      ActionType.REMOVE_APP_ACCESS,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["RemoveAppAccess"]
    >;

    CreateServer: RequestActionType<
      ActionType.CREATE_SERVER,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["CreateServer"]
    >;
    CreateLocalKey: RequestActionType<
      ActionType.CREATE_LOCAL_KEY,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["CreateLocalKey"]
    >;

    CreateBlock: RequestActionType<
      ActionType.CREATE_BLOCK,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["CreateBlock"]
    >;
    RenameBlock: RequestActionType<
      ActionType.RENAME_BLOCK,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["RenameBlock"]
    >;
    UpdateBlockSettings: RequestActionType<
      ActionType.UPDATE_BLOCK_SETTINGS,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["UpdateBlockSettings"]
    >;
    DeleteBlock: RequestActionType<
      ActionType.DELETE_BLOCK,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["DeleteBlock"]
    >;

    DisconnectBlock: RequestActionType<
      ActionType.DISCONNECT_BLOCK,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";

        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["DisconnectBlock"]
    >;
    ReorderBlocks: RequestActionType<
      ActionType.REORDER_BLOCKS,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["ReorderBlocks"]
    >;

    CreateVariableGroup: RequestActionType<
      ActionType.CREATE_VARIABLE_GROUP,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["CreateVariableGroup"]
    >;
    DeleteVariableGroup: RequestActionType<
      ActionType.DELETE_VARIABLE_GROUP,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["DeleteVariableGroup"]
    >;

    DeleteServer: RequestActionType<
      ActionType.DELETE_SERVER,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["DeleteServer"]
    >;

    DeleteLocalKey: RequestActionType<
      ActionType.DELETE_LOCAL_KEY,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["DeleteLocalKey"]
    >;

    RevokeKey: RequestActionType<
      ActionType.REVOKE_KEY,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["RevokeKey"]
    >;

    RbacCreateOrgRole: RequestActionType<
      ActionType.RBAC_CREATE_ORG_ROLE,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["RbacCreateOrgRole"]
    >;
    RbacDeleteOrgRole: RequestActionType<
      ActionType.RBAC_DELETE_ORG_ROLE,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["RbacDeleteOrgRole"]
    >;

    CreateEnvironment: RequestActionType<
      ActionType.CREATE_ENVIRONMENT,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["CreateEnvironment"]
    >;
    DeleteEnvironment: RequestActionType<
      ActionType.DELETE_ENVIRONMENT,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["DeleteEnvironment"]
    >;
    UpdateEnvironmentSettings: RequestActionType<
      ActionType.UPDATE_ENVIRONMENT_SETTINGS,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["UpdateEnvironmentSettings"]
    >;

    RbacCreateEnvironmentRole: RequestActionType<
      ActionType.RBAC_CREATE_ENVIRONMENT_ROLE,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["RbacCreateEnvironmentRole"]
    >;
    RbacDeleteEnvironmentRole: RequestActionType<
      ActionType.RBAC_DELETE_ENVIRONMENT_ROLE,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";

        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["RbacDeleteEnvironmentRole"]
    >;

    RbacCreateAppRole: RequestActionType<
      ActionType.RBAC_CREATE_APP_ROLE,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["RbacCreateAppRole"]
    >;
    RbacDeleteAppRole: RequestActionType<
      ActionType.RBAC_DELETE_APP_ROLE,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["RbacDeleteAppRole"]
    >;

    DeleteIncludedAppRole: RequestActionType<
      ActionType.DELETE_INCLUDED_APP_ROLE,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["DeleteIncludedAppRole"]
    >;

    CreateGroup: RequestActionType<
      ActionType.CREATE_GROUP,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["CreateGroup"]
    >;
    RenameGroup: RequestActionType<
      ActionType.RENAME_GROUP,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["RenameGroup"]
    >;
    DeleteGroup: RequestActionType<
      ActionType.DELETE_GROUP,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["DeleteGroup"]
    >;

    DeleteGroupMembership: RequestActionType<
      ActionType.DELETE_GROUP_MEMBERSHIP,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["DeleteGroupMembership"]
    >;
    ReorderGroupMemberships: RequestActionType<
      ActionType.REORDER_GROUP_MEMBERSHIPS,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["ReorderGroupMemberships"]
    >;

    DeleteAppUserGroup: RequestActionType<
      ActionType.DELETE_APP_USER_GROUP,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["DeleteAppUserGroup"]
    >;

    DeleteAppGroupUserGroup: RequestActionType<
      ActionType.DELETE_APP_GROUP_USER_GROUP,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["DeleteAppGroupUserGroup"]
    >;

    DeleteAppGroupUser: RequestActionType<
      ActionType.DELETE_APP_GROUP_USER,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["DeleteAppGroupUser"]
    >;

    DeleteAppBlockGroup: RequestActionType<
      ActionType.DELETE_APP_BLOCK_GROUP,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["DeleteAppBlockGroup"]
    >;
    ReorderAppBlockGroups: RequestActionType<
      ActionType.REORDER_APP_BLOCK_GROUPS,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["ReorderAppBlockGroups"]
    >;

    DeleteAppGroupBlock: RequestActionType<
      ActionType.DELETE_APP_GROUP_BLOCK,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["DeleteAppGroupBlock"]
    >;
    ReorderAppGroupBlocks: RequestActionType<
      ActionType.REORDER_APP_GROUP_BLOCKS,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["ReorderAppGroupBlocks"]
    >;

    DeleteAppGroupBlockGroup: RequestActionType<
      ActionType.DELETE_APP_GROUP_BLOCK_GROUP,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["DeleteAppGroupBlockGroup"]
    >;
    ReorderAppGroupBlockGroups: RequestActionType<
      ActionType.REORDER_APP_GROUP_BLOCK_GROUPS,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["ReorderAppGroupBlockGroups"]
    >;
    RevokeTrustedPubkeys: RequestActionType<
      ActionType.REVOKE_TRUSTED_PUBKEYS,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        loggableType2: "authAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["RevokeTrustedPubkeys"]
    >;

    UpgradeSelfHosted: RequestActionType<
      ActionType.UPGRADE_SELF_HOSTED,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["UpgradeSelfHosted"]
    >;
    UpgradeSelfHostedForceClear: RequestActionType<
      ActionType.UPGRADE_SELF_HOSTED_FORCE_CLEAR,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["UpgradeSelfHostedForceClear"]
    >;

    UpdateLicense: RequestActionType<
      ActionType.UPDATE_LICENSE,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        loggableType2: "billingAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["UpdateLicense"]
    >;

    ForgetDevice: RequestActionType<
      ActionType.FORGET_DEVICE,
      {
        graphUpdatedAt: number;
        loggableType: "orgAction";
        loggableType2: "authAction";
        auth: Auth.TokenAuthParams;
      },
      Net.ApiParamTypes["ForgetDevice"]
    >;

    CreateScimUser: {
      type: ActionType.CREATE_SCIM_USER;
      payload: Net.ApiParamTypes["CreateScimUser"];
      meta: {
        loggableType: "orgAction";
        loggableType2: "scimAction";
        auth: Auth.BearerTokenAuthParams;
        client?: undefined;
      };
    };
    DeleteScimUser: {
      type: ActionType.DELETE_SCIM_USER;
      payload: Net.ApiParamTypes["DeleteScimUser"];
      meta: {
        loggableType: "orgAction";
        loggableType2: "scimAction";
        auth: Auth.BearerTokenAuthParams;
        client?: undefined;
      };
    };
    UpdateScimUser: {
      type: ActionType.UPDATE_SCIM_USER;
      payload: Net.ApiParamTypes["UpdateScimUser"];
      meta: {
        loggableType: "orgAction";
        loggableType2: "scimAction";
        auth: Auth.BearerTokenAuthParams;
        client?: undefined;
      };
    };

    SelfHostedResyncFailover: RequestActionType<
      ActionType.SELF_HOSTED_RESYNC_FAILOVER,
      {
        loggableType: "orgAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["SelfHostedResyncFailover"]
    >;

    SetOrgAllowedIps: RequestActionType<
      ActionType.SET_ORG_ALLOWED_IPS,
      {
        loggableType: "orgAction";
        loggableType2: "updateFirewallAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["SetOrgAllowedIps"]
    >;

    SetAppAllowedIps: RequestActionType<
      ActionType.SET_APP_ALLOWED_IPS,
      {
        loggableType: "orgAction";
        loggableType2: "updateFirewallAction";
        auth: Auth.DefaultAuthParams;
      },
      Net.ApiParamTypes["SetAppAllowedIps"]
    >;

    StartedOrgImport: RequestActionType<
      ActionType.STARTED_ORG_IMPORT,
      {
        loggableType: "orgAction";
        auth: Auth.TokenAuthParams;
      },
      Net.ApiParamTypes["StartedOrgImport"]
    >;

    FinishedOrgImport: RequestActionType<
      ActionType.FINISHED_ORG_IMPORT,
      {
        loggableType: "orgAction";
        auth: Auth.TokenAuthParams;
      },
      Net.ApiParamTypes["FinishedOrgImport"]
    >;

    CloudBillingSubscribeProduct: RequestActionType<
      ActionType.CLOUD_BILLING_SUBSCRIBE_PRODUCT,
      {
        loggableType: "orgAction";
        loggableType2: "billingAction";

        auth: Auth.TokenAuthParams;
      },
      Net.ApiParamTypes["CloudBillingSubscribeProduct"]
    >;

    CloudBillingUpdateSubscriptionQuantity: RequestActionType<
      ActionType.CLOUD_BILLING_UPDATE_SUBSCRIPTION_QUANTITY,
      {
        loggableType: "orgAction";
        loggableType2: "billingAction";

        auth: Auth.TokenAuthParams;
      },
      Net.ApiParamTypes["CloudBillingUpdateSubscriptionQuantity"]
    >;

    CloudBillingCancelSubscription: RequestActionType<
      ActionType.CLOUD_BILLING_CANCEL_SUBSCRIPTION,
      {
        loggableType: "orgAction";
        loggableType2: "billingAction";

        auth: Auth.TokenAuthParams;
      },
      Net.ApiParamTypes["CloudBillingCancelSubscription"]
    >;

    CloudBillingUpdateSettings: RequestActionType<
      ActionType.CLOUD_BILLING_UPDATE_SETTINGS,
      {
        loggableType: "orgAction";
        loggableType2: "billingAction";

        auth: Auth.TokenAuthParams;
      },
      Net.ApiParamTypes["CloudBillingUpdateSettings"]
    >;

    CloudBillingUpdatePaymentMethod: RequestActionType<
      ActionType.CLOUD_BILLING_UPDATE_PAYMENT_METHOD,
      {
        loggableType: "orgAction";
        loggableType2: "billingAction";
        auth: Auth.TokenAuthParams;
      },
      Net.ApiParamTypes["CloudBillingUpdatePaymentMethod"]
    >;

    IntegrationsVantaRemoveConnection: RequestActionType<
      ActionType.INTEGRATIONS_VANTA_REMOVE_CONNECTION,
      {
        loggableType: "orgAction";
        auth: Auth.TokenAuthParams;
      },
      Net.ApiParamTypes["IntegrationsVantaRemoveConnection"]
    >;
  };

  export type BillingWebhookActions = {
    CloudBillingInvoiceCreated: RequestActionType<
      ActionType.CLOUD_BILLING_INVOICE_CREATED,
      {
        loggableType: "billingWebhookAction";
        loggableType2: "billingAction";
      },
      Net.ApiParamTypes["CloudBillingInvoiceCreated"]
    >;

    CloudBillingPaymentSucceeded: RequestActionType<
      ActionType.CLOUD_BILLING_PAYMENT_SUCCEEDED,
      {
        loggableType: "billingWebhookAction";
        loggableType2: "billingAction";
      },
      Net.ApiParamTypes["CloudBillingPaymentSucceeded"]
    >;

    CloudBillingPaymentFailed: RequestActionType<
      ActionType.CLOUD_BILLING_PAYMENT_FAILED,
      {
        loggableType: "billingWebhookAction";
        loggableType2: "billingAction";
      },
      Net.ApiParamTypes["CloudBillingPaymentFailed"]
    >;
    CloudBillingUpdateSubscription: RequestActionType<
      ActionType.CLOUD_BILLING_UPDATE_SUBSCRIPTION,
      {
        loggableType: "billingWebhookAction";
        loggableType2: "billingAction";
      },
      Net.ApiParamTypes["CloudBillingUpdateSubscription"]
    >;
  };

  export type BulkGraphAction = {
    type: ActionType.BULK_GRAPH_ACTION;
    payload: (Omit<GraphAction, "meta"> & {
      meta: Omit<GraphAction["meta"], "auth" | "client">;
    })[];

    meta: {
      auth: Auth.DefaultAuthParams;
      client: Client.ClientParams;
      loggableType: undefined;
    };
  };

  export type RequestActions = HostActions &
    AuthActions &
    ScimProvisioningActions &
    FetchActions &
    FetchEnvkeyActions &
    GraphActions &
    BillingWebhookActions;

  export type HostAction = HostActions[keyof HostActions];
  export type AuthAction = AuthActions[keyof AuthActions];
  export type ScimProvisioningAction =
    ScimProvisioningActions[keyof ScimProvisioningActions];
  export type FetchAction = FetchActions[keyof FetchActions];
  export type GraphAction = GraphActions[keyof GraphActions];
  export type BillingWebhookAction =
    BillingWebhookActions[keyof BillingWebhookActions];

  export type RequestAction =
    | RequestActions[keyof RequestActions]
    | BulkGraphAction;

  export const FetchEnvkeyActionSchema = z.object({
    type: z.literal(ActionType.FETCH_ENVKEY),
    payload: Net.ApiParamSchemas[ActionType.FETCH_ENVKEY],
    meta: z.object({
      loggableType: z.literal("fetchEnvkeyAction"),
      fetchServiceVersion: z.string(),
      client: Client.ClientParamsSchema,
    }),
  });
}
