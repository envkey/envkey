import { Graph, Rbac, Model } from "../../types";
import moment from "moment";

export const getEnvironmentName = (
  graph: Graph.Graph,
  environmentId: string
) => {
  const environment = graph[environmentId] as Model.Environment | undefined;

  if (environment) {
    const role = graph[environment.environmentRoleId] as Rbac.EnvironmentRole;
    return "subName" in environment ? environment.subName : role.name;
  } else {
    const [, localsUserId] = environmentId.split("|");
    return getUserName(graph, localsUserId, true) + " Locals";
  }
};

export const getGroupObjectTypeLabel = (
  graph: Graph.Graph,
  groupId: string
) => {
  const group = graph[groupId] as Model.Group;
  switch (group.objectType) {
    case "orgUser":
      return "team";
    case "app":
      return "app group";
    case "block":
      return "block group";
  }
};

export const getGroupObjectTypeLabelCamelized = (
  graph: Graph.Graph,
  groupId: string
) => {
  const group = graph[groupId] as Model.Group;
  switch (group.objectType) {
    case "orgUser":
      return "Team";
    case "app":
      return "App Group";
    case "block":
      return "Block Group";
  }
};

export const getUserName = (
  graph: Graph.Graph,
  userOrDeviceId: string,
  firstInitialOnly?: boolean,
  lastNameFirst?: boolean
) => {
  const userOrDevice = graph[userOrDeviceId] as
    | Model.OrgUser
    | Model.CliUser
    | Model.OrgUserDevice;
  const user =
    userOrDevice.type == "orgUserDevice"
      ? (graph[userOrDevice.userId] as Model.OrgUser)
      : userOrDevice;
  if (user.type == "orgUser") {
    const first = firstInitialOnly ? user.firstName[0] + "." : user.firstName;
    return lastNameFirst
      ? `${user.lastName}, ${first}`
      : `${first} ${user.lastName}`;
  }

  return user.name;
};

export const getObjectName = (graph: Graph.Graph, id: string): string => {
  const object = graph[id] as Graph.GraphObject | undefined;

  if (!object) {
    return "unknown";
  }

  switch (object.type) {
    case "org":
    case "orgUserDevice":
    case "app":
    case "block":
    case "server":
    case "localKey":
    case "orgRole":
    case "appRole":
    case "environmentRole":
    case "variableGroup":
    case "group":
      return object.name;

    case "license":
      return (
        object.plan +
        (object.provisional ? " (provisional)" : "") +
        ` - valid until ${moment.utc(object.expiresAt).format("lll")} UTC`
      );

    case "orgUser":
    case "cliUser":
      return getUserName(graph, id);

    case "recoveryKey":
      return `${getUserName(graph, object.userId)} Recovery Key - ${moment
        .utc(object.createdAt)
        .format("lll")} UTC`;

    case "environment":
      let environmentName: string;

      if (object.isSub) {
        environmentName =
          getEnvironmentName(graph, object.parentEnvironmentId) +
          " > " +
          object.subName;
      } else {
        environmentName = getEnvironmentName(graph, id);
      }

      return environmentName;

    case "generatedEnvkey":
      return `${object.envkeyShort}…`;

    case "externalAuthProvider":
      return object.provider == "saml"
        ? `SAML Connection '{object.nickname ?? object.id}'`
        : `External Auth Provider '${object.id}'`;

    case "scimProvisioningProvider":
      return `SCIM Connection '${object.nickname ?? object.endpointBaseUrl}'`;

    case "vantaConnectedAccount":
      return `Vanta Integration Connection`;

    // The following aren't printed out anywhere yet, but could be in the future
    case "deviceGrant":
    case "invite":
    case "appUserGrant":
    case "appBlock":
    case "groupMembership":
    case "appUserGroup":
    case "appGroupUserGroup":
    case "appGroupUser":
    case "appGroupBlock":
    case "appBlockGroup":
    case "appGroupBlockGroup":
    case "includedAppRole":
    case "appRoleEnvironmentRole":
    case "pubkeyRevocationRequest":
    case "rootPubkeyReplacement":
    case "product":
    case "price":
    case "customer":
    case "subscription":
    case "paymentSource":
      return "";
  }
};
