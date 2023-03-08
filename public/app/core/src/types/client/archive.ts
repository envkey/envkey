import { Model, Rbac, Api } from "../";
import { Env } from "./envs";

export type OrgArchiveV1 = {
  schemaVersion: "1";

  isV1Upgrade?: boolean;

  org: Pick<
    Model.Org,
    "id" | "name" | "settings" | "environmentRoleIpsAllowed"
  >;
  apps: Pick<
    Model.App,
    | "id"
    | "name"
    | "settings"
    | "environmentRoleIpsAllowed"
    | "environmentRoleIpsMergeStrategies"
  >[];
  blocks: Pick<Model.Block, "id" | "name" | "settings">[];
  appBlocks: Pick<Model.AppBlock, "appId" | "blockId" | "orderIndex">[];

  defaultOrgRoles: Pick<Rbac.OrgRole, "id" | "defaultName">[];
  defaultAppRoles: Pick<Rbac.AppRole, "id" | "defaultName">[];
  defaultEnvironmentRoles: Pick<
    Rbac.EnvironmentRole,
    "id" | "defaultName" | "settings"
  >[];

  nonDefaultEnvironmentRoles: Pick<
    Rbac.EnvironmentRole,
    | "id"
    | "name"
    | "settings"
    | "description"
    | "hasLocalKeys"
    | "hasServers"
    | "defaultAllApps"
    | "defaultAllBlocks"
  >[];
  nonDefaultAppRoleEnvironmentRoles: Pick<
    Rbac.AppRoleEnvironmentRole,
    "appRoleId" | "environmentRoleId" | "permissions"
  >[];

  baseEnvironments: Pick<
    Model.Environment & { isSub: false },
    "id" | "envParentId" | "environmentRoleId" | "settings"
  >[];
  subEnvironments: Pick<
    Model.Environment & { isSub: true },
    | "id"
    | "envParentId"
    | "environmentRoleId"
    | "parentEnvironmentId"
    | "subName"
  >[];

  localKeys?: (Pick<
    Model.LocalKey,
    "appId" | "environmentId" | "userId" | "name"
  > & {
    v1Payload?: Api.Net.ApiParamTypes["GenerateKey"]["v1Payload"];
    v1EnvkeyIdPart?: string;
    v1EncryptionKey?: string;
  })[];
  servers: (Pick<Model.Server, "appId" | "environmentId" | "name"> & {
    v1Payload?: Api.Net.ApiParamTypes["GenerateKey"]["v1Payload"];
    v1EnvkeyIdPart?: string;
    v1EncryptionKey?: string;
  })[];

  orgUsers: (Pick<
    Model.OrgUser,
    | "id"
    | "firstName"
    | "lastName"
    | "email"
    | "provider"
    | "orgRoleId"
    | "uid"
    | "externalAuthProviderId"
    | "scim"
  > & {
    v1Token?: string;
  })[];

  cliUsers: Pick<Model.CliUser, "id" | "orgRoleId" | "name">[];

  appUserGrants: Pick<Model.AppUserGrant, "appId" | "userId" | "appRoleId">[];

  envs: Record<string, Env.EnvWithMeta>;
};
