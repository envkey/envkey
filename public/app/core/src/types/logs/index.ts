import * as Rbac from "../rbac";
import ActionType from "../api/action_type";
import { Model } from "../model";
import { Blob } from "../blob";
import * as z from "zod";
import * as utils from "../utils";

export namespace Logs {
  export const TOTAL_COUNT_LIMIT = 10000;

  export type Actor =
    | Model.OrgUser
    | Model.CliUser
    | Model.ScimProvisioningProvider
    | Model.Server;

  export const hostLoggableTypesSchema = z.enum(["hostAction"]),
    orgLoggableTypesSchema = z.enum([
      "authAction",
      "fetchMetaAction",
      "fetchEnvsAction",
      "fetchEnvkeyAction",
      "checkEnvkeyAction",
      "fetchLogsAction",
      "orgAction",
      "updateUserEnvsAction",
      "updateEnvkeyEnvsAction",
      "reencryptEnvsAction",
      "scimAction",
    ]),
    allLoggableTypesSchema = z.union([
      hostLoggableTypesSchema,
      orgLoggableTypesSchema,
    ]);

  export type LoggableType = z.infer<typeof allLoggableTypesSchema>;

  export type LoggedHostActionProps = z.infer<
    typeof LoggedHostActionPropsSchema
  >;
  export const LoggedHostActionPropsSchema = z.object({
    loggableType: z.literal("hostAction"),
    loggableType2: allLoggableTypesSchema.optional(),
    loggableType3: allLoggableTypesSchema.optional(),
    loggableType4: allLoggableTypesSchema.optional(),
    orgId: z.undefined(),
    actorId: z.undefined(),
    deviceId: z.undefined(),
  });

  export type LoggedAuthActionProps = z.infer<
    typeof LoggedAuthActionPropsSchema
  >;
  export const LoggedAuthActionPropsSchema = z.object({
    loggableType: z.literal("authAction"),
    loggableType2: orgLoggableTypesSchema.optional(),
    loggableType3: orgLoggableTypesSchema.optional(),
    loggableType4: orgLoggableTypesSchema.optional(),
    actionType: z.string(),
    orgId: z.union([z.string(), z.undefined()]),
    actorId: z.string().optional(),
    deviceId: z.union([z.string(), z.undefined()]),
  });

  export type LoggedScimActionProps = z.infer<
    typeof LoggedScimActionPropsSchema
  >;
  export const LoggedScimActionPropsSchema = z.object({
    loggableType: z.literal("scimAction"),
    loggableType2: orgLoggableTypesSchema.optional(),
    loggableType3: orgLoggableTypesSchema.optional(),
    loggableType4: orgLoggableTypesSchema.optional(),
    actionType: z.string(),
    orgId: z.string(),
    actorId: z.string(),
    deviceId: z.undefined(),
  });

  export type LoggedOrgActionProps = z.infer<typeof LoggedOrgActionPropsSchema>;
  export const LoggedOrgActionPropsSchema = z.object({
    loggableType: z.literal("orgAction"),
    loggableType2: orgLoggableTypesSchema.optional(),
    loggableType3: orgLoggableTypesSchema.optional(),
    loggableType4: orgLoggableTypesSchema.optional(),
    actionType: z.string(),
    orgId: z.string(),
    actorId: z.string(),
    deviceId: z.union([z.string(), z.undefined()]),

    accessUpdated: Rbac.OrgAccessUpdatedSchema.optional(),
    blobsUpdated: Blob.BlobSetSchema.optional(),
  });

  export type LoggedFetchActionProps = z.infer<
    typeof LoggedFetchActionPropsSchema
  >;
  const LoggedFetchActionBaseSchema = z.object({
    loggableType: z.enum(["fetchMetaAction", "fetchLogsAction"]),
    loggableType2: orgLoggableTypesSchema.optional(),
    loggableType3: orgLoggableTypesSchema.optional(),
    loggableType4: orgLoggableTypesSchema.optional(),
    orgId: z.string(),
    actorId: z.string(),

    deviceId: z.union([z.string(), z.undefined()]),
    environmentReadPermissions:
      Rbac.EnvironmentReadPermissionsSchema.optional(),
  });
  export const LoggedFetchActionPropsSchema = utils.intersection(
    LoggedFetchActionBaseSchema,
    z.union([
      z.object({
        actionType: z.enum([
          ActionType.GET_SESSION,
          ActionType.FETCH_ENVS,
          ActionType.FETCH_LOGS,
          ActionType.FETCH_DELETED_GRAPH,
        ]),
      }),

      z.object({
        actionType: z.literal(ActionType.LOAD_INVITE),
        inviteId: z.string(),
      }),

      z.object({
        actionType: z.literal(ActionType.LOAD_DEVICE_GRANT),
        deviceGrantId: z.string(),
      }),

      z.object({
        actionType: z.literal(ActionType.LOAD_RECOVERY_KEY),
        recoveryKeyId: z.string(),
      }),
    ])
  );

  export type LoggedFetchEnvkeyActionProps = z.infer<
    typeof LoggedFetchEnvkeyActionPropsSchema
  >;
  export const LoggedFetchEnvkeyActionPropsSchema = z.object({
    loggableType: z.enum(["fetchEnvkeyAction", "checkEnvkeyAction"]),
    loggableType2: z.literal("authAction").optional(),
    loggableType3: z.undefined(),
    loggableType4: z.undefined(),
    actionType: z.union([
      z.literal(ActionType.FETCH_ENVKEY),
      z.literal(ActionType.CHECK_ENVKEY),
    ]),
    orgId: z.string(),

    actorId: z.union([z.string(), z.undefined()]),
    deviceId: z.union([z.string(), z.undefined()]),
    generatedEnvkeyId: z.string(),
    fetchServiceVersion: z.number(),
    isFailoverRequest: z.literal(true).optional(),
  });

  export type LoggedAction = z.infer<typeof LoggedActionSchema>;

  export const LoggedActionSchema = utils.intersection(
    z
      .object({
        type: z.literal("loggedAction"),
        id: z.string(),
        transactionId: z.string(),
        actionType: z.string(),
        ip: z.string(),
        clientName: z.union([z.string(), z.undefined()]),
        responseBytes: z.number(),
        responseType: z.string(),
        error: z.literal(true).optional(),
        errorReason: z.string().optional(),
        errorStatus: z.number().optional(),

        summary: z.string().optional(),
      })
      .merge(Model.TimestampsSchema),
    z.union([
      LoggedHostActionPropsSchema,
      LoggedAuthActionPropsSchema,
      LoggedScimActionPropsSchema,
      LoggedOrgActionPropsSchema,
      LoggedFetchActionPropsSchema,
      LoggedFetchEnvkeyActionPropsSchema,
    ])
  );

  export const HOST_LOGGABLE_TYPES: Extract<LoggableType, "hostAction">[] = [
      "hostAction",
    ],
    ORG_LOGGABLE_TYPES: Exclude<LoggableType, "hostAction">[] = [
      "authAction",
      "fetchMetaAction",
      "fetchEnvsAction",
      "fetchEnvkeyAction",
      "fetchLogsAction",
      "orgAction",
      "updateUserEnvsAction",
      "updateEnvkeyEnvsAction",
      "scimAction",
    ],
    ALL_LOGGABLE_TYPES = [...HOST_LOGGABLE_TYPES, ...ORG_LOGGABLE_TYPES];

  export type FetchLogParams = z.infer<typeof FetchLogParamsSchema>;

  export const FetchLogParamsSchema = utils.intersection(
    z.union([
      z.object({
        scope: z.literal("host"),
        orgIds: z.array(z.string()),
        loggableTypes: z.undefined(),
      }),
      z.object({
        scope: z.literal("org"),
        loggableTypes: z.array(orgLoggableTypesSchema),
        orgIds: z.undefined(),
      }),
    ]),
    z.object({
      sortDesc: z.literal(true).optional(),
      startsAt: z.number().optional(),
      endsAt: z.number().optional(),
      pageSize: z.number().optional(),
      pageNum: z.number(),
      ips: z.array(z.string()).optional(),
      clientNames: z.array(z.string()).optional(),
      actionTypes: z.array(z.string()).optional(),
      targetIds: z.array(z.string()).optional(),
      error: z.literal(true).optional(),
      userIds: z.array(z.string()).optional(),
      deviceIds: z.array(z.string()).optional(),
    })
  );
}
