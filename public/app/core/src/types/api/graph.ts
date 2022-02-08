import { Db } from "./db";

export namespace Graph {
  export type GraphObject =
    | Db.Org
    | Db.OrgRole
    | Db.AppRole
    | Db.EnvironmentRole
    | Db.AppRoleEnvironmentRole
    | Db.Group
    | Db.AppUserGroup
    | Db.AppGroupUserGroup
    | Db.AppGroupUser
    | Db.AppGroupBlock
    | Db.AppBlockGroup
    | Db.AppGroupBlockGroup
    | Db.Server
    | Db.LocalKey
    | Db.IncludedAppRole
    | Db.Environment
    | Db.VariableGroup
    | Db.GeneratedEnvkey
    | Db.OrgUserDevice
    | Db.OrgUser
    | Db.CliUser
    | Db.RecoveryKey
    | Db.DeviceGrant
    | Db.Invite
    | Db.App
    | Db.Block
    | Db.AppUserGrant
    | Db.AppBlock
    | Db.GroupMembership
    | Db.PubkeyRevocationRequest
    | Db.RootPubkeyReplacement
    | Db.ExternalAuthProvider
    | Db.ScimProvisioningProvider;

  export type OrgGraph = {
    [id: string]: GraphObject;
  };

  export type Scope = GraphObject["type"];

  export type BaseScopeType = (
    | Db.Org
    | Db.OrgRole
    | Db.AppRole
    | Db.EnvironmentRole
    | Db.AppRoleEnvironmentRole
    | Db.PubkeyRevocationRequest
    | Db.RootPubkeyReplacement
    | Db.ExternalAuthProvider
    | Db.ScimProvisioningProvider
  )["type"];

  export type NonBaseScopeType = Exclude<Scope, BaseScopeType>;

  export const baseScopeTypes: BaseScopeType[] = [
    "orgRole",
    "appRole",
    "environmentRole",
    "appRoleEnvironmentRole",
  ];
}
