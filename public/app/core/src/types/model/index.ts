import { Crypto } from "../crypto";
import { Auth } from "../auth";
import { Trust } from "../trust";
import Client from "../client";
import { Blob } from "../blob";
import { TimestampsSchema } from "../timestamps";
import * as Billing from "../billing";
import * as z from "zod";
import * as utils from "../utils";
import * as R from "ramda";

export namespace Model {
  export const KeyableSchema = z.object({
    pubkey: Crypto.PubkeySchema,
    pubkeyId: z.string(),
    pubkeyUpdatedAt: z.number(),
  });

  export type Timestamps = z.infer<typeof TimestampsSchema>;

  export const OrgSettingsSchema = z.object({
    crypto: z.object({
      requiresPassphrase: z.boolean(),
      requiresLockout: z.boolean(),
      lockoutMs: z.number().optional(),
    }),
    auth: z.object({
      inviteExpirationMs: z.number(),
      deviceGrantExpirationMs: z.number(),
      tokenExpirationMs: z.number(),
    }),
    envs: z.object({
      autoCommitLocals: z.boolean(),
      autoCaps: z.boolean(),
    }),
  });

  export type OrgSettings = z.infer<typeof OrgSettingsSchema>;

  export const OrgSchema = z
    .object({
      type: z.literal("org"),
      id: z.string(),
      name: z.string(),
      creatorId: z.string(),
      rbacUpdatedAt: z.number().optional(),
      graphUpdatedAt: z.number(),
      settings: OrgSettingsSchema,
      billingSettings: Billing.BillingSettingsSchema.optional(),
      serverEnvkeyCount: z.number(),
      activeUserOrInviteCount: z.number().optional(), // optional for backward compatibility
      deviceLikeCount: z.number(),
      // Self-Hosted - client only

      localIpsAllowed: z.array(z.string()).optional(),
      environmentRoleIpsAllowed: z
        .record(z.array(z.string()).optional())
        .optional(),

      selfHostedVersions: z
        .object({
          api: z.string(),
          infra: z.string(),
        })
        .optional(),
      // Self-Hosted
      selfHostedUpgradeStatus: z
        .object({
          version: z.string(),
          startedAt: z.number(),
        })
        .optional(),

      "upgradedCrypto-2.1.0": z.boolean().optional(),

      reinitializedLocals: z.boolean().optional(),

      customLicense: z.boolean().optional(),

      optimizeEmptyEnvs: z.boolean().optional(),

      orgSettingsImported: z.boolean().optional(),
    })
    .merge(TimestampsSchema);

  export type Org = z.infer<typeof OrgSchema> & {
    billingId?: string;
    ssoEnabled?: boolean;
    teamsEnabled?: boolean;
  };

  export const OrgStatsSchema = z.object({
    apiCallsThisHour: z.number(),
    apiCallsThisMonth: z.number(),
    dataTransferBytesThisHour: z.number(),
    dataTransferBytesThisDay: z.number(),
    dataTransferBytesThisMonth: z.number(),
    blobStorageBytes: z.number(),
    activeSocketConnections: z.number().optional(),
  });

  export type OrgStats = z.infer<typeof OrgStatsSchema>;

  export const OrgUserDeviceSchema = utils.intersection(
    z
      .object({
        type: z.literal("orgUserDevice"),
        id: z.string(),
        name: z.string(),
        userId: z.string(),
        isRoot: z.literal(true).optional(),
        revokedRootAt: z.number().optional(),
        approvedAt: z.number().optional(),
        deactivatedAt: z.number().optional(),
      })
      .merge(KeyableSchema)
      .merge(TimestampsSchema),
    z.union([
      z.object({
        approvedByType: z.literal("creator"),
      }),
      z.object({
        approvedByType: z.literal("invite"),
        inviteId: z.string(),
      }),
      z.object({
        approvedByType: z.literal("deviceGrant"),
        deviceGrantId: z.string(),
      }),
      z.object({
        approvedByType: z.literal("recoveryKey"),
        recoveryKeyId: z.string(),
      }),
    ])
  );
  export type OrgUserDevice = z.infer<typeof OrgUserDeviceSchema>;

  export type DeviceGrant = z.infer<typeof DeviceGrantSchema>;
  export const DeviceGrantSchema = z
    .object({
      type: z.literal("deviceGrant"),
      id: z.string(),
      deviceId: z.string(),
      granteeId: z.string(),
      grantedByUserId: z.string(),
      grantedByDeviceId: z.string().optional(),
      signedById: z.string(),
      acceptedAt: z.number().optional(),
      expiresAt: z.number(),
    })
    .merge(KeyableSchema)
    .merge(TimestampsSchema);

  export type OrgUser = z.infer<typeof OrgUserSchema>;
  export const OrgUserSchema = z
    .object({
      type: z.literal("orgUser"),
      id: z.string(),
      uid: z.string(),
      email: z.string().email(),
      provider: Auth.AuthProviderTypeSchema,
      externalAuthProviderId: z.string().optional(),
      firstName: z.string(),
      lastName: z.string(),
      invitedById: z.string().optional(),
      isCreator: z.boolean(),
      inviteAcceptedAt: z.number().optional(),
      orgRoleId: z.string(),
      // Means they are marked for deletion
      deactivatedAt: z.number().optional(),
      orgRoleUpdatedAt: z.number(),
      scim: z
        .object({ providerId: z.string(), candidateId: z.string() })
        .optional(),

      importId: z.string().optional(),
    })
    .merge(TimestampsSchema);

  // available to be invited, and are not in the graph
  export type ScimUserCandidate = z.infer<typeof ScimUserCandidateSchema>;
  export const ScimUserCandidateSchema = z
    .object({
      type: z.literal("scimUserCandidate"),
      id: z.string(),
      orgId: z.string(),
      providerId: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      email: z.string().email(),
      scimUserName: z.string(),
      scimDisplayName: z.string().optional(),
      scimExternalId: z.string(),
      active: z.boolean(),
      orgUserId: z.string().optional(),
    })
    .merge(TimestampsSchema);

  export type CliUser = z.infer<typeof CliUserSchema>;
  export const CliUserSchema = z
    .object({
      type: z.literal("cliUser"),
      id: z.string(),
      orgRoleId: z.string(),
      name: z.string(),
      creatorId: z.string(),
      creatorDeviceId: z.string(),
      isRoot: z.literal(true).optional(),
      revokedRootAt: z.number().optional(),
      signedById: z.string(),
      deactivatedAt: z.number().optional(),
      orgRoleUpdatedAt: z.number(),
      importId: z.string().optional(),
    })
    .merge(KeyableSchema)
    .merge(TimestampsSchema);

  export type SamlIdpSettings = z.infer<typeof SamlIdpSettingsSchema>;

  export const SamlIdpKnownServiceSchema = z.enum(
    Object.keys(Auth.SAML_KNOWN_IDENTITY_PROVIDERS) as [
      Auth.SamlKnownIDP,
      ...Auth.SamlKnownIDP[]
    ]
  );

  export const SamlIdpSettingsSchema = z.object({
    // Other party is the Identity Provider
    identityProviderEntityId: z.string().optional(),
    identityProviderLoginUrl: z.string().optional(),
    identityProviderX509Certs: z.array(z.string()).optional(),
    identityProviderX509CertsSha1: z.array(z.string()).optional(),
    identityProviderX509CertsSha256: z.array(z.string()).optional(),
    identityProviderKnownService: SamlIdpKnownServiceSchema,
  });
  export type SamlProviderEditableSettings = z.infer<
    typeof SamlProviderEditableSettingsSchema
  >;

  export type SamlMinimalIdpSettings = {
    identityProviderEntityId: string;
    identityProviderLoginUrl: string;
    identityProviderX509Certs: string[];
  };

  export const SamlProviderEditableSettingsSchema = z.object({
    serviceProviderNameIdFormat: z.enum([
      // Object.values won't work for some reason
      Auth.SAML_NAME_ID_FORMATS.persistent,
      Auth.SAML_NAME_ID_FORMATS.email,
    ]),
    // the value is the mapping string that comes from the saml assert response
    serviceProviderAttributeMappings: z.object({
      ...R.mapObjIndexed(
        (v) => z.union([z.literal(v as string), z.string()]),
        Auth.SAML_ATTRIBUTE_DEFAULT_MAPPINGS
      ),
    }),
  });
  // All saml config settings. EnvKey is the Service Provider (SP).
  export type SamlProviderSettings = z.infer<typeof SamlProviderSettingsSchema>;
  export const SamlProviderSettingsSchema = z
    .object({
      id: z.string(),
      type: z.literal("samlProviderSettings"),
      orgId: z.string(),
      externalAuthProviderId: z.string(),
      serviceProviderEntityId: z.string(),
      serviceProviderAcsUrl: z.string(),
      serviceProviderX509Cert: z.string(),
      serviceProviderX509CertSha1: z.string(),
      serviceProviderX509CertSha256: z.string(),
    })
    .merge(SamlProviderEditableSettingsSchema)
    .merge(SamlIdpSettingsSchema)
    .merge(TimestampsSchema);

  export type ExternalAuthProvider = z.infer<typeof ExternalAuthProviderSchema>;
  export const ExternalAuthProviderSchema = utils.intersection(
    z
      .object({
        type: z.literal("externalAuthProvider"),
        id: z.string(),
        orgId: z.string(),
        nickname: z.string().optional(),
        authMethod: Auth.ExternalAuthMethodSchema,
      })
      .merge(TimestampsSchema),
    z.union([
      z.object({
        provider: Auth.HostedOauthProviderTypeSchema,
      }),
      z.object({
        provider: z.literal("saml"),
        samlSettingsId: z.string(),
      }),
    ])
  );

  export type ScimProvisioningProvider = z.infer<
    typeof ScimProvisioningProviderSchema
  >;
  export const ScimProvisioningProviderSchema = z
    .object({
      type: z.literal("scimProvisioningProvider"),
      id: z.string(),
      orgId: z.string(),
      nickname: z.string().optional(),
      authScheme: Auth.ProvisioningProviderAuthSchemeTypeSchema,
      endpointBaseUrl: z.string(),
    })
    .merge(TimestampsSchema);

  export type Invite = z.infer<typeof InviteSchema>;
  export const InviteSchema = z
    .object({
      type: z.literal("invite"),
      id: z.string(),
      inviteeId: z.string(),
      invitedByUserId: z.string(),
      invitedByDeviceId: z.string().optional(),
      signedById: z.string(),
      acceptedAt: z.number().optional(),
      expiresAt: z.number(),
    })
    .merge(KeyableSchema)
    .merge(TimestampsSchema);

  export type ExternalAuthUser = z.infer<typeof ExternalAuthUserSchema>;
  export const ExternalAuthUserSchema = z.object({
    uid: z.string(),
    email: z.string().email().optional(),
    username: z.string().optional(),
    firstName: z.string(),
    lastName: z.string(),
  });

  export type EnvParentSettings = z.infer<typeof EnvParentSettingsSchema>;
  export const EnvParentSettingsSchema = z.object({
    autoCaps: z.boolean().optional(),
    autoCommitLocals: z.boolean().optional(),
  });

  export type EnvParentFields = z.infer<typeof EnvParentFieldsSchema>;
  export const EnvParentFieldsSchema = z
    .object({
      id: z.string(),
      name: z.string(),
      envsUpdatedAt: z.number().optional(),
      localsUpdatedAtByUserId: z.record(z.number()),
      localsUpdatedAt: z.number().optional(),
      localsEncryptedBy: z.record(z.string()),
      localsReencryptionRequiredAt: z.record(z.number()),
      envsOrLocalsUpdatedAt: z.number().optional(),
      localsRequireReinit: z.boolean().optional(),
      importId: z.string().optional(),
    })
    .merge(TimestampsSchema);

  export type AppSettings = EnvParentSettings;
  export const AppSettingsSchema = EnvParentSettingsSchema;

  export type App = z.infer<typeof AppSchema>;
  export const AppSchema = z
    .object({
      type: z.literal("app"),
      settings: AppSettingsSchema,
      environmentRoleIpsMergeStrategies: z
        .record(z.enum(["extend", "override"]).optional())
        .optional(),
      environmentRoleIpsAllowed: z
        .record(z.array(z.string()).optional())
        .optional(),
    })
    .merge(EnvParentFieldsSchema);

  export type BlockSettings = EnvParentSettings;
  export const BlockSettingsSchema = EnvParentSettingsSchema;

  export type Block = z.infer<typeof BlockSchema>;
  export const BlockSchema = z
    .object({
      type: z.literal("block"),
      settings: BlockSettingsSchema,
    })
    .merge(EnvParentFieldsSchema);

  export type EnvParent = z.infer<typeof EnvParentSchema>;
  export const EnvParentSchema = z.union([AppSchema, BlockSchema]);

  export type AppUserGrant = z.infer<typeof AppUserGrantSchema>;
  export const AppUserGrantSchema = z
    .object({
      type: z.literal("appUserGrant"),
      id: z.string(),
      userId: z.string(),
      appId: z.string(),
      appRoleId: z.string(),
      importId: z.string().optional(),
    })
    .merge(TimestampsSchema);

  const KeyableParentFieldsSchema = z
    .object({
      name: z.string(),
      id: z.string(),
      appId: z.string(),
      environmentId: z.string(),
    })
    .merge(TimestampsSchema);

  export type Server = z.infer<typeof ServerSchema>;
  export const ServerSchema = z
    .object({
      type: z.literal("server"),
      importId: z.string().optional(),
    })
    .merge(KeyableParentFieldsSchema);

  export type LocalKey = z.infer<typeof LocalKeySchema>;
  export const LocalKeySchema = z
    .object({
      type: z.literal("localKey"),
      userId: z.string(),
      deviceId: z.string(),
      autoGenerated: z.literal(true).optional(),
    })
    .merge(KeyableParentFieldsSchema);

  export type KeyableParent = z.infer<typeof KeyableParentSchema>;
  export const KeyableParentSchema = z.union([ServerSchema, LocalKeySchema]);

  export type AppBlock = z.infer<typeof AppBlockSchema>;
  export const AppBlockSchema = z
    .object({
      type: z.literal("appBlock"),
      id: z.string(),
      appId: z.string(),
      blockId: z.string(),
      orderIndex: z.number(),
      importId: z.string().optional(),
    })
    .merge(TimestampsSchema);

  export type Environment = z.infer<typeof EnvironmentSchema>;

  export type EnvironmentSettings = z.infer<typeof EnvironmentSettingsSchema>;

  export const EnvironmentBaseSchema = z
    .object({
      type: z.literal("environment"),
      id: z.string(),
      envParentId: z.string(),
      environmentRoleId: z.string(),
      envUpdatedAt: z.number().optional(),
      encryptedById: z.string().optional(),
      reencryptionRequiredAt: z.number().optional(),
      "upgradedCrypto-2.1.0": z.boolean().optional(),
      requiresReinit: z.boolean().optional(),
      importId: z.string().optional(),
    })
    .merge(TimestampsSchema);

  export const EnvironmentSettingsSchema = z.object({
    autoCommit: z.boolean().optional(),
  });

  export const EnvironmentSchema = utils.intersection(
    EnvironmentBaseSchema,
    z.union([
      z.object({
        isSub: z.literal(false),
        settings: EnvironmentSettingsSchema,
      }),
      z.object({
        isSub: z.literal(true),
        parentEnvironmentId: z.string(),
        subName: z.string(),
      }),
    ])
  );

  export type RecoveryKey = z.infer<typeof RecoveryKeySchema>;
  export const RecoveryKeySchema = z
    .object({
      type: z.literal("recoveryKey"),
      id: z.string(),
      userId: z.string(),
      creatorDeviceId: z.string(),
      signedById: z.string(),
      redeemedAt: z.number().optional(),
    })
    .merge(KeyableSchema)
    .merge(TimestampsSchema);

  export type VariableGroup = z.infer<typeof VariableGroupSchema>;
  export const VariableGroupSchema = z
    .object({
      type: z.literal("variableGroup"),
      id: z.string(),
      envParentId: z.string(),
      name: z.string(),
      subEnvironmentId: z.string(),
    })
    .merge(TimestampsSchema);

  export type IncludedAppRole = z.infer<typeof IncludedAppRoleSchema>;
  export const IncludedAppRoleSchema = z
    .object({
      type: z.literal("includedAppRole"),
      id: z.string(),
      appId: z.string(),
      appRoleId: z.string(),
    })
    .merge(TimestampsSchema);

  export type Group = z.infer<typeof GroupSchema>;
  export const GroupSchema = z
    .object({
      type: z.literal("group"),
      objectType: z.enum(["orgUser", "app", "block"]),
      id: z.string(),
      name: z.string(),
      membershipsUpdatedAt: z.number().optional(),
      importId: z.string().optional(),
    })
    .merge(TimestampsSchema);

  export type GroupMembership = z.infer<typeof GroupMembershipSchema>;
  export const GroupMembershipSchema = z
    .object({
      type: z.literal("groupMembership"),
      id: z.string(),
      groupId: z.string(),
      objectId: z.string(),
      orderIndex: z.number().optional(),
      importId: z.string().optional(),
    })
    .merge(TimestampsSchema);

  export type AppUserGroup = z.infer<typeof AppUserGroupSchema>;
  export const AppUserGroupSchema = z
    .object({
      type: z.literal("appUserGroup"),
      id: z.string(),
      appId: z.string(),
      userGroupId: z.string(),
      appRoleId: z.string(),
      importId: z.string().optional(),
    })
    .merge(TimestampsSchema);

  export type AppGroupUserGroup = z.infer<typeof AppGroupUserGroupSchema>;
  export const AppGroupUserGroupSchema = z
    .object({
      type: z.literal("appGroupUserGroup"),
      id: z.string(),
      appGroupId: z.string(),
      userGroupId: z.string(),
      appRoleId: z.string(),
    })
    .merge(TimestampsSchema);

  export type AppGroupUser = z.infer<typeof AppGroupUserSchema>;
  export const AppGroupUserSchema = z
    .object({
      type: z.literal("appGroupUser"),
      id: z.string(),
      appGroupId: z.string(),
      userId: z.string(),
      appRoleId: z.string(),
    })
    .merge(TimestampsSchema);

  export type AppBlockGroup = z.infer<typeof AppBlockGroupSchema>;
  export const AppBlockGroupSchema = z
    .object({
      type: z.literal("appBlockGroup"),
      id: z.string(),
      blockGroupId: z.string(),
      appId: z.string(),
      orderIndex: z.number(),
    })
    .merge(TimestampsSchema);

  export type AppGroupBlock = z.infer<typeof AppGroupBlockSchema>;
  export const AppGroupBlockSchema = z
    .object({
      type: z.literal("appGroupBlock"),
      id: z.string(),
      appGroupId: z.string(),
      blockId: z.string(),
      orderIndex: z.number(),
    })
    .merge(TimestampsSchema);

  export type AppGroupBlockGroup = z.infer<typeof AppGroupBlockGroupSchema>;
  export const AppGroupBlockGroupSchema = z
    .object({
      type: z.literal("appGroupBlockGroup"),
      id: z.string(),
      appGroupId: z.string(),
      blockGroupId: z.string(),
      orderIndex: z.number(),
    })
    .merge(TimestampsSchema);

  export type GeneratedEnvkey = z.infer<typeof GeneratedEnvkeySchema>;
  export const GeneratedEnvkeySchema = z
    .object({
      type: z.literal("generatedEnvkey"),
      id: z.string(),
      appId: z.string(),
      environmentId: z.string(),
      keyableParentId: z.string(),
      keyableParentType: z.enum(["server", "localKey"]),
      envkeyShort: z.string(),
      envkeyIdPartHash: z.string(),
      creatorId: z.string(),
      creatorDeviceId: z.string().optional(),
      signedById: z.string(),
      blobsUpdatedAt: z.number(),
    })
    .merge(KeyableSchema)
    .merge(TimestampsSchema);

  export type AccessParams = z.infer<typeof AccessParamsSchema>;
  export const AccessParamsSchema = z.object({
    orgRoleId: z.string(),
    appUserGrants: z
      .array(AppUserGrantSchema.pick({ appId: true, appRoleId: true }))
      .optional(),
    userGroupIds: z.array(z.string()).optional(),
  });

  export const GeneratedEnvkeyFieldsSchema = <T extends z.ZodObject<any>>(
    zodSchema: T
  ) =>
    z.object({
      env: zodSchema.optional(),
      inheritanceOverrides: z.record(zodSchema).optional(),
      localOverrides: zodSchema.optional(),
      subEnv: zodSchema.optional(),
    });

  export type GeneratedEnvkeyFields<T = Blob.GeneratedEnvkeyEncryptedKey> = {
    env?: T;
    inheritanceOverrides?: {
      [environmentId: string]: T;
    };
    localOverrides?: T;
    subEnv?: T;
  };

  export type PubkeyRevocationRequest = z.infer<
    typeof PubkeyRevocationRequestSchema
  >;
  export const PubkeyRevocationRequestSchema = z
    .object({
      type: z.literal("pubkeyRevocationRequest"),
      id: z.string(),
      targetId: z.string(),
      creatorId: z.string(),
    })
    .merge(TimestampsSchema);

  export type RootPubkeyReplacement = z.infer<
    typeof RootPubkeyReplacementSchema
  >;
  export const RootPubkeyReplacementSchema = z
    .object({
      type: z.literal("rootPubkeyReplacement"),
      id: z.string(),
      requestId: z.string(),
      creatorId: z.string(),
      replacingPubkey: Crypto.PubkeySchema,
      signedReplacingTrustChain: Trust.SignedTrustChainSchema,
    })
    .merge(TimestampsSchema);

  export type GroupAssoc =
    | AppUserGroup
    | AppGroupUserGroup
    | AppGroupUser
    | AppBlockGroup
    | AppGroupBlock
    | AppGroupBlockGroup;

  export type EnvkeyObject =
    | Client.Graph.UserGraphObject
    | ExternalAuthProvider;

  export type InviteStatus =
    | "creator"
    | "accepted"
    | "pending"
    | "expired"
    | "failed";
}
