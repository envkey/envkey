import { Api } from "@core/types";

const graphKey = (
  orgId: string,
  type: Api.Graph.GraphObject["type"],
  ...ids: string[]
): Api.Db.DbKey => {
  let skey = "g|" + type;
  for (let id of ids) {
    skey += "|" + id;
  }
  return {
    pkey: orgId,
    skey,
    secondaryIndex: ids.length > 0 ? ids[ids.length - 1] : undefined,
  };
};

export const org = (orgId: string) => graphKey(orgId, "org"),
  orgUserDevice = (orgId: string, userId: string, id: string) =>
    graphKey(orgId, "orgUserDevice", userId, id),
  app = (orgId: string, id: string) => graphKey(orgId, "app", id),
  block = (orgId: string, id: string) => graphKey(orgId, "block", id),
  server = (orgId: string, appId: string, id: string) =>
    graphKey(orgId, "server", appId, id),
  localKey = (orgId: string, appId: string, id: string) =>
    graphKey(orgId, "localKey", appId, id),
  orgRole = (orgId: string, id: string) => graphKey(orgId, "orgRole", id),
  appRole = (orgId: string, id: string) => graphKey(orgId, "appRole", id),
  environmentRole = (orgId: string, id: string) =>
    graphKey(orgId, "environmentRole", id),
  variableGroup = (orgId: string, envParentId: string, id: string) =>
    graphKey(orgId, "variableGroup", envParentId, id),
  group = (orgId: string, id: string) => graphKey(orgId, "group", id),
  orgUser = (orgId: string, id: string) => graphKey(orgId, "orgUser", id),
  cliUser = (orgId: string, id: string) => graphKey(orgId, "cliUser", id),
  recoveryKey = (orgId: string, userId: string, id: string) =>
    graphKey(orgId, "recoveryKey", userId, id),
  environment = (orgId: string, envParentId: string, id: string) =>
    graphKey(orgId, "environment", envParentId, id),
  generatedEnvkey = (
    orgId: string,
    envParentId: string,
    envkeyIdPart: string
  ) => graphKey(orgId, "generatedEnvkey", envParentId, envkeyIdPart),
  externalAuthProvider = (orgId: string, id: string) =>
    graphKey(orgId, "externalAuthProvider", id),
  scimProvisioningProvider = (orgId: string, id: string) =>
    graphKey(orgId, "scimProvisioningProvider", id),
  deviceGrant = (orgId: string, userId: string, id: string) =>
    graphKey(orgId, "deviceGrant", userId, id),
  invite = (orgId: string, userId: string, id: string) =>
    graphKey(orgId, "invite", userId, id),
  appUserGrant = (orgId: string, appId: string, userId: string, id: string) =>
    graphKey(orgId, "appUserGrant", appId, userId, id),
  appBlock = (orgId: string, appId: string, blockId: string, id: string) =>
    graphKey(orgId, "appBlock", appId, blockId, id),
  groupMembership = (orgId: string, objectId: string, id: string) =>
    graphKey(orgId, "groupMembership", objectId, id),
  appUserGroup = (orgId: string, appId: string, id: string) =>
    graphKey(orgId, "appUserGroup", appId, id),
  appGroupUserGroup = (orgId: string, appGroupId: string, id: string) =>
    graphKey(orgId, "appGroupUserGroup", appGroupId, id),
  appGroupUser = (orgId: string, appGroupId: string, id: string) =>
    graphKey(orgId, "appGroupUser", appGroupId, id),
  appGroupBlock = (orgId: string, appGroupId: string, id: string) =>
    graphKey(orgId, "appGroupBlock", appGroupId, id),
  appBlockGroup = (orgId: string, appId: string, id: string) =>
    graphKey(orgId, "appBlockGroup", appId, id),
  appGroupBlockGroup = (orgId: string, appGroupId: string, id: string) =>
    graphKey(orgId, "appGroupBlockGroup", appGroupId, id),
  includedAppRole = (orgId: string, appId: string, id: string) =>
    graphKey(orgId, "includedAppRole", appId, id),
  appRoleEnvironmentRole = (orgId: string, id: string) =>
    graphKey(orgId, "appRoleEnvironmentRole", id),
  pubkeyRevocationRequest = (orgId: string, id: string) =>
    graphKey(orgId, "pubkeyRevocationRequest", id),
  rootPubkeyReplacement = (orgId: string, id: string) =>
    graphKey(orgId, "rootPubkeyReplacement", id),
  customer = (orgId: string) => graphKey(orgId, "customer"),
  subscription = (orgId: string, id: string) =>
    graphKey(orgId, "subscription", id),
  paymentSource = (orgId: string, id: string) =>
    graphKey(orgId, "paymentSource", id),
  vantaConnectedAccount = (orgId: string, id: string) =>
    graphKey(orgId, "vantaConnectedAccount", id);
