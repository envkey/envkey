import * as z from "zod";
import * as utils from "../utils";
import {
  EnvironmentPermissionSchema,
  OrgPermissionSchema,
  AppPermissionSchema,
} from ".";

export const RoleBaseSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    createdAt: z.number(),
    updatedAt: z.number(),
    deletedAt: z.number().optional(),
    orderIndex: z.number(),
  }),
  RoleDefaultPropsSchema = z.union([
    z.object({
      isDefault: z.literal(true),
      defaultName: z.string(),
      defaultDescription: z.string(),
    }),
    z.object({
      isDefault: z.literal(false),
      defaultName: z.undefined(),
      defaultDescription: z.undefined(),
    }),
  ]),
  DefaultableRoleSchema = utils.intersection(
    RoleBaseSchema,
    RoleDefaultPropsSchema
  ),
  DefaultableRoleWithPermissions = <ZodSchemaType extends z.ZodEnum<any>>(
    permissionsSchema: ZodSchemaType
  ) =>
    utils.intersection(
      DefaultableRoleSchema,
      z.union([
        z.object({
          isDefault: z.literal(true),
          defaultName: z.string(),
          permissions: z.undefined(),
          extendsRoleId: z.undefined(),
          addPermissions: z.undefined(),
          removePermissions: z.undefined(),
        }),

        utils.intersection(
          z.object({
            isDefault: z.literal(false),
            defaultName: z.undefined(),
          }),
          WithPermissions(permissionsSchema)
        ),
      ])
    ),
  WithPermissions = <ZodSchemaType extends z.ZodEnum<any>>(
    permissionsSchema: ZodSchemaType
  ) =>
    z.union([
      z.object({
        permissions: z.array(permissionsSchema),
        extendsRoleId: z.undefined(),
        addPermissions: z.undefined(),
        removePermissions: z.undefined(),
      }),
      z.object({
        extendsRoleId: z.string(),
        addPermissions: z.array(permissionsSchema),
        removePermissions: z.array(permissionsSchema),
        permissions: z.undefined(),
      }),
    ]),
  WithOptionalPermissions = <ZodSchemaType extends z.ZodEnum<any>>(
    permissionsSchema: ZodSchemaType
  ) =>
    z.union([
      z
        .object({
          permissions: z.array(permissionsSchema).optional(),
          extendsRoleId: z.undefined(),
          addPermissions: z.undefined(),
          removePermissions: z.undefined(),
        })
        .partial(),
      z
        .object({
          extendsRoleId: z.string(),
          addPermissions: z.array(permissionsSchema),
          removePermissions: z.array(permissionsSchema),
          permissions: z.undefined(),
        })
        .partial(),
    ]),
  OrgRoleCanManageSchema = z.union([
    z.object({
      canManageAllOrgRoles: z.literal(true),
      canManageOrgRoleIds: z.undefined(),
    }),
    z.object({
      canManageAllOrgRoles: z.undefined(),
      canManageOrgRoleIds: z.array(z.string()),
    }),
  ]),
  OrgRoleOptionalCanManageSchema = z.union([
    z
      .object({
        canManageAllOrgRoles: z.literal(true),
        canManageOrgRoleIds: z.undefined(),
      })
      .partial(),
    z
      .object({
        canManageAllOrgRoles: z.undefined(),
        canManageOrgRoleIds: z.array(z.string()),
      })
      .partial(),
  ]),
  OrgRoleCanInviteSchema = z.union([
    z.object({
      canInviteAllOrgRoles: z.literal(true),
      canInviteOrgRoleIds: z.undefined(),
    }),
    z.object({
      canInviteAllOrgRoles: z.undefined(),
      canInviteOrgRoleIds: z.array(z.string()),
    }),
  ]),
  OrgRoleOptionalCanInviteSchema = z.union([
    z
      .object({
        canInviteAllOrgRoles: z.literal(true),
        canInviteOrgRoleIds: z.undefined(),
      })
      .partial(),
    z
      .object({
        canInviteAllOrgRoles: z.undefined(),
        canInviteOrgRoleIds: z.array(z.string()),
      })
      .partial(),
  ]),
  OrgRoleBaseSchema = z.object({
    type: z.literal("orgRole"),
    autoAppRoleId: z.string().optional(),
    canHaveCliUsers: z.boolean(),
  });

export const OrgRoleSchema = utils.intersection(
  DefaultableRoleWithPermissions(OrgPermissionSchema),
  utils.intersection(
    utils.intersection(OrgRoleBaseSchema, OrgRoleCanManageSchema),
    OrgRoleCanInviteSchema
  )
);
export type OrgRole = z.infer<typeof OrgRoleSchema>;

export const AppRoleBaseSchema = z.object({
  type: z.literal("appRole"),
  defaultAllApps: z.boolean(),
  canHaveCliUsers: z.boolean(),
  canManageAppRoleIds: z.array(z.string()),
  canInviteAppRoleIds: z.array(z.string()),
  hasFullEnvironmentPermissions: z.boolean(),
});

export const AppRoleSchema = utils.intersection(
  AppRoleBaseSchema,
  DefaultableRoleWithPermissions(AppPermissionSchema)
);
export type AppRole = z.infer<typeof AppRoleSchema>;

export const EnvironmentRoleSettingsSchema = z.object({
    autoCommit: z.boolean(),
  }),
  EnvironmentRoleBaseSchema = z.object({
    type: z.literal("environmentRole"),
    hasLocalKeys: z.boolean(),
    hasServers: z.boolean(),
    defaultAllApps: z.boolean(),
    defaultAllBlocks: z.boolean(),
    orderIndex: z.number(),
    settings: EnvironmentRoleSettingsSchema,
  });

export const EnvironmentRoleSchema = utils.intersection(
  EnvironmentRoleBaseSchema,
  DefaultableRoleSchema
);

export type EnvironmentRole = z.infer<typeof EnvironmentRoleSchema>;

export const AppRoleEnvironmentRoleSchema = z.object({
  id: z.string(),
  type: z.literal("appRoleEnvironmentRole"),
  appRoleId: z.string(),
  permissions: z.array(EnvironmentPermissionSchema),
  environmentRoleId: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().optional(),
});
export type AppRoleEnvironmentRole = z.infer<
  typeof AppRoleEnvironmentRoleSchema
>;

export type LabeledEnvironmentRole = Pick<EnvironmentRole, "id" | "name">;
