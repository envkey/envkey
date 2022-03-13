import * as z from "zod";

export const orgPermissions = {
    org_rename: {
      description: "rename org",
    },
    org_manage_settings: {
      description: "read and update org settings",
    },
    org_manage_auth_settings: {
      description: "read and update authentication settings",
    },
    org_manage_billing: {
      description: "manage billing",
    },
    org_manage_users: {
      description: "add, update, and remove user access",
    },
    org_manage_user_devices: {
      description: "add or remove device access",
    },
    org_invite_users_to_permitted_apps: {
      description: "invite users to permitted apps",
    },
    org_approve_devices_for_permitted: {
      description: "approve device access for permitted apps",
    },
    org_manage_cli_users: {
      description: "add, update, and remove CLI key access",
    },
    org_create_cli_users_for_permitted_apps: {
      description: "create CLI keys for permitted apps",
    },
    org_manage_app_roles: {
      description: "create, update, and remove app roles",
    },
    org_manage_org_roles: {
      description: "create, update, and remove org roles",
    },
    org_manage_environment_roles: {
      description: "create, update, and remove environment roles",
    },
    org_manage_teams: {
      description: "create, update, and remove teams",
    },
    org_manage_app_groups: {
      description: "create, update, and remove app groups",
    },
    org_manage_block_groups: {
      description: "create, update, and remove block groups",
    },
    org_read_logs: {
      description: "read org logs",
    },
    org_manage_firewall: {
      description: "manage org permitted networks",
    },
    org_generate_recovery_key: {
      description: "generate recovery key",
    },
    org_clear_tokens: {
      description: "clear access tokens",
    },
    org_archive_import_export: {
      description: "import or export .envkey-archive files",
    },
    org_delete: {
      description: "delete organization",
    },

    apps_create: {
      description: "create apps",
    },
    apps_delete: { description: "delete apps" },
    apps_read_permitted: { description: "view permitted apps" },

    blocks_create: { description: "create blocks" },
    blocks_read_all: { description: "view any block" },
    blocks_rename: { description: "rename any block" },
    blocks_manage_settings: { description: "manage any block's settings" },
    blocks_write_envs_all: { description: "update environments for any block" },
    blocks_write_envs_permitted: {
      description: "update permitted environments for permitted blocks",
    },
    blocks_manage_connections_permitted: {
      description: "connect and disconnect blocks from permitted apps",
    },
    blocks_manage_environments: {
      description: "add and remove block environments",
    },
    blocks_delete: { description: "delete any block" },

    self_hosted_upgrade: {
      description: "upgrade self-hosted EnvKey installation",
    },
    self_hosted_manage_host: {
      description: "manage self-hosted EnvKey installation",
    },
    self_hosted_read_host_logs: {
      description: "read host-level logs for a self-hosted EnvKey installation",
    },
  },
  appPermissions = {
    app_read: { description: "view app" },
    app_rename: { description: "rename app" },
    app_manage_settings: { description: "update app settings" },
    app_manage_users: {
      description: "add, update, or remove user access",
    },
    app_approve_user_devices: { description: "approve device access" },
    app_manage_cli_users: {
      description: "add, update, or remove CLI key access",
    },
    app_read_own_locals: { description: "read their own local environment" },
    app_read_user_locals: { description: "read all users' local environments" },
    app_read_user_locals_history: {
      description: "read version history for all users' local environments",
    },
    app_write_user_locals: {
      description: "update all users' local environments",
    },
    app_manage_blocks: { description: "connect and disconnect blocks" },
    app_manage_environments: { description: "add and remove environments" },
    app_manage_servers: { description: "create and remove servers" },
    app_manage_local_keys: { description: "create and remove local keys" },
    app_read_logs: { description: "read app logs" },
    app_manage_included_roles: {
      description: "add or remove permitted app roles",
    },
    app_manage_firewall: {
      description: "manage app permitted networks",
    },
  },
  environmentWritePermissions = {
    write: { description: "update environment" },
    write_branches: { description: "update branches" },
  },
  environmentReadPermissions = {
    read: { description: "read environment" },
    read_inherits: { description: "read environment inheritance metadata" },
    read_meta: { description: "read environment metadata" },
    read_history: { description: "read environment version history" },
    read_branches: { description: "read branches" },
    read_branches_inherits: {
      description: "read branch inheritance metadata",
    },
    read_branches_meta: { description: "read branches' metadata" },
    read_branches_history: {
      description: "read branch version history",
    },
  },
  environmentPermissions = {
    ...environmentWritePermissions,
    ...environmentReadPermissions,
  };

export const OrgPermissionSchema = z.enum(
  Object.keys(orgPermissions) as [
    keyof typeof orgPermissions,
    keyof typeof orgPermissions,
    ...(keyof typeof orgPermissions)[]
  ]
);
export type OrgPermission = z.infer<typeof OrgPermissionSchema>;

export const AppPermissionSchema = z.enum(
  Object.keys(appPermissions) as [
    keyof typeof appPermissions,
    keyof typeof appPermissions,
    ...(keyof typeof appPermissions)[]
  ]
);
export type AppPermission = z.infer<typeof AppPermissionSchema>;

export const EnvironmentWritePermissionSchema = z.enum(
  Object.keys(environmentWritePermissions) as [
    keyof typeof environmentWritePermissions,
    keyof typeof environmentWritePermissions,
    ...(keyof typeof environmentWritePermissions)[]
  ]
);
export type EnvironmentWritePermission = z.infer<
  typeof EnvironmentWritePermissionSchema
>;

export const EnvironmentReadPermissionSchema = z.enum(
  Object.keys(environmentReadPermissions) as [
    keyof typeof environmentReadPermissions,
    keyof typeof environmentReadPermissions,
    ...(keyof typeof environmentReadPermissions)[]
  ]
);
export type EnvironmentReadPermission = z.infer<
  typeof EnvironmentReadPermissionSchema
>;

export const EnvironmentPermissionSchema = z.enum(
  Object.keys(environmentPermissions) as [
    keyof typeof environmentPermissions,
    keyof typeof environmentPermissions,
    ...(keyof typeof environmentPermissions)[]
  ]
);
export type EnvironmentPermission = z.infer<typeof EnvironmentPermissionSchema>;

export const EnvironmentPermissionsSchema = z.record(
  z.array(EnvironmentPermissionSchema)
);
export type EnvironmentPermissions = z.infer<
  typeof EnvironmentPermissionsSchema
>;

export const EnvironmentReadPermissionsSchema = z.record(
  z.array(EnvironmentReadPermissionSchema)
);
export type EnvironmentReadPermissions = z.infer<
  typeof EnvironmentReadPermissionsSchema
>;

export const EnvironmentWritePermissionsSchema = z.record(
  z.array(EnvironmentWritePermissionSchema)
);
export type EnvironmentWritePermissions = z.infer<
  typeof EnvironmentWritePermissionsSchema
>;

export const DEFAULT_ORG_BASIC_USER_PERMISSIONS: OrgPermission[] = [
    "apps_read_permitted",
    "org_invite_users_to_permitted_apps",
    "org_create_cli_users_for_permitted_apps",
    "org_approve_devices_for_permitted",
    "blocks_write_envs_permitted",
    "blocks_manage_connections_permitted",
    "org_generate_recovery_key",
  ],
  DEFAULT_ORG_ADMIN_PERMISSIONS: OrgPermission[] = [
    ...DEFAULT_ORG_BASIC_USER_PERMISSIONS,
    "apps_create",
    "apps_delete",
    "blocks_create",
    "blocks_read_all",
    "blocks_rename",
    "blocks_manage_settings",
    "blocks_write_envs_all",
    "blocks_delete",
    "blocks_manage_environments",
    "org_manage_users",
    "org_manage_cli_users",
    "org_read_logs",
    "org_manage_app_roles",
    "org_manage_teams",
    "org_manage_app_groups",
    "org_manage_block_groups",
    "org_manage_environment_roles",
  ],
  DEFAULT_ORG_OWNER_PERMISSIONS = Object.keys(
    orgPermissions
  ) as OrgPermission[],
  DEFAULT_APP_DEVELOPER_PERMISSIONS: AppPermission[] = [
    "app_read",
    "app_manage_local_keys",
    "app_read_own_locals",
  ],
  DEFAULT_APP_DEVOPS_PERMISSIONS: AppPermission[] = [
    ...DEFAULT_APP_DEVELOPER_PERMISSIONS,
    "app_manage_blocks",
    "app_manage_servers",
  ],
  DEFAULT_APP_ADMIN_PERMISSIONS = Object.keys(
    appPermissions
  ) as AppPermission[],
  ENV_READ_PERMISSIONS: EnvironmentPermission[] = [
    "read",
    "read_inherits",
    "read_meta",
    "read_history",
  ],
  SUB_ENV_READ_PERMISSIONS: EnvironmentPermission[] = [
    "read_branches",
    "read_branches_inherits",
    "read_branches_meta",
    "read_branches_history",
  ],
  ENV_WRITE_PERMISSIONS: EnvironmentPermission[] = ["write"],
  SUB_ENV_WRITE_PERMISSIONS: EnvironmentPermission[] = ["write_branches"],
  ENVIRONMENT_READ_WRITE_PERMISSIONS = Array.from(
    new Set([
      ...ENV_READ_PERMISSIONS,
      ...ENV_WRITE_PERMISSIONS,
      ...SUB_ENV_READ_PERMISSIONS,
    ])
  ) as EnvironmentPermission[],
  ENVIRONMENT_DEVOPS_PERMISSIONS = Array.from(
    new Set([
      ...ENVIRONMENT_READ_WRITE_PERMISSIONS,
      ...SUB_ENV_WRITE_PERMISSIONS,
    ])
  ) as EnvironmentPermission[],
  ENVIRONMENT_FULL_PERMISSIONS = Array.from(
    new Set([...ENVIRONMENT_DEVOPS_PERMISSIONS])
  ) as EnvironmentPermission[],
  ENVIRONMENT_META_ONLY_PERMISSIONS: EnvironmentPermission[] = [
    "read_inherits",
    "read_meta",
    "read_branches_inherits",
    "read_branches_meta",
  ],
  ORG_PERMISSIONS_BY_DEFAULT_ROLE: {
    [name: string]: OrgPermission[];
  } = {
    "Basic User": DEFAULT_ORG_BASIC_USER_PERMISSIONS,
    "Org Admin": DEFAULT_ORG_ADMIN_PERMISSIONS,
    "Org Owner": DEFAULT_ORG_OWNER_PERMISSIONS,
  },
  APP_PERMISSIONS_BY_DEFAULT_ROLE: {
    [name: string]: AppPermission[];
  } = {
    Developer: DEFAULT_APP_DEVELOPER_PERMISSIONS,
    DevOps: DEFAULT_APP_DEVOPS_PERMISSIONS,
    Admin: DEFAULT_APP_ADMIN_PERMISSIONS,
    "Org Admin": DEFAULT_APP_ADMIN_PERMISSIONS,
    "Org Owner": DEFAULT_APP_ADMIN_PERMISSIONS,
  },
  ENVIRONMENT_PERMISSIONS_BY_DEFAULT_ROLE: {
    [name: string]: {
      [name: string]: EnvironmentPermission[];
    };
  } = {
    Developer: {
      Development: ENVIRONMENT_READ_WRITE_PERMISSIONS,
      Staging: ENVIRONMENT_READ_WRITE_PERMISSIONS,
      Production: ENVIRONMENT_META_ONLY_PERMISSIONS,
    },
    DevOps: {
      Development: ENVIRONMENT_DEVOPS_PERMISSIONS,
      Staging: ENVIRONMENT_DEVOPS_PERMISSIONS,
      Production: ENVIRONMENT_DEVOPS_PERMISSIONS,
    },
  };
