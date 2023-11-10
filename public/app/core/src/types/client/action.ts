import { Format } from "../../lib/parse";
import { Api, Auth, Trust, Infra, Model } from "../";
import ActionType from "./action_type";
import { State } from "./state";
import { Env } from "./envs";
import { Patch } from "rfc6902";
import Client from ".";

export namespace Action {
  export type EnvkeyAction = Action.ClientAction | Api.Action.RequestAction;
  export type DispatchAction<ActionType extends EnvkeyAction = EnvkeyAction> =
    ActionType extends Api.Action.RequestAction
      ? Omit<ActionType, "meta"> & { meta?: Partial<ActionType["meta"]> }
      : ActionType;

  export type SuccessAction<
    ActionType extends EnvkeyAction = EnvkeyAction,
    SuccessType = any
  > = {
    type: string;
    meta: {
      rootAction: ActionType;
    };
    payload: SuccessType;
  };

  export type FailureAction<
    ActionType extends EnvkeyAction = EnvkeyAction,
    FailureType = Api.Net.ErrorResult
  > = {
    type: string;
    meta: {
      rootAction: ActionType;
    };
    payload: FailureType;
  };

  export type ReplayableEnvUpdateAction = {
    type: EnvUpdateAction["type"];
    payload: {
      diffs: Patch;
      reverse: Patch;
      revert?: number;
    };
    meta: {
      envParentId: string;
      environmentId: string;
      entryKeys: string[];
    };
  };

  export type PendingEnvUpdateAction = Omit<
    ReplayableEnvUpdateAction,
    "meta"
  > & {
    meta: Omit<ReplayableEnvUpdateAction["meta"], "pendingAt"> & {
      pendingAt: number;
    };
  };

  export type EnvUpdateActions = {
    CreateEntry: {
      type: ActionType.CREATE_ENTRY;
      payload: {
        envParentId: string;
        entryKey: string;
        environmentId: string;
        val: Env.EnvWithMetaCell;
      };
    };

    UpdateEntry: {
      type: ActionType.UPDATE_ENTRY;
      payload: {
        envParentId: string;
        environmentId: string;
        entryKey: string;
        newEntryKey: string;
      };
    };

    RemoveEntry: {
      type: ActionType.REMOVE_ENTRY;
      payload: {
        envParentId: string;
        environmentId: string;
        entryKey: string;
      };
    };

    UpdateEntryVal: {
      type: ActionType.UPDATE_ENTRY_VAL;
      payload: {
        envParentId: string;
        environmentId: string;
        entryKey: string;
        update: Env.EnvWithMetaCell;
      };
    };

    RevertEnvironment: {
      type: ActionType.REVERT_ENVIRONMENT;
      payload: Env.TargetVersionParams;
    };

    ImportEnvironment: {
      type: ActionType.IMPORT_ENVIRONMENT;
      payload: {
        envParentId: string;
        environmentId: string;
        parsed: { [k: string]: string };
      };
    };
  };

  export type ClientActions = EnvUpdateActions & {
    Register: {
      type: ActionType.REGISTER;
      payload: Pick<
        Api.Net.ApiParamTypes["Register"],
        "user" | "org" | "test"
      > & {
        device: Pick<Api.Net.DeviceParams, "name">;
      } & (
          | ({
              hostType: "cloud";
            } & (
              | {
                  provider: "email";
                  emailVerificationToken: string;
                  v1Upgrade?: (Api.Net.ApiParamTypes["Register"] & {
                    hostType: "cloud";
                  })["v1Upgrade"];
                }
              | {
                  provider: Auth.ExternalAuthProviderType;
                  externalAuthSessionId: string;
                }
            ))
          | (({
              hostType: "self-hosted";
              provider: "email";
            } & Omit<Infra.DeploySelfHostedParams, "registerAction">) &
              (
                | {
                    devOnlyLocalSelfHosted?: undefined;
                    emailVerificationToken?: undefined;
                  }
                | {
                    devOnlyLocalSelfHosted: true;
                    emailVerificationToken: string;
                  }
              ))
          | {
              hostType: "community";
              provider: "email";
              emailVerificationToken: string;
              communityAuth: string;
            }
        );
    };
    CreateSession: {
      type: ActionType.CREATE_SESSION;
      payload: {
        accountId: string;
        emailVerificationToken?: string;
        externalAuthSessionId?: string;
      };
    };
    SetAuth: {
      type: ActionType.SET_AUTH;
      payload: Client.ClientUserAuth;
    };
    RefreshSession: {
      type: ActionType.REFRESH_SESSION;
      payload?: {
        omitGraphUpdatedAt?: true;
      };
    };
    GetSession: {
      type: ActionType.GET_SESSION;
      payload?: {
        skipWaitForReencryption?: true;
        noop?: true;
        omitGraphUpdatedAt?: true;
      };
    };
    QueueRefreshSession: {
      type: ActionType.QUEUE_REFRESH_SESSION;
      payload: ClientActions["RefreshSession"];
    };
    AuthenticateCliKey: {
      type: ActionType.AUTHENTICATE_CLI_KEY;
      payload: { cliKey: string };
    };

    SelectDefaultAccount: {
      type: ActionType.SELECT_DEFAULT_ACCOUNT;
      payload: { accountId: string };
    };

    SignOut: {
      type: ActionType.SIGN_OUT;
      payload: { accountId: string };
    };

    ForgetDevice: {
      type: ActionType.FORGET_DEVICE;
      payload: { accountId: string };
    };

    AddTrustedSessionPubkey: {
      type: ActionType.ADD_TRUSTED_SESSION_PUBKEY;
      payload: {
        id: string;
        trusted: Trust.TrustedSessionPubkey;
      };
    };
    SetTrustedRootPubkey: {
      type: ActionType.SET_TRUSTED_ROOT_PUBKEY;
      payload: {
        id: string;
        trusted: Trust.TrustedRootPubkey;
      };
    };
    ProcessRootPubkeyReplacements: {
      type: ActionType.PROCESS_ROOT_PUBKEY_REPLACEMENTS;
      payload: { commitTrusted?: true };
    };
    ClearTrustedSessionPubkey: {
      type: ActionType.CLEAR_TRUSTED_SESSION_PUBKEY;
      payload: { id: string };
    };

    VerifiedSignedTrustedRootPubkey: {
      type: ActionType.VERIFIED_SIGNED_TRUSTED_ROOT_PUBKEY;
      payload: Required<State>["trustedRoot"];
    };

    ProcessRevocationRequests: {
      type: ActionType.PROCESS_REVOCATION_REQUESTS;
    };

    CreateApp: {
      type: ActionType.CREATE_APP;
      payload: Api.Net.ApiParamTypes["CreateApp"] & {
        path?: string;
      };
    };

    CreateBlock: {
      type: ActionType.CREATE_BLOCK;
      payload: Api.Net.ApiParamTypes["CreateBlock"];
    };

    CreateEntryRow: {
      type: ActionType.CREATE_ENTRY_ROW;
      payload: {
        envParentId: string;
        entryKey: string;
        vals: { [environmentId: string]: Env.EnvWithMetaCell };
      };
    };
    UpdateEntryRow: {
      type: ActionType.UPDATE_ENTRY_ROW;
      payload: {
        envParentId: string;
        entryKey: string;
        newEntryKey: string;
      };
    };

    RemoveEntryRow: {
      type: ActionType.REMOVE_ENTRY_ROW;
      payload: {
        envParentId: string;
        entryKey: string;
      };
    };

    CommitEnvs: {
      type: ActionType.COMMIT_ENVS;
      payload: {
        pendingEnvironmentIds?: string[];
        message?: string;
        autoCommit?: true;
        initEnvs?: true;
        upgradeCrypto?: true;
      };
    };

    ResetEnvs: {
      type: ActionType.RESET_ENVS;
      payload: {
        pendingEnvironmentIds?: string[];
        entryKeys?: string[];
      };
    };

    ReencryptPermittedLoop: {
      type: ActionType.REENCRYPT_PERMITTED_LOOP;
    };
    ReencryptEnvs: {
      type: ActionType.REENCRYPT_ENVS;
      payload: {
        environmentIds: string[];
      };
    };

    FetchEnvs: {
      type: ActionType.FETCH_ENVS;
      payload: Api.Net.ApiParamTypes["FetchEnvs"] & {
        skipWaitForReencryption?: true;
      };
    };
    ExportEnvironment: {
      type: ActionType.EXPORT_ENVIRONMENT;
      payload: {
        envParentId: string;
        environmentId: string;
        format: Format;
        filePath: string;
        includeAncestors?: true;
        pending?: true;
      };
    };

    AddPendingInvite: {
      type: ActionType.ADD_PENDING_INVITE;
      payload: Client.PendingInvite;
    };
    UpdatePendingInvite: {
      type: ActionType.UPDATE_PENDING_INVITE;
      payload: { index: number; pending: Client.PendingInvite };
    };
    RemovePendingInvite: {
      type: ActionType.REMOVE_PENDING_INVITE;
      payload: number;
    };

    InviteUsers: {
      type: ActionType.INVITE_USERS;
      payload: Client.PendingInvite[];
    };
    ClearGeneratedInvites: {
      type: ActionType.CLEAR_GENERATED_INVITES;
    };
    LoadInvite: {
      type: ActionType.LOAD_INVITE;
      payload: {
        emailToken: string;
        encryptionToken: string;
        isV1Upgrade?: boolean;
      };
    };
    AcceptInvite: {
      type: ActionType.ACCEPT_INVITE;
      payload: {
        deviceName: string;
        emailToken: string;
        encryptionToken: string;
        isV1Upgrade?: boolean;
      };
    };
    ResetInvite: {
      type: ActionType.RESET_INVITE;
    };

    ApproveDevices: {
      type: ActionType.APPROVE_DEVICES;
      payload: Pick<Api.Net.ApiParamTypes["CreateDeviceGrant"], "granteeId">[];
    };
    ClearGeneratedDeviceGrants: {
      type: ActionType.CLEAR_GENERATED_DEVICE_GRANTS;
    };
    LoadDeviceGrant: {
      type: ActionType.LOAD_DEVICE_GRANT;
      payload: {
        emailToken: string;
        encryptionToken: string;
      };
    };
    AcceptDeviceGrant: {
      type: ActionType.ACCEPT_DEVICE_GRANT;
      payload: {
        emailToken: string;
        encryptionToken: string;
        deviceName: string;
      };
    };
    ResetDeviceGrant: {
      type: ActionType.RESET_DEVICE_GRANT;
    };
    ResetExternalAuth: {
      type: ActionType.RESET_EXTERNAL_AUTH;
    };

    CreateCliUser: {
      type: ActionType.CREATE_CLI_USER;
      payload: Pick<
        Api.Net.ApiParamTypes["CreateCliUser"],
        "name" | "orgRoleId" | "appUserGrants" | "importId"
      >;
    };
    ClearGeneratedCliUsers: {
      type: ActionType.CLEAR_GENERATED_CLI_USERS;
    };

    CreateServer: {
      type: ActionType.CREATE_SERVER;
      payload: Pick<
        Api.Net.ApiParamTypes["CreateServer"],
        "appId" | "name" | "environmentId" | "importId"
      > & {
        skipGenerateKey?: boolean;
        v1Payload?: Api.Net.ApiParamTypes["GenerateKey"]["v1Payload"];
        v1EnvkeyIdPart?: string;
        v1EncryptionKey?: string;
      };
    };

    CreateLocalKey: {
      type: ActionType.CREATE_LOCAL_KEY;
      payload: Pick<
        Api.Net.ApiParamTypes["CreateLocalKey"],
        | "appId"
        | "name"
        | "environmentId"
        | "autoGenerated"
        | "importId"
        | "isV1UpgradeKey"
        | "userId"
      > & {
        skipGenerateKey?: boolean;
        v1Payload?: Api.Net.ApiParamTypes["GenerateKey"]["v1Payload"];
        v1EnvkeyIdPart?: string;
        v1EncryptionKey?: string;
      };
    };

    GenerateKey: {
      type: ActionType.GENERATE_KEY;
      payload: Pick<
        Api.Net.ApiParamTypes["GenerateKey"],
        "appId" | "keyableParentId" | "keyableParentType" | "v1Payload"
      > & {
        v1EnvkeyIdPart?: string;
        v1EncryptionKey?: string;
      };
    };

    ClearGeneratedEnvkey: {
      type: ActionType.CLEAR_GENERATED_ENVKEY;
      payload: { keyableParentId: string };
    };

    ClearAllGeneratedEnvkeys: {
      type: ActionType.CLEAR_ALL_GENERATED_ENVKEYS;
    };

    ConnectBlocks: {
      type: ActionType.CONNECT_BLOCKS;
      payload: (
        | Pick<
            Api.Net.ApiParamTypes["ConnectBlock"],
            "appId" | "blockId" | "orderIndex" | "importId"
          >
        | Pick<
            Api.Net.ApiParamTypes["CreateAppBlockGroup"],
            "appId" | "blockGroupId" | "orderIndex"
          >
        | Pick<
            Api.Net.ApiParamTypes["CreateAppGroupBlock"],
            "appGroupId" | "blockId" | "orderIndex"
          >
        | Pick<
            Api.Net.ApiParamTypes["CreateAppGroupBlockGroup"],
            "appGroupId" | "blockGroupId" | "orderIndex"
          >
      )[] & {
        clearCached?: boolean;
      };
    };

    GrantAppsAccess: {
      type: ActionType.GRANT_APPS_ACCESS;
      payload: (
        | Pick<
            Api.Net.ApiParamTypes["GrantAppAccess"],
            "appId" | "userId" | "appRoleId" | "importId"
          >
        | Pick<
            Api.Net.ApiParamTypes["CreateAppUserGroup"],
            "appId" | "userGroupId" | "appRoleId"
          >
        | Pick<
            Api.Net.ApiParamTypes["CreateAppGroupUser"],
            "appGroupId" | "userId" | "appRoleId"
          >
        | Pick<
            Api.Net.ApiParamTypes["CreateAppGroupUserGroup"],
            "appGroupId" | "userGroupId" | "appRoleId"
          >
      )[];
    };

    CreateGroupMemberships: {
      type: ActionType.CREATE_GROUP_MEMBERSHIPS;
      payload: {
        groupId: string;
        objectId: string;
        orderIndex?: number;
      }[];
    };

    CreateRecoveryKey: {
      type: ActionType.CREATE_RECOVERY_KEY;
    };
    ClearGeneratedRecoveryKey: {
      type: ActionType.CLEAR_GENERATED_RECOVERY_KEY;
    };
    LoadRecoveryKey: {
      type: ActionType.LOAD_RECOVERY_KEY;
      payload: {
        encryptionKey: string;
        hostUrl: string;
        emailToken?: string;
      };
    };
    RedeemRecoveryKey: {
      type: ActionType.REDEEM_RECOVERY_KEY;
      payload: {
        deviceName: string;
        encryptionKey: string;
        hostUrl: string;
        emailToken: string;
      };
    };
    ResetRecoveryKey: {
      type: ActionType.RESET_RECOVERY_KEY;
    };

    UpdateUserRoles: {
      type: ActionType.UPDATE_USER_ROLES;
      payload: Pick<
        Api.Net.ApiParamTypes["UpdateUserRole"],
        "id" | "orgRoleId"
      >[];
    };

    RbacUpdateOrgRole: {
      type: ActionType.RBAC_UPDATE_ORG_ROLE;
      payload: Omit<
        Api.Net.ApiParamTypes["RbacUpdateOrgRole"],
        "envs" | "encryptedByTrustChain"
      >;
    };
    RbacUpdateAppRole: {
      type: ActionType.RBAC_UPDATE_APP_ROLE;
      payload: Omit<
        Api.Net.ApiParamTypes["RbacUpdateAppRole"],
        "envs" | "encryptedByTrustChain"
      >;
    };
    RbacUpdateEnvironmentRole: {
      type: ActionType.RBAC_UPDATE_ENVIRONMENT_ROLE;
      payload: Omit<
        Api.Net.ApiParamTypes["RbacUpdateEnvironmentRole"],
        "envs" | "encryptedByTrustChain"
      >;
    };
    RbacCreateEnvironmentRole: {
      type: ActionType.RBAC_CREATE_ENVIRONMENT_ROLE;
      payload: Api.Net.ApiParamTypes["RbacCreateEnvironmentRole"];
    };

    IncludeAppRoles: {
      type: ActionType.INCLUDE_APP_ROLES;
      payload: Omit<
        Api.Net.ApiParamTypes["RbacCreateIncludedAppRole"],
        "envs" | "encryptedByTrustChain"
      >[];
    };

    ClearLogs: {
      type: ActionType.CLEAR_LOGS;
    };

    InitDevice: {
      type: ActionType.INIT_DEVICE;
    };

    DisconnectClient: {
      type: ActionType.DISCONNECT_CLIENT;
    };

    ResetClientState: {
      type: ActionType.RESET_CLIENT_STATE;
    };

    SetDevicePassphrase: {
      type: ActionType.SET_DEVICE_PASSPHRASE;
      payload: {
        passphrase: string;
      };
    };

    ClearDevicePassphrase: {
      type: ActionType.CLEAR_DEVICE_PASSPHRASE;
    };

    SetDefaultDeviceName: {
      type: ActionType.SET_DEFAULT_DEVICE_NAME;
      payload: {
        name: string;
      };
    };

    SetDeviceLockout: {
      type: ActionType.SET_DEVICE_LOCKOUT;
      payload: {
        lockoutMs: number;
      };
    };

    ClearDeviceLockout: {
      type: ActionType.CLEAR_DEVICE_LOCKOUT;
    };

    LockDevice: {
      type: ActionType.LOCK_DEVICE;
    };

    UnlockDevice: {
      type: ActionType.UNLOCK_DEVICE;
      payload: {
        passphrase: string;
      };
    };

    ResetEmailVerification: {
      type: ActionType.RESET_EMAIL_VERIFICATION;
    };

    MergePersisted: {
      type: ActionType.MERGE_PERSISTED;
      payload: Client.PersistedProcState;
    };

    FetchedClientState: {
      type: ActionType.FETCHED_CLIENT_STATE;
    };

    ReceivedOrgSocketMessage: {
      type: ActionType.RECEIVED_ORG_SOCKET_MESSAGE;
      payload: {
        message: Api.OrgSocketUpdateMessage;
        account: Client.ClientUserAuth;
      };
    };

    OpenUrl: {
      type: ActionType.OPEN_URL;
      payload: { url: string };
    };

    SignInPendingSelfHosted: {
      type: ActionType.SIGN_IN_PENDING_SELF_HOSTED;
      payload: { index: number; initToken: string };
    };

    DeploySelfHosted: {
      type: ActionType.DEPLOY_SELF_HOSTED;
      payload: Infra.DeploySelfHostedParams &
        Omit<
          Client.PendingSelfHostedDeployment,
          | "type"
          | "addedAt"
          | "hostUrl"
          | "subdomain"
          | "deploymentTag"
          | "codebuildLink"
        >;
    };
    SetDeploySelfHostedStatus: {
      type: ActionType.SET_DEPLOY_SELF_HOSTED_STATUS;
      payload: { status: string };
    };

    NetworkUnreachable: {
      type: ActionType.NETWORK_UNREACHABLE;
    };
    NetworkReachable: {
      type: ActionType.NETWORK_REACHABLE;
    };
    CheckSelfHostedUpgradesAvailable: {
      type: ActionType.CHECK_SELF_HOSTED_UPGRADES_AVAILABLE;
      payload: {
        lowestCurrentApiVersion: string;
        lowestCurrentInfraVersion: string;
      };
    };

    ClearPendingSelfHostedDeployment: {
      type: ActionType.CLEAR_PENDING_SELF_HOSTED_DEPLOYMENT;
      payload: { deploymentTag: string };
    };

    SkipUpgradeForNow: {
      type: ActionType.SKIP_SELF_HOSTED_UPGRADE_FOR_NOW;
    };

    SetUiLastSelectedAccountId: {
      type: ActionType.SET_UI_LAST_SELECTED_ACCOUNT_ID;
      payload: { selectedAccountId: string | undefined };
    };

    SetUiLastSelectedUrl: {
      type: ActionType.SET_UI_LAST_SELECTED_URL;
      payload: { url: string | undefined };
    };

    ClearPendingExternalAuthSession: {
      type: ActionType.CLEAR_PENDING_EXTERNAL_AUTH_SESSION;
    };

    SetExternalAuthSessionResult: {
      type: ActionType.SET_EXTERNAL_AUTH_SESSION_RESULT;
      payload:
        | { authorizingExternallyErrorMessage: string }
        | NonNullable<State["completedExternalAuth"]>;
    };

    WaitForExternalAuth: {
      type: ActionType.WAIT_FOR_EXTERNAL_AUTH;
      payload: {
        externalAuthProviderId: string;
        externalAuthSessionId: string;
        authType: "sign_in";
        authMethod: "saml";
        provider: "saml";
      };
    };

    WaitForInviteExternalAuth: {
      type: ActionType.WAIT_FOR_INVITE_EXTERNAL_AUTH;
      payload: Client.ExternalAuthSetupPayload & {
        externalAuthSessionId: string;
      };
    };

    CreateExternalAuthSessionForLogin: {
      type: ActionType.CREATE_EXTERNAL_AUTH_SESSION_FOR_LOGIN;
      payload: {
        // how long to wait before triggering a web browser to open the auth url. allows injecting UI messages.
        waitOpenMs: number;
        authMethod: "saml";
        provider: "saml";
        externalAuthProviderId: string;
        orgId: string;
        userId: string;
      };
    };

    CreateExternalAuthSessionForInvite: {
      type: ActionType.CREATE_EXTERNAL_AUTH_SESSION_FOR_INVITE;
      payload: Client.ExternalAuthSetupPayload & {
        authMethod: "saml";
        provider: "saml";
        // invite or device grant ID
        authObjectId: string;
      };
    };

    IntegrationsVantaClearPendingExternalAuthSession: {
      type: ActionType.INTEGRATIONS_VANTA_CLEAR_PENDING_EXTERNAL_AUTH_SESSION;
    };

    IntegrationsVantaSetExternalAuthSessionResult: {
      type: ActionType.INTEGRATIONS_VANTA_SET_EXTERNAL_AUTH_SESSION_RESULT;
      payload:
        | { errorMessage: string }
        | {
            externalAuthSessionId: string;
          };
    };

    IntegrationsVantaWaitForExternalAuth: {
      type: ActionType.INTEGRATIONS_VANTA_WAIT_FOR_EXTERNAL_AUTH;
      payload: {
        externalAuthSessionId: string;
      };
    };

    IntegrationsVantaCreateExternalAuthSessionForConnection: {
      type: ActionType.INTEGRATIONS_VANTA_CREATE_EXTERNAL_AUTH_SESSION_FOR_CONNECTION;
      payload: {
        // how long to wait before triggering a web browser to open the auth url. allows injecting UI messages.
        waitOpenMs: number;
      };
    };

    IntegrationsVantaResetExternalAuth: {
      type: ActionType.INTEGRATIONS_VANTA_RESET_EXTERNAL_AUTH;
    };

    ClearCached: {
      type: ActionType.CLEAR_CACHED;
    };

    AccountActive: {
      type: ActionType.ACCOUNT_ACTIVE;
    };

    DecryptOrgArchive: {
      type: ActionType.DECRYPT_ORG_ARCHIVE;
      payload: { encryptionKey: string; isV1Upgrade?: boolean } & (
        | {
            fileName: string;
          }
        | {
            filePath: string;
          }
      );
    };

    LoadV1Upgrade: {
      type: ActionType.LOAD_V1_UPGRADE;
      payload: {
        fileName: string;
        encryptionKey: string;
        orgName: string;
        creator: Pick<Model.OrgUser, "firstName" | "lastName" | "email">;
      } & Pick<
        Api.V1Upgrade.Upgrade,
        | "ts"
        | "signature"
        | "stripeCustomerId"
        | "stripeSubscriptionId"
        | "numUsers"
        | "signedPresetBilling"
      >;
    };

    LoadV1UpgradeInvite: {
      type: ActionType.LOAD_V1_UPGRADE_INVITE;
      payload: {
        upgradeToken: string;
        encryptionToken: string;
      };
    };

    V1ClientAlive: {
      type: ActionType.V1_CLIENT_ALIVE;
    };

    StartV1Upgrade: {
      type: ActionType.START_V1_UPGRADE;
      payload: {
        accountId?: string;
        deviceName?: string;
      } & Omit<
        ClientActions["ImportOrg"]["payload"],
        | "importCliUsers"
        | "regenServerKeys"
        | "importCliUserIds"
        | "isV1Upgrade"
      > &
        Pick<
          Api.V1Upgrade.Upgrade,
          "billingInterval" | "ssoEnabled" | "newProductId" | "freeTier"
        >;
    };

    ResetV1Upgrade: {
      type: ActionType.RESET_V1_UPGRADE;
      payload: { cancelUpgrade?: boolean };
    };

    ResetOrgImport: {
      type: ActionType.RESET_ORG_IMPORT;
    };

    ImportOrg: {
      type: ActionType.IMPORT_ORG;
      payload: {
        importOrgUsers: boolean;
        importServers: boolean;
        importLocalKeys: boolean;
        importCliUsers: boolean;
        regenServerKeys: boolean;
        importEnvParentIds?: string[];
        importOrgUserIds?: string[];
        importCliUserIds?: string[];
        isV1Upgrade?: boolean;
        isV1UpgradeIntoExistingOrg?: boolean;
        v1Upgrade?: Api.V1Upgrade.Upgrade;
      };
    };
    SetImportOrgStatus: {
      type: ActionType.SET_IMPORT_ORG_STATUS;
      payload: { status: string | undefined };
    };

    ExportOrg: {
      type: ActionType.EXPORT_ORG;
      payload: { filePath: string; debugData?: boolean };
    };

    ClearThrottleError: {
      type: ActionType.CLEAR_THROTTLE_ERROR;
    };

    ClearOrphanedBlobs: {
      type: ActionType.CLEAR_ORPHANED_BLOBS;
    };

    SetMissingEnvs: {
      type: ActionType.SET_MISSING_ENVS;
      payload: State["envs"];
    };

    SetCryptoStatus: {
      type: ActionType.SET_CRYPTO_STATUS;
      payload: State["cryptoStatus"];
    };

    CryptoStatusIncrement: {
      type: ActionType.CRYPTO_STATUS_INCREMENT;
      payload: number;
    };
  };

  export type EnvUpdateAction = EnvUpdateActions[keyof EnvUpdateActions];
  export type ClientAction = ClientActions[keyof ClientActions];
}
