import { Model, Rbac } from "../";
import { Env } from "./envs";

export type OrgArchiveV1 = {
  schemaVersion: "1";
  org: Pick<Model.Org, "id" | "name" | "settings">;
  apps: Pick<Model.App, "id" | "name" | "settings">[];
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

  servers: Pick<Model.Server, "appId" | "environmentId" | "name">[];

  orgUsers: Pick<
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
  >[];

  cliUsers: Pick<Model.CliUser, "id" | "orgRoleId" | "name">[];

  appUserGrants: Pick<Model.AppUserGrant, "appId" | "userId" | "appRoleId">[];

  envs: Record<string, Env.EnvWithMeta>;
};
