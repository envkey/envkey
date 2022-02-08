import {
  OrgPermission,
  AppPermission,
  EnvironmentPermission,
  orgPermissions,
  appPermissions,
  environmentPermissions,
} from ".";
import * as z from "zod";
import { ZodLiteralRecord } from "../utils";

const GeneratedEnvkeyIdSchema = z.string();

export const PermissionFlagSchema = <
    PermissionType extends OrgPermission | AppPermission | EnvironmentPermission
  >(
    permissions: PermissionType[]
  ) => ZodLiteralRecord(permissions, z.literal(true)),
  OrgPermissionFlagSchema = PermissionFlagSchema(
    Object.keys(orgPermissions) as OrgPermission[]
  ),
  AppPermissionFlagSchema = PermissionFlagSchema(
    Object.keys(appPermissions) as AppPermission[]
  ),
  EnvironmentPermissionFlagSchema = PermissionFlagSchema(
    Object.keys(environmentPermissions) as EnvironmentPermission[]
  );

export type OrgAccessScope =
  | "all"
  | {
      userIds?: Set<string> | "all";
      deviceIds?: Set<string> | "all";
      envParentIds?: Set<string> | "all";
      environmentIds?: Set<string> | "all";
      keyableParentIds?: Set<string> | "all";
    };

export type OrgAccessSet = z.infer<typeof OrgAccessSetSchema>;
export const OrgAccessSetSchema = z.object({
  org: z
    .object({
      users: z.record(OrgPermissionFlagSchema).optional(),
      devices: z.record(OrgPermissionFlagSchema).optional(),
    })
    .optional(),
  apps: z
    .record(
      z.object({
        users: z.record(AppPermissionFlagSchema).optional(),
        devices: z.record(AppPermissionFlagSchema).optional(),
      })
    )
    .optional(),
  environments: z
    .record(
      z.object({
        servers: z.record(GeneratedEnvkeyIdSchema).optional(),
        localKeys: z.record(GeneratedEnvkeyIdSchema).optional(),
        users: z.record(EnvironmentPermissionFlagSchema).optional(),
        devices: z.record(EnvironmentPermissionFlagSchema).optional(),
      })
    )
    .optional(),
});

export const OrgAccessUpdatedSchema = z.object({
  granted: OrgAccessSetSchema.optional(),
  removed: OrgAccessSetSchema.optional(),
});

export type OrgAccessUpdated = z.infer<typeof OrgAccessUpdatedSchema>;
