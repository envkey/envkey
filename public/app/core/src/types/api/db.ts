import { Crypto } from "../crypto";
import { Auth } from "../auth";
import { Model } from "../model";
import { Blob } from "../blob";
import { Logs } from "../logs";
import * as Rbac from "../rbac";
import { PoolConnection } from "mysql2/promise";
import * as z from "zod";
import * as utils from "../utils";

export namespace Db {
  export type SqlStatement = {
    qs: string;
    qargs: any[];
  };

  export type DbKey = z.infer<typeof DbKeySchema>;
  export const DbKeySchema = z.object({
    pkey: z.string(),
    skey: z.string(),
    secondaryIndex: z.string().optional(),
    tertiaryIndex: z.string().optional(),
  });

  export type QueryParams = (
    | {
        pkey: string | string[];
        scope?: undefined;
        pkeyScope?: undefined;
      }
    | {
        scope: string | string[];
        pkey?: undefined;
        pkeyScope?: string;
      }
    | {
        pkey: string | string[];
        scope: string | string[];
        pkeyScope?: undefined;
      }
  ) & {
    limit?: number;
    offset?: number;
    deleted?: boolean | "any";
    createdBefore?: number;
    createdAfter?: number;
    deletedBefore?: number;
    deletedAfter?: number;
    deletedGraphQuery?: true;
    updatedAfter?: number;
    updatedBefore?: number;
    sortBy?:
      | "skey"
      | "createdAt"
      | "updatedAt"
      | "deletedAt"
      | "orderIndex"
      | "orderIndex,createdAt";
    sortDesc?: true;
    omitData?: boolean;
    secondaryIndex?: string | string[] | null;
    tertiaryIndex?: string | string[] | null;
  } & DbReadOpts;

  export type DbObject = z.infer<typeof DbObjectSchema>;
  export const DbObjectSchema = z
    .object({
      orderIndex: z.number().optional(),
      data: z
        .object({ data: z.string(), nonce: z.string().optional() })
        .optional(),
      excludeFromDeletedGraph: z.literal(true).optional(),
    })
    .merge(Model.TimestampsSchema)
    .merge(DbKeySchema);

  export type Scope = { pkey: string; pkeyPrefix?: true; scope?: string };

  export type ObjectTransactionItems = {
    softDeleteKeys?: DbKey[];
    hardDeleteKeys?: DbKey[];
    hardDeleteEncryptedKeyParams?: Blob.UserEncryptedKeyPkeyWithScopeParams[];
    hardDeleteEncryptedBlobParams?: Blob.EncryptedBlobPkeyWithScopeParams[];
    softDeleteScopes?: Scope[];
    hardDeleteScopes?: Scope[];
    hardDeleteSecondaryIndices?: string[];
    hardDeleteTertiaryIndices?: string[];
    hardDeleteSecondaryIndexScopes?: string[];
    hardDeleteTertiaryIndexScopes?: string[];
    puts?: DbObject[];
    updates?: [DbKey, DbObject][];
    orderUpdateScopes?: [Required<Omit<Scope, "pkeyPrefix">>, number][];
  };

  export type SqlLockType = "FOR UPDATE";

  export type DbReadOpts = {
    transactionConn: PoolConnection | undefined;
    lockType?: SqlLockType;
  };

  export type Org = z.infer<typeof OrgSchema>;
  export const OrgSchema = z
    .object({
      replicatedAt: z.number(),
      signedLicense: z.string().optional(),
      selfHostedFailoverRegion: z.string().optional(),
      generatedAnyEnvkey: z.boolean().optional(),
      startedOrgImportAt: z.number().optional(),
      finishedOrgImportAt: z.number().optional(),
    })
    .merge(Model.OrgSchema)
    .merge(DbObjectSchema);

  export type OrgUserDevice = z.infer<typeof OrgUserDeviceSchema>;
  export const OrgUserDeviceSchema = utils.intersection(
    z
      .object({
        signedTrustedRoot: Crypto.SignedDataSchema,
        trustedRootUpdatedAt: z.number(),
      })
      .merge(DbObjectSchema),
    Model.OrgUserDeviceSchema
  );

  export type DeviceGrant = z.infer<typeof DeviceGrantSchema>;
  export const DeviceGrantSchema = z
    .object({
      identityHash: z.string(),
      signedTrustedRoot: Crypto.SignedDataSchema,
      orgId: z.string(),
      encryptedPrivkey: Crypto.EncryptedDataSchema,
      deviceId: z.string(),
      externalAuthSessionId: z.string().optional(),
      externalAuthSessionVerifiedAt: z.number().optional(),
    })
    .merge(Model.DeviceGrantSchema)
    .merge(
      Model.OrgUserSchema.pick({
        provider: true,
        uid: true,
        externalAuthProviderId: true,
      })
    )
    .merge(DbObjectSchema);

  export type AuthToken = z.infer<typeof AuthTokenSchema>;
  export const AuthTokenSchema = z
    .object({
      type: z.literal("authToken"),
      token: z.string(),
      provider: Auth.AuthProviderTypeSchema,
      uid: z.string(),
      externalAuthProviderId: z.string().optional(),
      orgId: z.string(),
      deviceId: z.string(),
      userId: z.string(),
      expiresAt: z.number(),
    })
    .merge(DbObjectSchema);

  export type OrgUser = z.infer<typeof OrgUserSchema>;
  export const OrgUserSchema = z
    .object({
      deviceIds: z.array(z.string()),
    })
    .merge(Model.OrgUserSchema)
    .merge(DbObjectSchema);

  export type CliUser = z.infer<typeof CliUserSchema>;
  export const CliUserSchema = z
    .object({
      encryptedPrivkey: Crypto.EncryptedDataSchema,
      signedTrustedRoot: Crypto.SignedDataSchema,
      trustedRootUpdatedAt: z.number(),
    })
    .merge(Model.CliUserSchema)
    .merge(DbObjectSchema);

  export type RecoveryKey = z.infer<typeof RecoveryKeySchema>;
  export const RecoveryKeySchema = z
    .object({
      identityHash: z.string(),
      signedTrustedRoot: Crypto.SignedDataSchema,
      encryptedPrivkey: Crypto.EncryptedDataSchema,
      deviceId: z.string(),
      externalAuthSessionId: z.string().optional(),
      externalAuthSessionVerifiedAt: z.number().optional(),
      emailToken: z.string().optional(),
    })
    .merge(Model.RecoveryKeySchema)
    .merge(DbObjectSchema);

  export type RecoveryKeyPointer = z.infer<typeof RecoveryKeyPointerSchema>;
  export const RecoveryKeyPointerSchema = z
    .object({
      type: z.literal("recoveryKeyPointer"),
      skey: z.literal("recoveryKeyPointer"),
      recoveryKeyId: z.string(),
      orgId: z.string(),
    })
    .merge(DbObjectSchema);

  export type OrgUserIdByEmail = z.infer<typeof OrgUserIdByEmailSchema>;
  export const OrgUserIdByEmailSchema = z
    .object({
      type: z.literal("userIdByEmail"),
      email: z.string().email(),
      userId: z.string(),
      orgId: z.string(),
    })
    .merge(DbObjectSchema);

  export type OrgUserIdByProviderUid = z.infer<
    typeof OrgUserIdByProviderUidSchema
  >;
  export const OrgUserIdByProviderUidSchema = z
    .object({
      type: z.literal("userIdByProviderUid"),
      skey: z.string(),
      providerUid: z.string(),
      userId: z.string(),
      orgId: z.string(),
    })
    .merge(DbObjectSchema);

  export type HostedOauthProviderSettings = z.infer<
    typeof HostedOauthProviderSettingsSchema
  >;
  export const HostedOauthProviderSettingsSchema = z.object({
    endpoint: z.string(),
    clientId: z.string(),
    clientSecret: z.string(),
  });

  export type SamlProviderSettings = z.infer<typeof SamlProviderSettingsSchema>;
  export const SamlProviderSettingsSchema = z
    .object({
      serviceProviderRsaPrivkey: z.string(),
    })
    .merge(Model.SamlProviderSettingsSchema)
    .merge(DbObjectSchema);

  export type ExternalAuthProvider = z.infer<typeof ExternalAuthProviderSchema>;
  export const ExternalAuthProviderSchema = utils.intersection(
    Model.ExternalAuthProviderSchema,
    utils.intersection(
      DbObjectSchema,
      z.union([
        z.object({
          verifiedByExternalAuthSessionId: z.string(),
          verifiedByUserId: z.string(),
          provider: Auth.HostedOauthProviderTypeSchema,
          providerSettings: HostedOauthProviderSettingsSchema,
        }),
        z.object({
          provider: z.literal("saml"),
          samlSettingsId: z.string(),
        }),
      ])
    )
  );

  export type ExternalAuthProviderPointer = z.infer<
    typeof ExternalAuthProviderPointerSchema
  >;
  export const ExternalAuthProviderPointerSchema = z
    .object({
      type: z.literal("externalAuthProviderPointer"),
      externalAuthProviderId: z.string(),
      orgId: z.string(),
    })
    .merge(DbObjectSchema);

  export type ScimProvisioningProvider = z.infer<
    typeof ScimProvisioningProviderSchema
  >;
  export const ScimProvisioningProviderSchema = z
    .object({ authSecretHash: z.string() })
    .merge(Model.ScimProvisioningProviderSchema)
    .merge(DbObjectSchema);
  export type ScimProvisioningProviderPointer = z.infer<
    typeof ScimProvisioningProviderPointerSchema
  >;
  export const ScimProvisioningProviderPointerSchema = z
    .object({
      type: z.literal("scimProvisioningProviderPointer"),
      providerId: z.string(),
      orgId: z.string(),
    })
    .merge(DbObjectSchema);

  export type EmailVerification = z.infer<typeof EmailVerificationSchema>;
  export const EmailVerificationSchema = z
    .object({
      type: z.literal("emailVerification"),
      token: z.string(),
      email: z.string().email(),
      userId: z.string().optional(),
      verifiedAt: z.number().optional(),
      expiresAt: z.number(),
      authType: z.intersection(
        Auth.AuthTypeSchema,
        z.enum(["sign_in", "sign_up"])
      ),
    })
    .merge(DbObjectSchema);

  export type ScimUserCandidate = z.infer<typeof ScimUserCandidateSchema>;
  export const ScimUserCandidateSchema = utils.intersection(
    Model.ScimUserCandidateSchema,
    DbObjectSchema
  );

  export type ExternalAuthSession = z.infer<typeof ExternalAuthSessionSchema>;
  export const ExternalAuthSessionSchema = utils.intersection(
    z
      .object({
        type: z.literal("externalAuthSession"),
        id: z.string(),
        authType: Auth.AuthTypeSchema,
        authMethod: Auth.AuthMethodSchema,
        provider: Auth.AuthProviderTypeSchema,
        orgId: z.string().optional(),
        userId: z.string().optional(),
        domain: z.string().optional(),
        verifiedEmail: z.string().optional(),
        verifiedAt: z.number().optional(),
        suggestFirstName: z.string().optional(),
        suggestLastName: z.string().optional(),
        externalUid: z.string().optional(),
        externalAuthProviderId: z.string().optional(),
        // invite id
        authObjectId: z.string().optional(),
        accessToken: z.string().optional(),
        errorAt: z.number().optional(),
        error: z.string().optional(),
      })
      .merge(DbObjectSchema),

    z.union([
      utils.intersection(
        z.object({
          authType: z.literal("sign_up"),
        }),
        z.union([
          z.object({
            authMethod: z.literal("oauth_cloud"),
            provider: Auth.CloudOauthProviderTypeSchema,
          }),
          z.object({
            authMethod: z.literal("oauth_hosted"),
            provider: Auth.HostedOauthProviderTypeSchema,
            providerSettings: HostedOauthProviderSettingsSchema,
          }),
          z.object({
            authMethod: z.literal("saml"),
            provider: z.literal("saml"),
            authObjectId: z.string(),
          }),
        ])
      ),

      utils.intersection(
        z.object({
          authType: z.literal("invite_users"),
        }),
        z.union([
          z.object({
            authMethod: z.literal("oauth_cloud"),
          }),
          utils.intersection(
            z.object({
              authMethod: z.literal("oauth_hosted"),
              provider: Auth.HostedOauthProviderTypeSchema,
            }),
            z.union([
              z.object({
                inviteExternalAuthUsersType: z.literal("initial"),
                providerSettings: HostedOauthProviderSettingsSchema,
              }),
              z.object({
                inviteExternalAuthUsersType: z.literal("re-authenticate"),
                externalAuthProviderId: z.string(),
              }),
            ])
          ),
        ])
      ),

      utils.intersection(
        z.union([
          z.object({
            authType: z.enum([
              "accept_invite",
              "accept_device_grant",
              "redeem_recovery_key",
            ]),

            authObjectId: z.string(),
          }),
          z.object({
            authType: z.literal("sign_in"),
          }),
        ]),
        z.union([
          z.object({
            authMethod: z.enum(["oauth_hosted", "saml"]),
            externalAuthProviderId: z.string(),
          }),
          z.object({
            authMethod: z.literal("oauth_cloud"),
          }),
        ])
      ),
    ])
  );

  export type Invite = z.infer<typeof InviteSchema>;
  export const InviteSchema = z
    .object({
      identityHash: z.string(),
      signedTrustedRoot: Crypto.SignedDataSchema,
      encryptedPrivkey: Crypto.EncryptedDataSchema,
      deviceId: z.string(),
      externalAuthSessionId: z.string().optional(),
      externalAuthSessionVerifiedAt: z.number().optional(),
    })
    .merge(Model.InviteSchema)
    .merge(
      Model.OrgUserSchema.pick({
        provider: true,
        uid: true,
        externalAuthProviderId: true,
      })
    )
    .merge(DbObjectSchema);

  export type InvitePointer = z.infer<typeof InvitePointerSchema>;
  export const InvitePointerSchema = z
    .object({
      type: z.literal("invitePointer"),
      inviteId: z.string(),
      orgId: z.string(),
    })
    .merge(DbObjectSchema);

  export type DeviceGrantPointer = z.infer<typeof DeviceGrantPointerSchema>;
  export const DeviceGrantPointerSchema = z
    .object({
      type: z.literal("deviceGrantPointer"),
      deviceGrantId: z.string(),
      orgId: z.string(),
    })
    .merge(DbObjectSchema);

  export type App = z.infer<typeof AppSchema>;
  export const AppSchema = Model.AppSchema.merge(DbObjectSchema);

  export type Block = z.infer<typeof BlockSchema>;
  export const BlockSchema = Model.BlockSchema.merge(DbObjectSchema);

  export type EnvParent = App | Block;

  export type AppUserGrant = z.infer<typeof AppUserGrantSchema>;
  export const AppUserGrantSchema =
    Model.AppUserGrantSchema.merge(DbObjectSchema);

  export type AppBlock = z.infer<typeof AppBlockSchema>;
  export const AppBlockSchema = Model.AppBlockSchema.merge(DbObjectSchema);

  export type GroupMembership = z.infer<typeof GroupMembershipSchema>;
  export const GroupMembershipSchema =
    Model.GroupMembershipSchema.merge(DbObjectSchema);

  export type CliUserPointer = z.infer<typeof CliUserPointerSchema>;
  export const CliUserPointerSchema = z
    .object({
      type: z.literal("cliUserPointer"),
      skey: z.literal("cliUserPointer"),
      orgId: z.string(),
      userId: z.string(),
    })
    .merge(DbObjectSchema);

  export type Group = z.infer<typeof GroupSchema>;
  export const GroupSchema = Model.GroupSchema.merge(DbObjectSchema);
  export type AppUserGroup = z.infer<typeof AppUserGroupSchema>;
  export const AppUserGroupSchema =
    Model.AppUserGroupSchema.merge(DbObjectSchema);
  export type AppGroupUserGroup = z.infer<typeof AppGroupUserGroupSchema>;
  export const AppGroupUserGroupSchema =
    Model.AppGroupUserGroupSchema.merge(DbObjectSchema);
  export type AppGroupUser = z.infer<typeof AppGroupUserSchema>;
  export const AppGroupUserSchema =
    Model.AppGroupUserSchema.merge(DbObjectSchema);
  export type AppBlockGroup = z.infer<typeof AppBlockGroupSchema>;
  export const AppBlockGroupSchema =
    Model.AppBlockGroupSchema.merge(DbObjectSchema);
  export type AppGroupBlock = z.infer<typeof AppGroupBlockSchema>;
  export const AppGroupBlockSchema =
    Model.AppGroupBlockSchema.merge(DbObjectSchema);
  export type AppGroupBlockGroup = z.infer<typeof AppGroupBlockGroupSchema>;
  export const AppGroupBlockGroupSchema =
    Model.AppGroupBlockGroupSchema.merge(DbObjectSchema);
  export type Server = z.infer<typeof ServerSchema>;
  export const ServerSchema = Model.ServerSchema.merge(DbObjectSchema);
  export type LocalKey = z.infer<typeof LocalKeySchema>;
  export const LocalKeySchema = Model.LocalKeySchema.merge(DbObjectSchema);
  export type KeyableParent = Server | LocalKey;

  export type IncludedAppRole = z.infer<typeof IncludedAppRoleSchema>;
  export const IncludedAppRoleSchema =
    Model.IncludedAppRoleSchema.merge(DbObjectSchema);
  export type Environment = z.infer<typeof EnvironmentSchema>;

  export const EnvironmentSchema = utils.intersection(
    Model.EnvironmentSchema,
    DbObjectSchema
  );
  export type VariableGroup = z.infer<typeof VariableGroupSchema>;
  export const VariableGroupSchema =
    Model.VariableGroupSchema.merge(DbObjectSchema);

  export type GeneratedEnvkey = z.infer<typeof GeneratedEnvkeySchema>;
  export const GeneratedEnvkeySchema = z
    .object({
      encryptedPrivkey: Crypto.EncryptedDataSchema,
      envkeyIdPart: z.string(),
      signedTrustedRoot: Crypto.SignedDataSchema,
      trustedRootUpdatedAt: z.number(),
      userId: z.string().optional(),
      deviceId: z.string().optional(),
      allowedIps: z.array(z.string()).optional(),
    })
    .merge(Model.GeneratedEnvkeySchema)
    .merge(DbObjectSchema);

  export type OrgRole = z.infer<typeof OrgRoleSchema>;
  export const OrgRoleSchema = utils.intersection(
    Rbac.OrgRoleSchema,
    DbObjectSchema
  );
  export type AppRole = z.infer<typeof AppRoleSchema>;
  export const AppRoleSchema = utils.intersection(
    Rbac.AppRoleSchema,
    DbObjectSchema
  );
  export type EnvironmentRole = z.infer<typeof EnvironmentRoleSchema>;
  export const EnvironmentRoleSchema = utils.intersection(
    Rbac.EnvironmentRoleSchema,
    DbObjectSchema
  );
  export type AppRoleEnvironmentRole = z.infer<
    typeof AppRoleEnvironmentRoleSchema
  >;
  export const AppRoleEnvironmentRoleSchema = utils.intersection(
    Rbac.AppRoleEnvironmentRoleSchema,
    DbObjectSchema
  );

  export type LoggedAction = z.infer<typeof LoggedActionSchema>;
  export const LoggedActionSchema = utils.intersection(
    Logs.LoggedActionSchema,
    DbObjectSchema
  );

  export type PubkeyRevocationRequest = z.infer<
    typeof PubkeyRevocationRequestSchema
  >;
  export const PubkeyRevocationRequestSchema =
    Model.PubkeyRevocationRequestSchema.merge(DbObjectSchema).merge(
      z.object({
        excludeFromDeletedGraph: z.literal(true),
      })
    );

  export type RootPubkeyReplacement = z.infer<
    typeof RootPubkeyReplacementSchema
  >;
  export const RootPubkeyReplacementSchema = utils.intersection(
    Model.RootPubkeyReplacementSchema,
    DbObjectSchema.merge(
      z.object({
        replacingPubkeyId: z.string(),
        processedAtById: z.record(z.union([z.literal(false), z.number()])),
        excludeFromDeletedGraph: z.literal(true),
      })
    )
  );

  export type UserEncryptedKey = z.infer<typeof UserEncryptedKeySchema>;
  export const UserEncryptedKeySchema =
    Blob.UserEncryptedKeySchema.merge(DbObjectSchema);

  export type GeneratedEnvkeyEncryptedKey = z.infer<
    typeof GeneratedEnvkeyEncryptedKeySchema
  >;
  export const GeneratedEnvkeyEncryptedKeySchema =
    Blob.GeneratedEnvkeyEncryptedKeySchema.merge(DbObjectSchema);

  export type EncryptedBlob = z.infer<typeof EncryptedBlobSchema>;
  export const EncryptedBlobSchema =
    Blob.EncryptedBlobSchema.merge(DbObjectSchema);
}
