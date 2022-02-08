import { Model } from "../model";
import * as Rbac from "../rbac";
import * as Billing from "../billing";

export namespace Graph {
  export type UserGraphObject =
    | Model.Org
    | Model.OrgUserDevice
    | Model.OrgUser
    | Model.CliUser
    | Model.DeviceGrant
    | Model.Invite
    | Model.RecoveryKey
    | Model.App
    | Model.Block
    | Model.AppUserGrant
    | Model.AppBlock
    | Model.GroupMembership
    | Model.Group
    | Model.AppUserGroup
    | Model.AppGroupUserGroup
    | Model.AppGroupUser
    | Model.AppGroupBlock
    | Model.AppBlockGroup
    | Model.AppGroupBlockGroup
    | Model.Server
    | Model.LocalKey
    | Model.IncludedAppRole
    | Model.Environment
    | Model.VariableGroup
    | Model.GeneratedEnvkey
    | Rbac.OrgRole
    | Rbac.AppRole
    | Rbac.EnvironmentRole
    | Rbac.AppRoleEnvironmentRole
    | Model.PubkeyRevocationRequest
    | Model.RootPubkeyReplacement
    | Model.ExternalAuthProvider
    | Billing.License
    | Model.ScimProvisioningProvider;

  export type UserGraph = { [id: string]: UserGraphObject };
}
