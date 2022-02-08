import { default as ActionType } from "./action_type";
import { Db } from "./db";
import { Net } from "./net";

export type HandlerContext =
  | {
      type: ActionType.CREATE_INVITE;
      inviteId: string;
      inviteeId: string;
    }
  | {
      type: ActionType.CREATE_DEVICE_GRANT;
      granteeId: string;
      createdId: string;
    }
  | {
      type:
        | ActionType.CREATE_CLI_USER
        | ActionType.CREATE_APP
        | ActionType.CREATE_BLOCK
        | ActionType.CREATE_VARIABLE_GROUP
        | ActionType.CREATE_SERVER
        | ActionType.CREATE_LOCAL_KEY
        | ActionType.RBAC_CREATE_ORG_ROLE
        | ActionType.CREATE_ENVIRONMENT
        | ActionType.RBAC_CREATE_ENVIRONMENT_ROLE
        | ActionType.RBAC_CREATE_APP_ROLE
        | ActionType.RBAC_CREATE_INCLUDED_APP_ROLE
        | ActionType.CREATE_GROUP
        | ActionType.CREATE_GROUP_MEMBERSHIP
        | ActionType.CREATE_APP_USER_GROUP
        | ActionType.CREATE_APP_GROUP_USER_GROUP
        | ActionType.CREATE_APP_GROUP_USER
        | ActionType.CREATE_APP_BLOCK_GROUP
        | ActionType.CREATE_APP_GROUP_BLOCK
        | ActionType.CREATE_APP_GROUP_BLOCK_GROUP
        | ActionType.GENERATE_KEY
        | ActionType.GRANT_APP_ACCESS
        | ActionType.CONNECT_BLOCK
        | ActionType.CREATE_RECOVERY_KEY
        | ActionType.CREATE_ORG_SAML_PROVIDER
        | ActionType.CREATE_SCIM_PROVISIONING_PROVIDER;
      createdId: string;
    }
  | {
      type: ActionType.ACCEPT_INVITE;
      authToken: Db.AuthToken;
      orgUserDevice: Db.OrgUserDevice;
      invite: Db.Invite;
    }
  | {
      type: ActionType.ACCEPT_DEVICE_GRANT;
      authToken: Db.AuthToken;
      orgUserDevice: Db.OrgUserDevice;
      deviceGrant: Db.DeviceGrant;
    }
  | {
      type: ActionType.LOAD_RECOVERY_KEY;
      recoveryKey: Db.RecoveryKey;
    }
  | {
      type: ActionType.REDEEM_RECOVERY_KEY;
      authToken: Db.AuthToken;
      orgUserDevice: Db.OrgUserDevice;
      recoveryKey: Db.RecoveryKey;
    }
  | {
      type: ActionType.FETCH_ENVKEY | ActionType.CHECK_ENVKEY;
      orgId: string;
      actorId: string;
      deviceId: string | undefined;
      generatedEnvkey: Db.GeneratedEnvkey;
    }
  | {
      type: ActionType.CREATE_SCIM_USER | ActionType.UPDATE_SCIM_USER;
      scimUserCandidate: Db.ScimUserCandidate;
      scimUserResponse: Net.ScimUserResponse;
    }
  | {
      type: ActionType.GET_EXTERNAL_AUTH_SESSION;
      externalAuthSession: Db.ExternalAuthSession;
    }
  | {
      type: ActionType.GET_SCIM_USER;
      status: number;
      scimUserResponse: Net.ScimUserResponse;
      scimUserCandidate: Db.ScimUserCandidate;
    }
  | {
      type: ActionType.DELETE_SCIM_USER;
      orgUser?: Db.OrgUser;
      scimUserCandidate: Db.ScimUserCandidate;
    }
  | {
      type: ActionType.REVOKE_INVITE;
      invite: Db.Invite;
    }
  | {
      type: ActionType.REVOKE_DEVICE_GRANT;
      deviceGrant: Db.DeviceGrant;
    }
  | {
      type: ActionType.REVOKE_DEVICE;
      device: Db.OrgUserDevice;
    }
  | {
      type: ActionType.ENVKEY_FETCH_UPDATE_TRUSTED_ROOT_PUBKEY;
      actorId: string;
    }
  | {
      type: ActionType.AUTHENTICATE_CLI_KEY;
      cliUser: Db.CliUser;
    };
