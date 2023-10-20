import * as R from "ramda";
import { Graph } from "./graph";
import { Env } from "./envs";
import { Action } from "./action";
import Api from "../api";
import Client from ".";
import { Logs, Model, Trust, Crypto, Billing } from "..";

type FlagById = Record<string, true>;
type ErrorsById = Record<string, Client.ClientError>;

type ReorderAssociationsStatus<T> = Record<
  string,
  {
    [k in Extract<
      Client.Graph.UserGraphObject["type"],
      | "appBlock"
      | "appBlockGroup"
      | "appGroupBlock"
      | "appGroupBlockGroup"
      | "groupMembership"
    >]: T;
  }
>;

export type ProcState = {
  orgUserAccounts: Record<string, Client.ClientUserAuth | undefined>;
  cliKeyAccounts: Record<string, Client.ClientCliAuth | undefined>;
  pendingSelfHostedDeployments: Client.PendingSelfHostedDeployment[];
  accountStates: Record<string, PartialAccountState | undefined>;
  clientStates: Record<string, PartialClientState | undefined>;
  defaultAccountId: string | undefined;
  defaultDeviceName: string | undefined;
  lockoutMs: number | undefined;
  requiresPassphrase: true | undefined;
  deviceKeyUpdatedAt: number | undefined;
  locked: boolean;
  unlockedAt: number | undefined;
  lastActiveAt: number | undefined;
  networkUnreachable: true | undefined;
  selfHostedUpgradesAvailable: {
    api?: Client.AvailableUpgrade;
    infra?: Client.AvailableUpgrade;
  };
  skippedSelfHostedUpgradeAt: number | undefined;
  uiLastSelectedAccountId: string | undefined;
  uiLastSelectedUrl: string | undefined;

  v1UpgradeLoaded:
    | Client.Action.ClientActions["LoadV1Upgrade"]["payload"]
    | undefined;
  v1IsUpgrading: boolean | undefined;
  v1UpgradeError: Client.ClientError | undefined;
  v1UpgradeAccountId: string | undefined;
  v1ActiveUpgrade:
    | Client.Action.ClientActions["StartV1Upgrade"]["payload"]
    | undefined;
  v1UpgradeStatus:
    | "loaded"
    | "upgrading"
    | "finished"
    | "canceled"
    | "error"
    | undefined;
  v1UpgradeAcceptedInvite: boolean | undefined;
  v1UpgradeInviteToken: string | undefined;
  v1UpgradeEncryptionToken: string | undefined;
  v1ClientAliveAt: number | undefined;

  cloudProducts: Billing.Product[] | undefined;
  cloudPrices: Billing.Price[] | undefined;
  isLoadingCloudProducts: boolean | undefined;
  loadCloudProductsError: Client.ClientError | undefined;

  hasV1PendingUpgrade: boolean | undefined;
  isCheckingV1PendingUpgrade: boolean | undefined;
  checkV1PendingUpgradeError: Client.ClientError | undefined;
};

export type PartialAccountState = {
  graph: Graph.UserGraph;
  graphUpdatedAt: number | undefined;

  signedTrustedRoot: Crypto.SignedData | undefined;
  trustedRoot: Trust.RootTrustChain | undefined;
  trustedSessionPubkeys: Trust.TrustedSessionPubkeys;
  isProcessingRootPubkeyReplacements: true | undefined;
  processRootPubkeyReplacementsError: Client.ClientError | undefined;
  isProcessingRevocationRequests: true | undefined;
  processRevocationRequestError: Client.ClientError | undefined;

  envs: Record<
    string,
    {
      key: string;
      env: Env.KeyableEnv | Env.EnvMetaState | Env.EnvInheritsState;
    }
  >;
  changesets: Record<string, { key: string; changesets: Env.Changeset[] }>;

  envsFetchedAt: Record<string, number>;
  changesetsFetchedAt: Record<string, number>;

  // variableData: Record<string, { key: string; data: Env.VariableData }>;

  pendingEnvUpdates: Action.PendingEnvUpdateAction[];
  pendingEnvsUpdatedAt: number | undefined;

  fetchSessionError: Client.ClientError | undefined;
  fetchSessionNotModified: boolean | undefined;

  pendingInvites: Client.PendingInvite[];

  isReencrypting: true | undefined;
  isReencryptingEnvs: FlagById;
  reencryptEnvsErrors: ErrorsById;

  isUpdatingEnvs: FlagById;
  updateEnvsErrors: ErrorsById;

  isFetchingEnvs: FlagById;
  fetchEnvsErrors: ErrorsById;

  isFetchingChangesets: FlagById;
  fetchChangesetsErrors: ErrorsById;

  isFetchingSession: true | undefined;
  isRefreshingSession: true | undefined;
  refreshSessionQueued:
    | Client.Action.ClientActions["RefreshSession"]
    | undefined;

  isDispatchingSerialAction: true | undefined;

  accountLastActiveAt: number | undefined;

  orgStats: Model.OrgStats | undefined;

  unfilteredOrgArchive: Client.OrgArchiveV1 | undefined;
  filteredOrgArchive: Client.OrgArchiveV1 | undefined;
  isDecryptingOrgArchive: true | undefined;
  decryptOrgArchiveError: Client.ClientError | undefined;

  isImportingOrg: true | undefined;
  importOrgStatus: string | undefined;
  importOrgError: Client.ClientError | undefined;

  importOrgServerErrors: Record<string, string> | undefined;
  importOrgLocalKeyErrors: Record<string, string> | undefined;
};

export type PartialClientState = {
  isAuthenticatingCliKey: true | undefined;
  authenticateCliKeyError: Client.ClientError | undefined;

  verifyingEmail: string | undefined;
  emailVerificationCode: string | undefined;
  isVerifyingEmail: true | undefined;
  verifyEmailError: Client.ClientError | undefined;
  isVerifyingEmailCode: true | undefined;
  verifyEmailCodeError: Client.ClientError | undefined;

  loggedActionsWithTransactionIds: [string, Logs.LoggedAction[]][];
  deletedGraph: Client.Graph.UserGraph;
  logsTotalCount: number | undefined;
  logsCountReachedLimit: boolean | undefined;
  logIps: string[];
  fetchLogParams: Omit<Logs.FetchLogParams, "pageNum"> | undefined;
  isFetchingLogs: true | undefined;
  fetchLogsError: Client.ClientError | undefined;
  isFetchingDeletedGraph: true | undefined;
  fetchDeletedGraphError: Client.ClientError | undefined;

  generatingInvites: Record<
    string,
    Client.Action.ClientActions["InviteUsers"]["payload"]
  >;
  generatedInvites: Client.GeneratedInviteResult[];
  generateInviteErrors: Record<
    string,
    {
      error: Client.ClientError;
      payload: Client.Action.ClientActions["InviteUsers"]["payload"];
    }
  >;

  isLoadingInvite: true | undefined;
  loadedInviteIdentityHash: string | undefined;
  loadedInviteEmailToken: string | undefined;
  loadedInvitePrivkey: Crypto.Privkey | undefined;
  loadedInviteOrgId: string | undefined;
  loadedInviteHostUrl: string | undefined;
  loadedInvite: Api.Net.LoadedInvite["invite"] | undefined;
  loadInviteError: Client.ClientError | undefined;

  isAcceptingInvite: true | undefined;
  didAcceptInvite: true | undefined;
  acceptInviteError: Client.ClientError | undefined;

  isFetchingExternalAuthSession: true | undefined;
  fetchExternalAuthSessionError: Client.ClientError | undefined;

  vantaIsFetchingExternalAuthSession: true | undefined;
  vantaFetchExternalAuthSessionError: Client.ClientError | undefined;

  creatingExternalAuthSession: true | undefined;
  externalAuthSessionCreationError: Client.ClientError | undefined;
  pendingExternalAuthSession: { id: string; authUrl: string } | undefined;
  isAuthorizingExternallyForSessionId: string | undefined;
  authorizingExternallyErrorMessage: string | undefined;

  startingExternalAuthSession: true | undefined;
  startingExternalAuthSessionError: Client.ClientError | undefined;
  completedExternalAuth:
    | {
        externalAuthSessionId: string;
        externalAuthProviderId: string;
        orgId: string;
        userId: string;
        sentById?: string;
        authType: "sign_in" | "accept_invite" | "accept_device_grant";
      }
    | undefined;

  startingExternalAuthSessionInvite: true | undefined;
  startingExternalAuthSessionInviteError: Client.ClientError | undefined;

  vantaConnectingAccount: true | undefined;
  vantaCreatingExternalAuthSession: true | undefined;
  vantaExternalAuthSessionCreationError: Client.ClientError | undefined;
  vantaPendingExternalAuthSession: { id: string; authUrl: string } | undefined;
  vantaIsAuthorizingExternallyForSessionId: string | undefined;
  vantaAuthorizingExternallyErrorMessage: string | undefined;

  vantaStartingExternalAuthSession: true | undefined;
  vantaStartingExternalAuthSessionError: Client.ClientError | undefined;
  vantaCompletedExternalAuth:
    | {
        externalAuthSessionId: string;
      }
    | undefined;

  vantaIsRemovingConnection: true | undefined;
  vantaRemovingConnectionError: Client.ClientError | undefined;

  generatingDeviceGrants: Record<
    string,
    Client.Action.ClientActions["ApproveDevices"]["payload"]
  >;
  generatedDeviceGrants: Client.GeneratedDeviceGrantResult[];
  generateDeviceGrantErrors: Record<
    string,
    {
      error: Client.ClientError;
      payload: Client.Action.ClientActions["ApproveDevices"]["payload"];
    }
  >;

  isGeneratingRecoveryKey: true | undefined;
  generatedRecoveryKey: Client.GeneratedRecoveryKey | undefined;
  generateRecoveryKeyError: Client.ClientError | undefined;
  isLoadingRecoveryKey: true | undefined;
  loadedRecoveryKey: Api.Net.LoadedRecoveryKey["recoveryKey"] | undefined;
  loadedRecoveryKeyIdentityHash: string | undefined;
  loadedRecoveryKeyEmailToken: string | undefined;
  loadedRecoveryPrivkey: Crypto.Privkey | undefined;
  loadedRecoveryKeyOrgId: string | undefined;
  loadedRecoveryKeyHostUrl: string | undefined;
  loadRecoveryKeyError: Client.ClientError | undefined;

  isRedeemingRecoveryKey: true | undefined;
  didRedeemRecoveryKey: true | undefined;
  redeemRecoveryKeyError: Client.ClientError | undefined;

  isLoadingDeviceGrant: true | undefined;
  loadedDeviceGrantIdentityHash: string | undefined;
  loadedDeviceGrantEmailToken: string | undefined;
  loadedDeviceGrantPrivkey: Crypto.Privkey | undefined;
  loadedDeviceGrantOrgId: string | undefined;
  loadedDeviceGrantHostUrl: string | undefined;
  loadedDeviceGrant: Api.Net.LoadedDeviceGrant["deviceGrant"] | undefined;
  loadDeviceGrantError: Client.ClientError | undefined;

  isAcceptingDeviceGrant: true | undefined;
  didAcceptDeviceGrant: true | undefined;
  acceptDeviceGrantError: Client.ClientError | undefined;

  generatingCliUsers: Record<
    string,
    Client.Action.ClientActions["CreateCliUser"]["payload"]
  >;
  generatedCliUsers: Client.GeneratedCliUserResult[];
  generateCliUserErrors: Record<
    string,
    {
      error: Client.ClientError;
      payload: Client.Action.ClientActions["CreateCliUser"]["payload"];
    }
  >;

  generatingEnvkeys: Record<
    string,
    Client.Action.ClientActions["GenerateKey"]["payload"]
  >;
  generatedEnvkeys: Record<string, Client.GeneratedEnvkeyResult>;
  generateEnvkeyErrors: ErrorsById;

  isRegistering: true | undefined;
  registrationError: Client.ClientError | undefined;

  isCreatingSession: true | undefined;
  createSessionError: Client.ClientError | undefined;

  isCreatingApp: true | undefined;
  createAppError: Client.ClientError | undefined;
  isCreatingBlock: true | undefined;
  createBlockError: Client.ClientError | undefined;

  isCreatingRbacOrgRole: true | undefined;
  createRbacOrgRoleError: Client.ClientError | undefined;
  isCreatingRbacAppRole: true | undefined;
  createRbacAppRoleError: Client.ClientError | undefined;
  isCreatingRbacEnvironmentRole: true | undefined;
  createRbacEnvironmentRoleError: Client.ClientError | undefined;
  isIncludingAppRoles: Record<string, FlagById>;
  includeAppRoleErrors: Record<string, ErrorsById>;

  isCreatingServer: FlagById;
  createServerErrors: ErrorsById;
  isCreatingLocalKey: FlagById;
  createLocalKeyErrors: ErrorsById;
  isGeneratingKey: FlagById;
  generateKeyErrors: ErrorsById;

  isRemoving: FlagById;
  removeErrors: ErrorsById;

  isUpdating: FlagById;
  updateErrors: ErrorsById;

  isRenaming: FlagById;
  renameErrors: ErrorsById;

  isUpdatingSettings: FlagById;
  updateSettingsErrors: ErrorsById;

  isUpdatingFirewall: FlagById;
  updateFirewallErrors: ErrorsById;

  isUpdatingUserRole: Record<string, string>;
  updateUserRoleErrors: Record<
    string,
    {
      error: Client.ClientError;
      payload: Client.Action.ClientActions["UpdateUserRoles"]["payload"];
    }
  >;

  isReorderingAssociations: ReorderAssociationsStatus<true>;
  reorderAssociationsErrors: ReorderAssociationsStatus<Client.ClientError>;

  isReorderingEnvironmentRoles: true | undefined;
  reorderEnvironmentRolesError: Client.ClientError | undefined;

  isReorderingAppRoles: true | undefined;
  reorderAppRolesError: Client.ClientError | undefined;

  isReorderingOrgRoles: true | undefined;
  reorderOrgRolesError: Client.ClientError | undefined;

  isConnectingBlocks: Record<string, FlagById>;
  connectBlocksErrors: Record<string, ErrorsById>;

  isGrantingAppAccess: Record<string, Record<string, FlagById>>;
  grantAppAccessErrors: Record<string, Record<string, ErrorsById>>;

  isCreatingEnvironment: Record<string, FlagById>;
  createEnvironmentErrors: Record<string, ErrorsById>;

  isClearingUserTokens: FlagById;
  clearUserTokensErrors: ErrorsById;

  isClearingOrgTokens: true | undefined;
  clearOrgTokensError: Client.ClientError | undefined;

  isCreatingGroup: { [k in Model.Group["objectType"]]?: true };
  createGroupErrors: { [k in Model.Group["objectType"]]?: Client.ClientError };

  isCreatingGroupMemberships: Record<string, FlagById>;
  createGroupMembershipErrors: Record<string, ErrorsById>;

  isDispatchingSelfHostedUpgrade: true | undefined;
  upgradeSelfHostedError: Client.ClientError | undefined;
  upgradeSelfHostedStatus: string | undefined;

  isDispatchingUpgradeForceClear: true | undefined;
  upgradeForceClearError: Client.ClientError | undefined;

  isCheckingSelfHostedUpgradesAvailable: true | undefined;
  checkSelfHostedUpgradesAvailableError: Client.ClientError | undefined;

  isDeployingSelfHosted: true | undefined;
  deploySelfHostedError: Client.ClientError | undefined;
  deploySelfHostedStatus: string | undefined;

  authenticatingPendingSelfHostedAccountId: string | undefined;
  authenticatePendingSelfHostedAccountError: Client.ClientError | undefined;

  isCreatingSamlProvider: string | undefined;
  createSamlError: Client.ClientError | undefined;
  isUpdatingSamlSettings: string | undefined;
  updatingSamlSettingsError: Client.ClientError | undefined;

  isFetchingAuthProviders: true | undefined;
  fetchAuthProvidersError: Client.ClientError | undefined;
  samlSettingsByProviderId: Record<
    string,
    Model.SamlProviderSettings | undefined
  >;
  externalAuthProviders:
    | (Model.ExternalAuthProvider & { endpoint?: string })[]
    | undefined;

  isDeletingAuthProvider: string | undefined;
  deleteAuthProviderError: Client.ClientError | undefined;

  isCreatingProvisioningProvider: true | undefined;
  isListingInvitableScimUsers: true | undefined;
  listInvitableScimUsersError: Client.ClientError | undefined;
  createProvisioningProviderError: Client.ClientError | undefined;
  isUpdatingProvisioningProvider: true | undefined;
  updateProvisioningProviderError: Client.ClientError | undefined;
  isDeletingProvisioningProvider: true | undefined;
  deleteProvisioningProviderError: Client.ClientError | undefined;
  isUpdatingLicense: true | undefined;
  updateLicenseError: Client.ClientError | undefined;

  isFetchingOrgStats: true | undefined;
  fetchOrgStatsError: Client.ClientError | undefined;

  isExportingOrg: true | undefined;
  exportOrgError: Client.ClientError | undefined;

  isResyncingFailover: true | undefined;
  resyncFailoverError: Client.ClientError | undefined;

  cloudBillingIsSubscribingProduct: true | undefined;
  cloudBillingSubscribeProductError: Client.ClientError | undefined;
  cloudBillingIsUpdatingSubscriptionQuantity: true | undefined;
  cloudBillingUpdateSubscriptionQuantityError: Client.ClientError | undefined;
  cloudBillingIsCancelingSubscription: true | undefined;
  cloudBillingCancelSubscriptionError: Client.ClientError | undefined;
  cloudBillingIsUpdatingPaymentMethod: true | undefined;
  cloudBillingUpdatePaymentMethodError: Client.ClientError | undefined;
  cloudBillingIsUpdatingSettings: true | undefined;
  cloudBillingUpdateSettingsError: Client.ClientError | undefined;
  cloudBillingIsCheckingPromotionCode: true | undefined;
  cloudBillingCheckPromotionCodeError: Client.ClientError | undefined;
  cloudBillingIsFetchingInvoices: true | undefined;
  cloudBillingFetchInvoicesError: Client.ClientError | undefined;

  cloudBillingInvoices: Client.CloudBillingInvoice[];

  cloudBillingPromotionCode:
    | {
        code: string;
        amountOff?: number;
        percentOff?: number;
      }
    | undefined;

  throttleError: Client.FetchError | undefined;

  cryptoStatus:
    | {
        processed: number;
        total: number;
        op: "encrypt" | "decrypt";
        dataType: "keys" | "blobs" | "keys_and_blobs";
      }
    | undefined;
  isProcessingApi: true | undefined;
};

type ClientProcState = Omit<ProcState, "clientStates" | "accountStates">;

export type State = ClientProcState & PartialAccountState & PartialClientState;

export const defaultAccountState: PartialAccountState = {
    graphUpdatedAt: undefined,
    signedTrustedRoot: undefined,
    trustedRoot: undefined,

    isProcessingRootPubkeyReplacements: undefined,
    processRootPubkeyReplacementsError: undefined,

    isProcessingRevocationRequests: undefined,
    processRevocationRequestError: undefined,

    trustedSessionPubkeys: {},

    graph: {},
    envsFetchedAt: {},
    changesetsFetchedAt: {},

    envs: {},
    changesets: {},
    // variableData: {},

    pendingEnvUpdates: [],
    pendingEnvsUpdatedAt: undefined,
    pendingInvites: [],

    fetchSessionError: undefined,
    fetchSessionNotModified: undefined,

    isReencrypting: undefined,
    isReencryptingEnvs: {},
    reencryptEnvsErrors: {},

    isUpdatingEnvs: {},
    updateEnvsErrors: {},
    isFetchingEnvs: {},
    isFetchingChangesets: {},

    fetchEnvsErrors: {},
    fetchChangesetsErrors: {},

    isDispatchingSerialAction: undefined,

    isFetchingSession: undefined,
    isRefreshingSession: undefined,
    refreshSessionQueued: undefined,

    accountLastActiveAt: undefined,

    orgStats: undefined,

    unfilteredOrgArchive: undefined,
    filteredOrgArchive: undefined,
    isDecryptingOrgArchive: undefined,
    decryptOrgArchiveError: undefined,
    isImportingOrg: undefined,
    importOrgError: undefined,
    importOrgStatus: undefined,
    importOrgServerErrors: undefined,
    importOrgLocalKeyErrors: undefined,
  },
  defaultClientState: PartialClientState = {
    authenticateCliKeyError: undefined,
    verifyingEmail: undefined,
    emailVerificationCode: undefined,
    verifyEmailError: undefined,
    verifyEmailCodeError: undefined,
    fetchLogParams: undefined,
    fetchLogsError: undefined,
    loadedInviteIdentityHash: undefined,
    loadedInviteEmailToken: undefined,
    loadedInvitePrivkey: undefined,
    loadedInviteOrgId: undefined,
    loadedInviteHostUrl: undefined,
    loadedInvite: undefined,
    loadInviteError: undefined,
    acceptInviteError: undefined,
    pendingExternalAuthSession: undefined,
    creatingExternalAuthSession: undefined,
    externalAuthSessionCreationError: undefined,
    startingExternalAuthSession: undefined,
    startingExternalAuthSessionError: undefined,
    completedExternalAuth: undefined,
    startingExternalAuthSessionInvite: undefined,
    startingExternalAuthSessionInviteError: undefined,
    isAuthorizingExternallyForSessionId: undefined,
    authorizingExternallyErrorMessage: undefined,
    generatedRecoveryKey: undefined,
    generateRecoveryKeyError: undefined,
    loadedRecoveryKey: undefined,
    loadedRecoveryKeyIdentityHash: undefined,
    loadedRecoveryKeyEmailToken: undefined,
    loadedRecoveryPrivkey: undefined,
    loadedRecoveryKeyOrgId: undefined,
    loadedRecoveryKeyHostUrl: undefined,
    loadRecoveryKeyError: undefined,
    redeemRecoveryKeyError: undefined,
    loadedDeviceGrantIdentityHash: undefined,
    loadedDeviceGrantEmailToken: undefined,
    loadedDeviceGrantPrivkey: undefined,
    loadedDeviceGrantOrgId: undefined,
    loadedDeviceGrantHostUrl: undefined,
    loadedDeviceGrant: undefined,
    loadDeviceGrantError: undefined,
    acceptDeviceGrantError: undefined,
    registrationError: undefined,
    createSessionError: undefined,
    createAppError: undefined,
    createBlockError: undefined,
    createRbacOrgRoleError: undefined,
    createRbacAppRoleError: undefined,
    createRbacEnvironmentRoleError: undefined,
    clearOrgTokensError: undefined,
    fetchDeletedGraphError: undefined,

    isAuthenticatingCliKey: undefined,
    isVerifyingEmail: undefined,
    isVerifyingEmailCode: undefined,
    isFetchingLogs: undefined,
    isLoadingInvite: undefined,
    isAcceptingInvite: undefined,
    didAcceptInvite: undefined,
    isGeneratingRecoveryKey: undefined,
    isLoadingRecoveryKey: undefined,
    isRedeemingRecoveryKey: undefined,
    didRedeemRecoveryKey: undefined,
    isLoadingDeviceGrant: undefined,
    isAcceptingDeviceGrant: undefined,
    didAcceptDeviceGrant: undefined,
    isRegistering: undefined,
    isCreatingSession: undefined,
    isCreatingApp: undefined,
    isCreatingBlock: undefined,
    isCreatingRbacOrgRole: undefined,
    isCreatingRbacAppRole: undefined,
    isCreatingRbacEnvironmentRole: undefined,
    isClearingOrgTokens: undefined,
    isFetchingDeletedGraph: undefined,

    isResyncingFailover: undefined,
    resyncFailoverError: undefined,

    loggedActionsWithTransactionIds: [],
    deletedGraph: {},
    logsTotalCount: undefined,
    logsCountReachedLimit: undefined,
    logIps: [],

    generatingInvites: {},
    generatedInvites: [],

    generatingDeviceGrants: {},
    generatedDeviceGrants: [],

    generatingCliUsers: {},
    generatedCliUsers: [],

    generatingEnvkeys: {},
    generatedEnvkeys: {},

    isIncludingAppRoles: {},

    isCreatingServer: {},
    isCreatingLocalKey: {},
    isGeneratingKey: {},

    isRemoving: {},
    isUpdating: {},
    isRenaming: {},

    isUpdatingSettings: {},
    isUpdatingFirewall: {},
    isReorderingAssociations: {},
    isUpdatingUserRole: {},

    isConnectingBlocks: {},
    isGrantingAppAccess: {},

    isCreatingEnvironment: {},

    isClearingUserTokens: {},

    isCreatingGroup: {},
    isCreatingGroupMemberships: {},

    generateInviteErrors: {},
    generateDeviceGrantErrors: {},
    generateCliUserErrors: {},
    generateEnvkeyErrors: {},
    includeAppRoleErrors: {},
    createServerErrors: {},
    createLocalKeyErrors: {},
    generateKeyErrors: {},

    removeErrors: {},
    updateErrors: {},
    renameErrors: {},
    updateSettingsErrors: {},
    updateFirewallErrors: {},

    updateUserRoleErrors: {},
    reorderAssociationsErrors: {},

    connectBlocksErrors: {},
    grantAppAccessErrors: {},

    createEnvironmentErrors: {},

    clearUserTokensErrors: {},

    createGroupErrors: {},
    createGroupMembershipErrors: {},

    isDispatchingSelfHostedUpgrade: undefined,
    upgradeSelfHostedError: undefined,
    upgradeSelfHostedStatus: undefined,

    isDispatchingUpgradeForceClear: undefined,
    upgradeForceClearError: undefined,

    isCheckingSelfHostedUpgradesAvailable: undefined,
    checkSelfHostedUpgradesAvailableError: undefined,

    isDeployingSelfHosted: undefined,
    deploySelfHostedError: undefined,
    deploySelfHostedStatus: undefined,

    authenticatingPendingSelfHostedAccountId: undefined,
    authenticatePendingSelfHostedAccountError: undefined,
    isCreatingSamlProvider: undefined,
    createSamlError: undefined,
    isUpdatingSamlSettings: undefined,
    updatingSamlSettingsError: undefined,

    isReorderingEnvironmentRoles: undefined,
    reorderEnvironmentRolesError: undefined,
    isReorderingAppRoles: undefined,
    reorderAppRolesError: undefined,
    isReorderingOrgRoles: undefined,
    reorderOrgRolesError: undefined,

    isFetchingExternalAuthSession: undefined,
    fetchExternalAuthSessionError: undefined,

    vantaIsFetchingExternalAuthSession: undefined,
    vantaFetchExternalAuthSessionError: undefined,

    isFetchingAuthProviders: undefined,
    fetchAuthProvidersError: undefined,
    samlSettingsByProviderId: {},
    externalAuthProviders: undefined,
    isDeletingAuthProvider: undefined,
    deleteAuthProviderError: undefined,

    isCreatingProvisioningProvider: undefined,
    isListingInvitableScimUsers: undefined,
    listInvitableScimUsersError: undefined,
    createProvisioningProviderError: undefined,
    isUpdatingProvisioningProvider: undefined,
    updateProvisioningProviderError: undefined,
    isDeletingProvisioningProvider: undefined,
    deleteProvisioningProviderError: undefined,

    isUpdatingLicense: undefined,
    updateLicenseError: undefined,

    isFetchingOrgStats: undefined,
    fetchOrgStatsError: undefined,

    isExportingOrg: undefined,
    exportOrgError: undefined,

    cloudBillingIsSubscribingProduct: undefined,
    cloudBillingSubscribeProductError: undefined,

    cloudBillingIsUpdatingSubscriptionQuantity: undefined,
    cloudBillingUpdateSubscriptionQuantityError: undefined,

    cloudBillingIsCancelingSubscription: undefined,
    cloudBillingCancelSubscriptionError: undefined,

    cloudBillingIsUpdatingPaymentMethod: undefined,
    cloudBillingUpdatePaymentMethodError: undefined,

    cloudBillingIsUpdatingSettings: undefined,
    cloudBillingUpdateSettingsError: undefined,

    cloudBillingIsCheckingPromotionCode: undefined,
    cloudBillingCheckPromotionCodeError: undefined,

    cloudBillingIsFetchingInvoices: undefined,
    cloudBillingFetchInvoicesError: undefined,

    cloudBillingInvoices: [],

    cloudBillingPromotionCode: undefined,

    vantaConnectingAccount: undefined,
    vantaCreatingExternalAuthSession: undefined,
    vantaExternalAuthSessionCreationError: undefined,
    vantaPendingExternalAuthSession: undefined,
    vantaIsAuthorizingExternallyForSessionId: undefined,
    vantaAuthorizingExternallyErrorMessage: undefined,
    vantaStartingExternalAuthSession: undefined,
    vantaStartingExternalAuthSessionError: undefined,
    vantaCompletedExternalAuth: undefined,
    vantaIsRemovingConnection: undefined,
    vantaRemovingConnectionError: undefined,

    throttleError: undefined,

    cryptoStatus: undefined,
    isProcessingApi: undefined,
  },
  defaultProcState: ProcState = {
    orgUserAccounts: {},
    cliKeyAccounts: {},
    pendingSelfHostedDeployments: [],
    accountStates: {},
    clientStates: {},
    defaultAccountId: undefined,
    defaultDeviceName: undefined,
    requiresPassphrase: undefined,
    lockoutMs: undefined,
    deviceKeyUpdatedAt: undefined,
    locked: false,
    unlockedAt: undefined,
    lastActiveAt: undefined,
    networkUnreachable: undefined,
    selfHostedUpgradesAvailable: {},
    skippedSelfHostedUpgradeAt: undefined,
    uiLastSelectedAccountId: undefined,
    uiLastSelectedUrl: undefined,
    cloudProducts: undefined,
    cloudPrices: undefined,
    isLoadingCloudProducts: undefined,
    loadCloudProductsError: undefined,
    v1UpgradeLoaded: undefined,
    v1IsUpgrading: undefined,
    v1UpgradeError: undefined,
    v1ActiveUpgrade: undefined,
    v1UpgradeAccountId: undefined,
    v1UpgradeStatus: undefined,
    v1UpgradeInviteToken: undefined,
    v1UpgradeEncryptionToken: undefined,
    v1UpgradeAcceptedInvite: undefined,
    v1ClientAliveAt: undefined,
    hasV1PendingUpgrade: undefined,
    isCheckingV1PendingUpgrade: undefined,
    checkV1PendingUpgradeError: undefined,
  },
  lockedState = { ...defaultProcState, locked: true },
  ACCOUNT_STATE_KEYS = Object.keys(
    defaultAccountState
  ) as (keyof PartialAccountState)[],
  CLIENT_STATE_KEYS = Object.keys(
    defaultClientState
  ) as (keyof PartialClientState)[],
  PROC_STATE_KEYS = Object.keys(defaultProcState) as (keyof ProcState)[],
  CLIENT_PROC_STATE_KEYS = R.without(
    ["clientStates", "accountStates"],
    Object.keys(defaultProcState)
  ) as (keyof ClientProcState)[];
