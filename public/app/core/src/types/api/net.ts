import { Crypto } from "../crypto";
import { Model } from "../model";
import { Blob } from "../blob";
import * as Rbac from "../rbac";
import { Auth } from "../auth";
import { Logs } from "../logs";
import Client from "../client";
import { Fetch } from "../fetch";
import { Trust } from "../trust";
import ActionType from "./action_type";
import Api from ".";
import { Db } from "./db";
import { Patch } from "rfc6902";
import * as z from "zod";
import * as utils from "../utils";

export namespace Net {
  export type OkResult = { type: "success" };

  export type ValidationErrorResult = {
    type: "validationError";
    error: true;
    errorStatus: 422;
    errors: {
      [attr: string]: string[];
    };
  };

  export type ErrorResult =
    | {
        type: "error";
        error: true;
        errorStatus: number;
        errorReason?: string;
      }
    | ValidationErrorResult
    | RequiresEmailAuthResult
    | RequiresExternalAuthResult
    | SignInWrongProviderErrorResult;

  export type SignedUserTrustedPubkeys = string;

  export type TokenSessionResult = {
    type: "tokenSession";
    orgId: string;
    userId: string;
    deviceId: string;
    graph: Client.Graph.UserGraph;
    graphUpdatedAt: number;
    timestamp: number;
    signedTrustedRoot: Crypto.SignedData;
  } & Pick<Db.AuthToken, "token"> &
    Pick<Db.OrgUser, "provider" | "uid" | "email" | "firstName" | "lastName"> &
    (
      | {
          hostType: "cloud";
          deploymentTag?: undefined;
        }
      | {
          hostType: "self-hosted";
          deploymentTag: string;
        }
    );

  export type SessionResult = TokenSessionResult;

  export type AuthenticateCliKeyResult = {
    type: "authenticateCliKeyResult";
    orgId: string;
    userId: string;
    graph: Client.Graph.UserGraph;
    graphUpdatedAt: number;
    timestamp: number;
    signedTrustedRoot: Crypto.SignedData;
  } & Pick<Db.CliUser, "name" | "encryptedPrivkey"> &
    (
      | {
          hostType: "cloud";
          deploymentTag?: undefined;
        }
      | {
          hostType: "self-hosted";
          deploymentTag: string;
        }
    );

  export type RegisterResult = Omit<TokenSessionResult, "signedTrustedRoot"> & {
    orgId: string;
  } & (
      | {
          hostType: "cloud";
          deploymentTag?: undefined;
        }
      | {
          hostType: "self-hosted";
          deploymentTag: string;
        }
    );

  export type AcceptInviteResult = RegisterResult;

  export type AcceptDeviceGrantResult = RegisterResult;

  export type RedeemRecoveryKeyResult = RegisterResult;

  export type SignInWrongProviderErrorResult = {
    type: "signInWrongProviderError";
    error: true;
    errorReason: string;
    providers: {
      provider: Db.OrgUser["provider"];
      externalAuthProviderId: string;
    }[];
  };

  export type ExistingAuthUser = {
    id: string;
    provider: Db.OrgUser["provider"];
    externalAuthProviderId?: string;
    org: Pick<Db.Org, "id" | "name">;
  };

  export type CreateExternalAuthSession = z.infer<
    typeof CreateExternalAuthSessionSchema
  >;
  const CreateExternalAuthSessionSchema = utils.intersection(
    z.object({
      authType: z.enum([
        Auth.AuthTypeSchema.Values.accept_device_grant,
        Auth.AuthTypeSchema.Values.accept_invite,
        Auth.AuthTypeSchema.Values.redeem_recovery_key,
        Auth.AuthTypeSchema.Values.sign_in,
        Auth.AuthTypeSchema.Values.sign_up,
      ]),
      authMethod: Auth.ExternalAuthMethodSchema,
      provider: Auth.ExternalAuthProviderTypeSchema,
      orgId: z.string(),
    }),
    z.union([
      utils.intersection(
        z.object({ authType: z.literal(Auth.AuthTypeSchema.Values.sign_up) }),
        z.union([
          z.object({
            authMethod: z.literal(
              Auth.ExternalAuthMethodSchema.Values.oauth_hosted
            ),
            provider: Auth.HostedOauthProviderTypeSchema,
            providerSettings: Db.HostedOauthProviderSettingsSchema,
          }),
          z.object({
            authMethod: z.literal("oauth_cloud"),
            provider: Auth.CloudOauthProviderTypeSchema,
          }),
        ])
      ),
      utils.intersection(
        z.union([
          z.object({
            authType: z.enum([
              Auth.AuthTypeSchema.Values.accept_invite,
              Auth.AuthTypeSchema.Values.accept_device_grant,
              Auth.AuthTypeSchema.Values.redeem_recovery_key,
            ]),
            // authObjectId can be an invitation ID
            authObjectId: z.string(),
          }),
          z.object({
            authType: z.literal(Auth.AuthTypeSchema.Values.sign_in),
            userId: z.string(),
            externalAuthProviderId: z.string(),
          }),
        ]),
        z.union([
          z.object({
            authMethod: z.enum([
              Auth.ExternalAuthMethodSchema.Values.oauth_hosted,
              Auth.ExternalAuthMethodSchema.Values.saml,
            ]),
            externalAuthProviderId: z.string(),
          }),
          z.object({
            authMethod: z.literal(
              Auth.ExternalAuthMethodSchema.Values.oauth_cloud
            ),
          }),
          z.object({
            authMethod: z.literal("saml"),
            provider: z.literal("saml"),
            externalAuthProviderId: z.string(),
          }),
        ])
      ),
    ])
  );

  export type CreateExternalAuthInviteSession = z.infer<
    typeof CreateExternalAuthInviteSessionSchema
  >;
  const CreateExternalAuthInviteSessionSchema = utils.intersection(
    z.object({
      authType: z.enum([
        Auth.AuthTypeSchema.Values.accept_device_grant,
        Auth.AuthTypeSchema.Values.accept_invite,
        Auth.AuthTypeSchema.Values.redeem_recovery_key,
        Auth.AuthTypeSchema.Values.sign_in,
        Auth.AuthTypeSchema.Values.sign_up,
      ]),
      inviteExternalAuthUsersType: z.enum(["initial", "re-authenticate"]),
      provider: Auth.ExternalAuthProviderTypeSchema,
    }),
    z.union([
      utils.intersection(
        z.object({
          authMethod: z.literal(
            Auth.ExternalAuthMethodSchema.Values.oauth_hosted
          ),
          provider: Auth.HostedOauthProviderTypeSchema,
        }),
        z.union([
          z.object({
            inviteExternalAuthUsersType: z.literal("initial"),
            providerSettings: Db.HostedOauthProviderSettingsSchema,
          }),
          z.object({
            inviteExternalAuthUsersType: z.literal("re-authenticate"),
            externalAuthProviderId: z.string(),
          }),
        ])
      ),

      z.object({
        authMethod: z.literal(Auth.ExternalAuthMethodSchema.Values.oauth_cloud),
      }),
    ])
  );

  export type OauthCallbackQueryParams = z.infer<
    typeof OauthCallbackQuerySchema
  >;
  export const OauthCallbackQuerySchema = z.object({
    state: z.string(),
    code: z.string(),
    error: z.string().optional(),
    error_description: z.string().optional(),
  });

  export type OauthCallback = z.infer<typeof OauthCallbackSchema>;
  export const OauthCallbackSchema = z
    .object({
      provider: Auth.OauthProviderTypeSchema,
    })
    .merge(OauthCallbackQuerySchema);

  export type SamlAcsCallbackBody = z.infer<typeof SamlAcsCallbackBodyParams>;
  export const SamlAcsCallbackBodyParams = z.object({
    externalAuthProviderId: z.string(),
    samlResponse: z.string(),
    relayState: z.string(),
  });

  export type DeviceParams = z.infer<typeof DeviceParamsSchema>;
  export const DeviceParamsSchema = z.object({
    signedTrustedRoot: Crypto.SignedDataSchema,
    name: z.string(),
    pubkey: Crypto.PubkeySchema,
  });

  export type IdParams = z.infer<typeof IdParamsSchema>;
  export const IdParamsSchema = z.object({
    id: z.string(),
  });

  export type RequiresEmailAuthResult = {
    type: "requiresEmailAuthError";
    email: string;
    error: true;
    errorStatus: 422;
    errorReason: "Email auth required";
  };

  export type RequiresExternalAuthResult = {
    type: "requiresExternalAuthError";
    error: true;
    errorStatus: 422;
    errorReason: "External auth required";
    orgId: string;
    id: string;
  } & Pick<Db.OrgUser, "provider" | "externalAuthProviderId" | "uid">;

  export type NotModifiedResult = {
    type: "notModified";
    status: 304;
  };

  export type UserEnvUpdate = z.infer<typeof UserEnvUpdateSchema>;
  export const UserEnvUpdateSchema = z.object({
    env: Crypto.EncryptedDataSchema.optional(),
    meta: Crypto.EncryptedDataSchema.optional(),
    inherits: Crypto.EncryptedDataSchema.optional(),
    inheritanceOverrides: z.record(Crypto.EncryptedDataSchema).optional(),
    changesets: Crypto.EncryptedDataSchema.optional(),
    changesetsById: z
      .record(
        z.object({
          data: Crypto.EncryptedDataSchema,
          createdAt: z.number().optional(),
          createdById: z.string().optional(),
        })
      )
      .optional(),
  });

  export type LocalsUpdate = z.infer<typeof LocalsUpdateSchema>;
  export const LocalsUpdateSchema = z.object({
    env: Crypto.EncryptedDataSchema.optional(),
    meta: Crypto.EncryptedDataSchema.optional(),
    changesets: Crypto.EncryptedDataSchema.optional(),
    changesetsById: z
      .record(
        z.object({
          data: Crypto.EncryptedDataSchema,
          createdAt: z.number().optional(),
          createdById: z.string().optional(),
        })
      )
      .optional(),
  });

  export type EnvParentsEnvUpdate = z.infer<typeof EnvParentsEnvUpdateSchema>;
  export const EnvParentsEnvUpdateSchema = z.record(
    z.object({
      environments: z.record(UserEnvUpdateSchema).optional(),
      locals: z.record(LocalsUpdateSchema).optional(),
    })
  );

  export type GeneratedEnvkeyEncryptedKeyParams = z.infer<
    typeof GeneratedEnvkeyEncryptedKeyParamsSchema
  >;
  export const GeneratedEnvkeyEncryptedKeyParamsSchema =
    Model.GeneratedEnvkeyFieldsSchema(
      Blob.GeneratedEnvkeyEncryptedKeySchema.pick({
        data: true,
      })
    );

  export type EnvParams = z.infer<typeof EnvParamsSchema>;
  export const EnvParamsSchema = z.object({
    keys: z.object({
      users: z.record(z.record(EnvParentsEnvUpdateSchema)).optional(),
      keyableParents: z
        .record(z.record(GeneratedEnvkeyEncryptedKeyParamsSchema))
        .optional(),
      blockKeyableParents: z
        .record(z.record(z.record(GeneratedEnvkeyEncryptedKeyParamsSchema)))
        .optional(),
      newDevice: EnvParentsEnvUpdateSchema.optional(),
    }),

    blobs: EnvParentsEnvUpdateSchema,

    encryptedByTrustChain: Crypto.SignedDataSchema.optional(),
  });

  export type FetchEnvsParams = z.infer<typeof FetchEnvsParamsSchema>;
  export const FetchChangesetOptionsSchema = z.object({
    createdAfter: z.number().optional(),
  });
  export type FetchChangesetOptions = z.infer<
    typeof FetchChangesetOptionsSchema
  >;

  const FetchEnvsParamsSchema = z.object({
    byEnvParentId: z.record(
      z.object({
        envs: z.literal(true).optional(),
        changesets: z.literal(true).optional(),
        changesetOptions: FetchChangesetOptionsSchema.optional(),
      })
    ),
  });

  type EnvsResult = {
    envs: {
      keys: Blob.UserEncryptedKeysByEnvironmentIdOrComposite;
      blobs: Blob.UserEncryptedBlobsByComposite;
    };
  };

  export type EnvsAndOrChangesetsResult = EnvsResult & {
    changesets: {
      keys: Blob.UserEncryptedChangesetKeysByEnvironmentId;
      blobs: Blob.UserEncryptedBlobsByEnvironmentId;
    };
  };

  export type GraphDiffsResult = {
    type: "graphDiffs";
    diffs: Patch;
    graphUpdatedAt: number;
    timestamp: number;
  };

  export type GraphResult = {
    type: "graph";
    graph: Client.Graph.UserGraph;
    graphUpdatedAt: number;
    timestamp: number;
    signedTrustedRoot?: Crypto.SignedData;
  };

  export type GraphWithEnvsAndOrChangesetsResult = EnvsAndOrChangesetsResult & {
    graph: Client.Graph.UserGraph;
    graphUpdatedAt: number;
    timestamp: number;
    signedTrustedRoot?: Crypto.SignedData;
  };

  export type FetchEnvsResult = EnvsAndOrChangesetsResult & {
    type: "envsAndOrChangesets";
    timestamp: number;
  };

  export type LoadedInvite = Omit<
    GraphWithEnvsAndOrChangesetsResult,
    "type"
  > & {
    type: "loadedInvite";
    orgId: string;
    invite: Pick<
      Api.Db.Invite,
      | "id"
      | "encryptedPrivkey"
      | "pubkey"
      | "invitedByDeviceId"
      | "invitedByUserId"
      | "inviteeId"
      | "deviceId"
    >;
  };

  export type LoadedDeviceGrant = Omit<
    GraphWithEnvsAndOrChangesetsResult,
    "type"
  > & {
    type: "loadedDeviceGrant";
    orgId: string;
    deviceGrant: Pick<
      Api.Db.DeviceGrant,
      | "id"
      | "encryptedPrivkey"
      | "pubkey"
      | "grantedByDeviceId"
      | "grantedByUserId"
      | "granteeId"
      | "deviceId"
    >;
  };

  export type LoadedRecoveryKey = Omit<
    GraphWithEnvsAndOrChangesetsResult,
    "type"
  > & {
    type: "loadedRecoveryKey";
    orgId: string;
    recoveryKey: Pick<
      Api.Db.RecoveryKey,
      "encryptedPrivkey" | "pubkey" | "userId" | "deviceId" | "creatorDeviceId"
    >;
  };

  export const OrderIndexByIdSchema = z.record(z.number());
  export type OrderIndexById = z.infer<typeof OrderIndexByIdSchema>;

  const registerSchema = utils.intersection(
    z.object({
      user: Model.OrgUserSchema.pick({
        email: true,
        firstName: true,
        lastName: true,
      }),
      device: DeviceParamsSchema,
      org: Model.OrgSchema.pick({
        name: true,
        settings: true,
      }),
    }),
    z.union([
      utils.intersection(
        z.object({
          hostType: z.literal("cloud"),
        }),
        z.union([
          z.object({
            provider: z.literal("email"),
            emailVerificationToken: z.string(),
          }),
          z.object({
            provider: Auth.ExternalAuthProviderTypeSchema,
            externalAuthSessionId: z.string(),
          }),
        ])
      ),

      z.object({
        hostType: z.literal("self-hosted"),
        provider: z.literal("email"),
        emailVerificationToken: z.string().optional(), // for local self-hosted (development only)
        domain: z.string(),
        selfHostedFailoverRegion: z.string().optional(),
      }),

      z.object({
        hostType: z.literal("community"),
        provider: z.literal("email"),
        emailVerificationToken: z.string(),
        communityAuth: z.string(),
      }),
    ])
  );

  export const SCHEMA_URN_ERROR = "urn:ietf:params:scim:api:messages:2.0:Error";
  export const SCHEMA_URN_USER = "urn:ietf:params:scim:schemas:core:2.0:User";
  export const SCHEMA_URN_LIST =
    "urn:ietf:params:scim:api:messages:2.0:ListResponse";

  export interface ScimError {
    schemas: string[]; // schema of the error, kinda silly but that's the spec
    status: number;
    detail: string;
    scimType?:
      | "invalidFilter"
      | "tooMany"
      | "uniqueness"
      | "mutability"
      | "invalidSyntax"
      | "invalidPath"
      | "noTarget"
      | "invalidVers"
      | "sensitive";
  }

  export interface ScimEmail {
    value: string;
    type?: "work" | "home" | "primary" | "other" | string;
    primary?: boolean;
  }

  export interface ScimUser {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"];
    id: string;
    externalId: string;
    userName: string;
    displayName?: string;
    name: {
      formatted?: string;
      familyName: string;
      givenName: string;
    };
    active: boolean;
    emails: ScimEmail[];
  }
  export interface ScimUserResponse extends ScimUser {
    // custom prop
    type: "scimUserResponse";
    // required for user-only schema in rfc 7644
    meta: {
      resourceType: "User";
      created: string;
      lastModified: string;
      location: string;
      // custom prop
      orgId: string;
      // custom prop
      orgUserId?: string;
    };
  }
  export interface ScimListResponse<T> {
    schemas: string[];
    totalResults: number;
    Resources: T[];
    startIndex: number;
    itemsPerPage: number;
  }

  export type ScimCreateUser = z.infer<typeof ScimCreateUserSchema>;
  export const ScimCreateUserSchema = z.object({
    externalId: z.string().optional(),
    userName: z.string().optional(),
    active: z.boolean().optional(),
    emails: z
      .array(
        z
          .object({
            primary: z.boolean().optional(),
            type: z.string().optional(),
            value: z.string().email(),
          })
          // display, other props
          .nonstrict()
      )
      .optional(),
    displayName: z.string().optional(),
    name: z
      .object({
        formatted: z.string().optional(),
        familyName: z.string().optional(),
        givenName: z.string().optional(),
      })
      .nonstrict()
      .optional(),
  });

  export type ScimPatchUser = z.infer<typeof ScimPatchUserSchema>;
  export const ScimPatchUserSchema = z.array(
    z.union([
      z
        .object({
          op: z.enum(["Replace", "replace"]),
          path: z.literal("active"),
          value: z.union([z.string(), z.boolean()]),
        })
        .nonstrict(),
      z
        .object({
          op: z.enum(["Replace", "replace"]),
          path: z.literal("userName"),
          value: z.string(),
        })
        .nonstrict(),
      z
        .object({
          op: z.enum(["Add", "Replace", "add", "replace"]),
          path: z.enum(["name.familyName", "name.givenName"]),
          value: z.string(),
        })
        .nonstrict(),
      z
        .object({
          op: z.enum(["Add", "Replace", "add", "replace"]),
          // email
          path: z.string(),
          value: z.string(),
        })
        .nonstrict(),
    ])
  );

  export const ApiParamSchemas = {
    [ActionType.REGISTER]: registerSchema,

    [ActionType.INIT_SELF_HOSTED]: z.object({
      registerAction: z.object({
        type: z.literal(ActionType.REGISTER),
        payload: registerSchema,
        meta: z.object({
          loggableType: z.literal("authAction"),
          loggableType2: z.literal("orgAction"),
          client: Client.ClientParamsSchema,
        }),
      }),
      initInstructions: z
        .union([
          z.object({
            type: z.literal("dnsCnames"),
            records: z.array(
              z.object({
                fqdn: z.string(),
                cname: z.string(),
              })
            ),
          }),
          z.object({
            type: z.literal("dnsVerifyInternalService"),
            serviceName: z.string(),
            record: z.object({
              fqdn: z.string(),
              txt: z.string(),
            }),
          }),
          z.object({
            type: z.literal("internalServiceName"),
            serviceName: z.string(),
          }),
        ])
        .optional(),
    }),
    [ActionType.UPGRADE_SELF_HOSTED]: z.object({
      apiVersionNumber: z.string(),
      infraVersionNumber: z.string().optional(),
      usingUpdaterVersion: z.string().optional(),
    }),
    [ActionType.UPGRADE_SELF_HOSTED_FORCE_CLEAR]: z.object({}),

    [ActionType.CREATE_SESSION]: utils.intersection(
      z.object({
        orgId: z.string(),
        userId: z.string(),
        deviceId: z.string(),
        signature: z.string(),
      }),
      z.union([
        z.object({
          provider: z.literal("email"),
          emailVerificationToken: z.string(),
        }),
        z.object({
          provider: Auth.ExternalAuthProviderTypeSchema,
          externalAuthSessionId: z.string(),
        }),
      ])
    ),

    [ActionType.CLEAR_TOKEN]: z.object({}),
    [ActionType.FORGET_DEVICE]: z.object({}),
    [ActionType.CLEAR_USER_TOKENS]: z.object({
      userId: z.string(),
    }),
    [ActionType.CLEAR_ORG_TOKENS]: z.object({}),

    [ActionType.GET_SESSION]: z.object({
      graphUpdatedAt: z.number().optional(),
    }),

    [ActionType.FETCH_ORG_STATS]: z.object({}),

    [ActionType.RENAME_ORG]: z.object({ name: z.string() }),

    [ActionType.RENAME_USER]: z
      .object({ firstName: z.string(), lastName: z.string() })
      .merge(IdParamsSchema),

    [ActionType.DELETE_ORG]: z.object({}),
    [ActionType.CREATE_EXTERNAL_AUTH_SESSION]: CreateExternalAuthSessionSchema,
    [ActionType.CREATE_EXTERNAL_AUTH_INVITE_SESSION]:
      CreateExternalAuthInviteSessionSchema,
    [ActionType.GET_EXTERNAL_AUTH_SESSION]: z.object({
      id: z.string(),
    }),
    [ActionType.GET_EXTERNAL_AUTH_PROVIDERS]: z.object({
      provider: Auth.ExternalAuthProviderTypeSchema,
    }),
    [ActionType.DELETE_EXTERNAL_AUTH_PROVIDER]: IdParamsSchema,
    [ActionType.GET_EXTERNAL_AUTH_USERS]: z.object({
      provider: Auth.OauthProviderTypeSchema,
      query: z.string().optional(),
      externalAuthOrgId: z.string().optional(),
    }),
    [ActionType.GET_EXTERNAL_AUTH_ORGS]: z.object({
      provider: Auth.OauthProviderTypeSchema,
    }),
    [ActionType.CREATE_SCIM_PROVISIONING_PROVIDER]:
      Model.ScimProvisioningProviderSchema.pick({
        nickname: true,
        authScheme: true,
      }).merge(
        z.object({
          secret: z.string(),
        })
      ),
    [ActionType.UPDATE_SCIM_PROVISIONING_PROVIDER]:
      Model.ScimProvisioningProviderSchema.pick({
        id: true,
        nickname: true,
        authScheme: true,
      }).merge(
        z.object({
          secret: z.string().optional(),
        })
      ),
    [ActionType.DELETE_SCIM_PROVISIONING_PROVIDER]: IdParamsSchema,
    [ActionType.LIST_INVITABLE_SCIM_USERS]: z.object({
      id: z.string(),
      all: z.boolean().optional(),
    }),

    [ActionType.CHECK_SCIM_PROVIDER]: IdParamsSchema,

    // SCIM Request JSON. All may include additional ignored properties from
    // the SCIM spec, so be sure to add `.nonstrict()`
    [ActionType.CREATE_SCIM_USER]: ScimCreateUserSchema.nonstrict(),
    [ActionType.DELETE_SCIM_USER]: z.object({
      id: z.string(),
      providerId: z.string(),
    }),
    [ActionType.GET_SCIM_USER]: z.object({
      id: z.string(),
      providerId: z.string(),
    }),
    [ActionType.LIST_SCIM_USERS]: z
      .object({
        providerId: z.string(),
        filter: z.string().optional(),
        // startIndex is a 1-based index
        startIndex: z.number().int().min(1).optional(),
        count: z.number().int().min(1).optional(),
        sortBy: z.string().optional(),
        sortOrder: z.string().optional(),
        // ignored query features
        attributes: z.string().optional(),
        excludedAttributes: z.string().optional(),
      })
      .nonstrict(),
    [ActionType.UPDATE_SCIM_USER]: z
      .object({
        id: z.string(),
        providerId: z.string(),
        operations: ScimPatchUserSchema.optional(),
        Operations: ScimPatchUserSchema.optional(),
      })
      .merge(ScimCreateUserSchema)
      .nonstrict(),

    [ActionType.CREATE_EMAIL_VERIFICATION]: z
      .object({
        confirmEmailProvider: z.boolean().optional(),
        communityAuth: z.string().optional(),
      })
      .merge(Db.EmailVerificationSchema.pick({ authType: true, email: true })),
    [ActionType.CHECK_EMAIL_TOKEN_VALID]: Db.EmailVerificationSchema.pick({
      email: true,
      token: true,
    }),
    [ActionType.CREATE_INVITE]: z
      .object({
        signedTrustedRoot: Crypto.SignedDataSchema,
        user: Model.OrgUserSchema.pick({
          email: true,
          firstName: true,
          lastName: true,
          provider: true,
          uid: true,
          externalAuthProviderId: true,
          orgRoleId: true,
        }),
        appUserGrants: z
          .array(
            Model.AppUserGrantSchema.pick({
              appId: true,
              appRoleId: true,
            })
          )
          .optional(),
        userGroupIds: z.array(z.string()).optional(),
        scim: z
          .object({ providerId: z.string(), candidateId: z.string() })
          .optional(),
      })
      .merge(
        Db.InviteSchema.pick({
          identityHash: true,
          pubkey: true,
          encryptedPrivkey: true,
        })
      )
      .merge(EnvParamsSchema),
    [ActionType.LOAD_INVITE]: z.object({}),
    [ActionType.REVOKE_INVITE]: IdParamsSchema,
    [ActionType.ACCEPT_INVITE]: z
      .object({
        device: DeviceParamsSchema,
      })
      .merge(EnvParamsSchema),
    [ActionType.OAUTH_CALLBACK]: OauthCallbackSchema,
    [ActionType.SAML_ACS_CALLBACK]: SamlAcsCallbackBodyParams,
    [ActionType.CREATE_DEVICE_GRANT]: z
      .object({
        signedTrustedRoot: Crypto.SignedDataSchema,
      })
      .merge(
        Db.DeviceGrantSchema.pick({
          identityHash: true,
          pubkey: true,
          encryptedPrivkey: true,
          granteeId: true,
        })
      )
      .merge(EnvParamsSchema),
    [ActionType.LOAD_DEVICE_GRANT]: z.object({}),
    [ActionType.REVOKE_DEVICE_GRANT]: IdParamsSchema,
    [ActionType.ACCEPT_DEVICE_GRANT]: z
      .object({
        device: DeviceParamsSchema,
      })
      .merge(EnvParamsSchema),
    [ActionType.REVOKE_DEVICE]: IdParamsSchema,

    [ActionType.UPDATE_ORG_SETTINGS]: Model.OrgSettingsSchema,

    [ActionType.CREATE_ORG_SAML_PROVIDER]: z.object({
      nickname: z.string(),
      identityProviderKnownService: Model.SamlIdpKnownServiceSchema.optional(),
    }),
    [ActionType.UPDATE_ORG_SAML_SETTINGS]: z.object({
      id: z.string(),
      nickname: z.string().optional(),
      samlSettings: Model.SamlIdpSettingsSchema.merge(
        Model.SamlProviderEditableSettingsSchema
      )
        .partial()
        .optional(),
    }),

    [ActionType.UPDATE_USER_ROLE]: z
      .object({
        id: z.string(),
        orgRoleId: z.string(),
      })
      .merge(EnvParamsSchema),
    [ActionType.REMOVE_FROM_ORG]: IdParamsSchema,
    [ActionType.CREATE_CLI_USER]: z
      .object({
        cliKeyIdPart: z.string(),
        signedTrustedRoot: Crypto.SignedDataSchema,
        appUserGrants: z
          .array(
            Model.AppUserGrantSchema.pick({
              appId: true,
              appRoleId: true,
            })
          )
          .optional(),
      })
      .merge(
        Db.CliUserSchema.pick({
          name: true,
          pubkey: true,
          encryptedPrivkey: true,
          orgRoleId: true,
        })
      )
      .merge(EnvParamsSchema),
    [ActionType.RENAME_CLI_USER]: z
      .object({ name: z.string() })
      .merge(IdParamsSchema),
    [ActionType.DELETE_CLI_USER]: IdParamsSchema,
    [ActionType.AUTHENTICATE_CLI_KEY]: z.object({
      cliKeyIdPart: z.string(),
    }),
    [ActionType.CREATE_RECOVERY_KEY]: z
      .object({
        signedTrustedRoot: Crypto.SignedDataSchema,
      })
      .merge(
        z.object({
          recoveryKey: Db.RecoveryKeySchema.pick({
            identityHash: true,
            pubkey: true,
            encryptedPrivkey: true,
          }),
        })
      )
      .merge(EnvParamsSchema),
    [ActionType.LOAD_RECOVERY_KEY]: z.object({
      emailToken: z.string().optional(),
    }),
    [ActionType.REDEEM_RECOVERY_KEY]: z
      .object({
        device: DeviceParamsSchema,
        emailToken: z.string().optional(),
      })
      .merge(EnvParamsSchema),
    [ActionType.UPDATE_TRUSTED_ROOT_PUBKEY]: z.object({
      signedTrustedRoot: Crypto.SignedDataSchema,
      replacementIds: z.array(z.string()),
    }),
    [ActionType.ENVKEY_FETCH_UPDATE_TRUSTED_ROOT_PUBKEY]: z.object({
      signedTrustedRoot: Crypto.SignedDataSchema,
      replacementIds: z.array(z.string()),
      envkeyIdPart: z.string(),
      orgId: z.string(),
      signature: z.string(),
    }),
    [ActionType.CREATE_APP]: Model.AppSchema.pick({
      name: true,
      settings: true,
    }),
    [ActionType.RENAME_APP]: z
      .object({ name: z.string() })
      .merge(IdParamsSchema),
    [ActionType.UPDATE_APP_SETTINGS]: z
      .object({
        settings: Model.AppSettingsSchema,
      })
      .merge(IdParamsSchema),
    [ActionType.DELETE_APP]: IdParamsSchema.merge(EnvParamsSchema.partial()),
    [ActionType.GRANT_APP_ACCESS]: Model.AppUserGrantSchema.pick({
      userId: true,
      appId: true,
      appRoleId: true,
    }).merge(EnvParamsSchema),

    [ActionType.REMOVE_APP_ACCESS]: IdParamsSchema.merge(
      EnvParamsSchema.partial()
    ),

    [ActionType.CREATE_BLOCK]: Model.BlockSchema.pick({
      name: true,
      settings: true,
    }),

    [ActionType.RENAME_BLOCK]: z
      .object({ name: z.string() })
      .merge(IdParamsSchema),

    [ActionType.UPDATE_BLOCK_SETTINGS]: z
      .object({
        settings: Model.BlockSettingsSchema,
      })
      .merge(IdParamsSchema),

    [ActionType.DELETE_BLOCK]: IdParamsSchema,
    [ActionType.CONNECT_BLOCK]: Model.AppBlockSchema.pick({
      appId: true,
      blockId: true,
      orderIndex: true,
    }).merge(EnvParamsSchema),

    [ActionType.DISCONNECT_BLOCK]: IdParamsSchema.merge(
      EnvParamsSchema.partial()
    ),
    [ActionType.UPDATE_ENVS]: EnvParamsSchema.merge(
      z.object({
        upgradeCrypto: z.boolean().optional(),
        localsReinit: z.boolean().optional(),
      })
    ),
    [ActionType.FETCH_ENVS]: FetchEnvsParamsSchema,
    [ActionType.CREATE_VARIABLE_GROUP]: Model.VariableGroupSchema.pick({
      envParentId: true,
      subEnvironmentId: true,
      name: true,
    }),
    [ActionType.DELETE_VARIABLE_GROUP]: IdParamsSchema,
    [ActionType.CREATE_SERVER]: Model.ServerSchema.pick({
      appId: true,
      name: true,
      environmentId: true,
    }),
    [ActionType.DELETE_SERVER]: IdParamsSchema,
    [ActionType.CREATE_LOCAL_KEY]: Model.LocalKeySchema.pick({
      appId: true,
      name: true,
      environmentId: true,
      autoGenerated: true,
    }),
    [ActionType.DELETE_LOCAL_KEY]: IdParamsSchema,
    [ActionType.GENERATE_KEY]: z
      .object({
        envkeyIdPart: z.string(),
        signedTrustedRoot: Crypto.SignedDataSchema,
      })
      .merge(
        Db.GeneratedEnvkeySchema.pick({
          appId: true,
          keyableParentType: true,
          keyableParentId: true,
          pubkey: true,
          encryptedPrivkey: true,
        })
      )
      .merge(EnvParamsSchema),
    [ActionType.REVOKE_KEY]: IdParamsSchema,
    [ActionType.FETCH_LOGS]: Logs.FetchLogParamsSchema,
    [ActionType.RBAC_CREATE_ORG_ROLE]: utils.intersection(
      Rbac.RoleBaseSchema.pick({ name: true, description: true })
        .merge(Rbac.OrgRoleBaseSchema.omit({ type: true }))
        .merge(
          z.object({
            canBeManagedByOrgRoleIds: z.array(z.string()),
            canBeInvitedByOrgRoleIds: z.array(z.string()),
          })
        ),
      utils.intersection(
        Rbac.WithPermissions(Rbac.OrgPermissionSchema),
        utils.intersection(
          Rbac.OrgRoleCanManageSchema,
          Rbac.OrgRoleCanInviteSchema
        )
      )
    ),
    [ActionType.RBAC_DELETE_ORG_ROLE]: IdParamsSchema,
    [ActionType.RBAC_UPDATE_ORG_ROLE]: utils.intersection(
      IdParamsSchema.merge(
        Rbac.RoleBaseSchema.pick({
          name: true,
          description: true,
        }).partial()
      )
        .merge(
          z
            .object({
              canBeManagedByOrgRoleIds: z.array(z.string()),
              canBeInvitedByOrgRoleIds: z.array(z.string()),
            })
            .partial()
        )
        .merge(
          Rbac.OrgRoleBaseSchema.pick({
            autoAppRoleId: true,
          }).partial()
        )
        .merge(EnvParamsSchema.partial()),
      utils.intersection(
        Rbac.WithOptionalPermissions(Rbac.OrgPermissionSchema),
        utils.intersection(
          Rbac.OrgRoleOptionalCanManageSchema,
          Rbac.OrgRoleOptionalCanInviteSchema
        )
      )
    ),

    [ActionType.CREATE_ENVIRONMENT]: utils.intersection(
      Model.EnvironmentBaseSchema.pick({
        envParentId: true,
        environmentRoleId: true,
      }).merge(EnvParamsSchema.partial()),
      z.union([
        z.object({
          isSub: z.undefined(),
          parentEnvironmentId: z.undefined(),
          subName: z.undefined(),
        }),
        z.object({
          isSub: z.literal(true),
          parentEnvironmentId: z.string(),
          subName: z.string(),
        }),
      ])
    ),
    [ActionType.DELETE_ENVIRONMENT]: IdParamsSchema.merge(
      EnvParamsSchema.partial()
    ),

    [ActionType.UPDATE_ENVIRONMENT_SETTINGS]: IdParamsSchema.merge(
      z.object({
        settings: Model.EnvironmentSettingsSchema,
      })
    ),

    [ActionType.RBAC_CREATE_ENVIRONMENT_ROLE]: Rbac.RoleBaseSchema.pick({
      name: true,
      description: true,
    })
      .merge(
        Rbac.EnvironmentRoleBaseSchema.omit({ type: true, orderIndex: true })
      )
      .merge(
        z.object({
          appRoleEnvironmentRoles: Rbac.EnvironmentPermissionsSchema,
        })
      ),

    [ActionType.RBAC_DELETE_ENVIRONMENT_ROLE]: IdParamsSchema,

    [ActionType.RBAC_UPDATE_ENVIRONMENT_ROLE]: IdParamsSchema.merge(
      Rbac.RoleBaseSchema.pick({
        name: true,
        description: true,
      }).partial()
    )
      .merge(
        z
          .object({
            appRoleEnvironmentRoles: Rbac.EnvironmentPermissionsSchema,
          })
          .partial()
      )
      .merge(Rbac.EnvironmentRoleBaseSchema.omit({ type: true }).partial())
      .merge(EnvParamsSchema.partial()),

    [ActionType.RBAC_UPDATE_ENVIRONMENT_ROLE_SETTINGS]: IdParamsSchema.merge(
      z.object({
        settings: Rbac.EnvironmentRoleSettingsSchema,
      })
    ),

    [ActionType.RBAC_REORDER_ENVIRONMENT_ROLES]: OrderIndexByIdSchema,

    [ActionType.RBAC_CREATE_APP_ROLE]: utils.intersection(
      Rbac.RoleBaseSchema.pick({
        name: true,
        description: true,
      })
        .merge(Rbac.AppRoleBaseSchema.omit({ type: true }))
        .merge(
          z.object({
            canBeManagedByAppRoleIds: z.array(z.string()),
            canBeInvitedByAppRoleIds: z.array(z.string()),
            appRoleEnvironmentRoles: Rbac.EnvironmentPermissionsSchema,
          })
        ),
      Rbac.WithPermissions(Rbac.AppPermissionSchema)
    ),
    [ActionType.RBAC_DELETE_APP_ROLE]: IdParamsSchema,

    [ActionType.RBAC_UPDATE_APP_ROLE]: utils.intersection(
      IdParamsSchema.merge(
        Rbac.RoleBaseSchema.pick({
          name: true,
          description: true,
        }).partial()
      )
        .merge(
          Rbac.AppRoleBaseSchema.pick({
            defaultAllApps: true,
            canManageAppRoleIds: true,
            canInviteAppRoleIds: true,
            hasFullEnvironmentPermissions: true,
          }).partial()
        )
        .merge(
          z
            .object({
              canBeManagedByAppRoleIds: z.array(z.string()),
              canBeInvitedByAppRoleIds: z.array(z.string()),
              appRoleEnvironmentRoles: Rbac.EnvironmentPermissionsSchema,
            })
            .partial()
        )
        .merge(EnvParamsSchema.partial()),
      Rbac.WithOptionalPermissions(Rbac.AppPermissionSchema)
    ),

    [ActionType.RBAC_CREATE_INCLUDED_APP_ROLE]:
      Model.IncludedAppRoleSchema.pick({
        appId: true,
        appRoleId: true,
      }).merge(EnvParamsSchema.partial()),
    [ActionType.DELETE_INCLUDED_APP_ROLE]: IdParamsSchema.merge(
      EnvParamsSchema.partial()
    ),

    [ActionType.CREATE_GROUP]: Model.GroupSchema.pick({
      name: true,
      objectType: true,
    }),
    [ActionType.RENAME_GROUP]: Model.GroupSchema.pick({
      name: true,
    }).merge(IdParamsSchema),
    [ActionType.DELETE_GROUP]: IdParamsSchema.merge(EnvParamsSchema.partial()),

    [ActionType.CREATE_GROUP_MEMBERSHIP]: z
      .object({
        orderIndex: z.number().optional(),
      })
      .merge(
        Model.GroupMembershipSchema.pick({
          groupId: true,
          objectId: true,
        })
      )
      .merge(EnvParamsSchema.partial()),

    [ActionType.DELETE_GROUP_MEMBERSHIP]: IdParamsSchema.merge(
      EnvParamsSchema.partial()
    ),

    [ActionType.CREATE_APP_USER_GROUP]: Model.AppUserGroupSchema.pick({
      appId: true,
      userGroupId: true,
      appRoleId: true,
    }).merge(EnvParamsSchema),

    [ActionType.DELETE_APP_USER_GROUP]: IdParamsSchema.merge(
      EnvParamsSchema.partial()
    ),

    [ActionType.CREATE_APP_GROUP_USER_GROUP]:
      Model.AppGroupUserGroupSchema.pick({
        appGroupId: true,
        userGroupId: true,
        appRoleId: true,
      }).merge(EnvParamsSchema),
    [ActionType.DELETE_APP_GROUP_USER_GROUP]: IdParamsSchema.merge(
      EnvParamsSchema.partial()
    ),
    [ActionType.CREATE_APP_GROUP_USER]: Model.AppGroupUserSchema.pick({
      appGroupId: true,
      userId: true,
      appRoleId: true,
    }).merge(EnvParamsSchema),
    [ActionType.DELETE_APP_GROUP_USER]: IdParamsSchema.merge(
      EnvParamsSchema.partial()
    ),
    [ActionType.CREATE_APP_BLOCK_GROUP]: Model.AppBlockGroupSchema.pick({
      appId: true,
      blockGroupId: true,
      orderIndex: true,
    }).merge(EnvParamsSchema),
    [ActionType.DELETE_APP_BLOCK_GROUP]: IdParamsSchema.merge(
      EnvParamsSchema.partial()
    ),
    [ActionType.CREATE_APP_GROUP_BLOCK]: Model.AppGroupBlockSchema.pick({
      appGroupId: true,
      blockId: true,
      orderIndex: true,
    }).merge(EnvParamsSchema),
    [ActionType.DELETE_APP_GROUP_BLOCK]: IdParamsSchema.merge(
      EnvParamsSchema.partial()
    ),
    [ActionType.CREATE_APP_GROUP_BLOCK_GROUP]:
      Model.AppGroupBlockGroupSchema.pick({
        appGroupId: true,
        blockGroupId: true,
        orderIndex: true,
      }).merge(EnvParamsSchema),
    [ActionType.DELETE_APP_GROUP_BLOCK_GROUP]: IdParamsSchema.merge(
      EnvParamsSchema.partial()
    ),
    [ActionType.REORDER_BLOCKS]: z.object({
      appId: z.string(),
      order: OrderIndexByIdSchema,
    }),
    [ActionType.REORDER_GROUP_MEMBERSHIPS]: z.object({
      blockGroupId: z.string(),
      order: OrderIndexByIdSchema,
    }),
    [ActionType.REORDER_APP_BLOCK_GROUPS]: z.object({
      appId: z.string(),
      order: OrderIndexByIdSchema,
    }),
    [ActionType.REORDER_APP_GROUP_BLOCKS]: z.object({
      appGroupId: z.string(),
      order: OrderIndexByIdSchema,
    }),
    [ActionType.REORDER_APP_GROUP_BLOCK_GROUPS]: z.object({
      appGroupId: z.string(),
      order: OrderIndexByIdSchema,
    }),

    [ActionType.REVOKE_TRUSTED_PUBKEYS]: z.object({
      byRequestId: z.record(z.string()),
      signedPubkeys: z.record(Crypto.PubkeySchema),
      replacingRootTrustChain: Trust.SignedTrustChainSchema.optional(),
      signedTrustedRoot: Trust.SignedTrustChainSchema.optional(),
    }),

    [ActionType.FETCH_ENVKEY]: z.object({
      envkeyIdPart: z.string(),
    }),

    [ActionType.CHECK_ENVKEY]: z.object({
      envkeyIdPart: z.string(),
    }),

    [ActionType.FETCH_DELETED_GRAPH]: z.object({
      startsAt: z.number().optional(),
      endsAt: z.number().optional(),
    }),

    [ActionType.UPDATE_LICENSE]: z.object({
      signedLicense: z.string(),
    }),

    [ActionType.REENCRYPT_ENVS]: EnvParamsSchema,

    [ActionType.SELF_HOSTED_RESYNC_FAILOVER]: z.object({}),

    [ActionType.SET_ORG_ALLOWED_IPS]: Model.OrgSchema.pick({
      localIpsAllowed: true,
      environmentRoleIpsAllowed: true,
    }),

    [ActionType.SET_APP_ALLOWED_IPS]: Model.AppSchema.pick({
      environmentRoleIpsMergeStrategies: true,
      environmentRoleIpsAllowed: true,
    }).merge(IdParamsSchema),

    [ActionType.UNSUBSCRIBE_CLOUD_LIFECYCLE_EMAILS]: z.object({
      orgId: z.string(),
      orgUserId: z.string(),
      unsubscribeToken: z.string(),
    }),

    [ActionType.STARTED_ORG_IMPORT]: z.object({}),
    [ActionType.FINISHED_ORG_IMPORT]: z.object({}),

    // BULK_GRAPH_ACTION schema isn't used anywhere as bulk actions are validated individually,
    // but it makes this object exhaustive so the compiler's happy
    [ActionType.BULK_GRAPH_ACTION]: z.any(),
  };

  export const getSchema = (t: ActionType) =>
    ApiParamSchemas[t] as z.ZodTypeAny | undefined;

  export type ApiParamTypes = {
    Register: z.infer<typeof ApiParamSchemas[ActionType.REGISTER]>;
    InitSelfHosted: z.infer<
      typeof ApiParamSchemas[ActionType.INIT_SELF_HOSTED]
    >;
    UpgradeSelfHosted: z.infer<
      typeof ApiParamSchemas[ActionType.UPGRADE_SELF_HOSTED]
    >;
    UpgradeSelfHostedForceClear: z.infer<
      typeof ApiParamSchemas[ActionType.UPGRADE_SELF_HOSTED_FORCE_CLEAR]
    >;
    CreateSession: z.infer<typeof ApiParamSchemas[ActionType.CREATE_SESSION]>;
    GetSession: z.infer<typeof ApiParamSchemas[ActionType.GET_SESSION]>;
    ClearToken: z.infer<typeof ApiParamSchemas[ActionType.CLEAR_TOKEN]>;
    ForgetDevice: z.infer<typeof ApiParamSchemas[ActionType.FORGET_DEVICE]>;
    ClearUserTokens: z.infer<
      typeof ApiParamSchemas[ActionType.CLEAR_USER_TOKENS]
    >;
    ClearOrgTokens: z.infer<
      typeof ApiParamSchemas[ActionType.CLEAR_ORG_TOKENS]
    >;
    DeleteOrg: z.infer<typeof ApiParamSchemas[ActionType.DELETE_ORG]>;
    RenameOrg: z.infer<typeof ApiParamSchemas[ActionType.RENAME_ORG]>;
    RenameUser: z.infer<typeof ApiParamSchemas[ActionType.RENAME_USER]>;
    CreateExternalAuthSession: z.infer<
      typeof ApiParamSchemas[ActionType.CREATE_EXTERNAL_AUTH_SESSION]
    >;
    CreateExternalAuthInviteSession: z.infer<
      typeof ApiParamSchemas[ActionType.CREATE_EXTERNAL_AUTH_INVITE_SESSION]
    >;
    GetExternalAuthSession: z.infer<
      typeof ApiParamSchemas[ActionType.GET_EXTERNAL_AUTH_SESSION]
    >;
    GetExternalAuthProviders: z.infer<
      typeof ApiParamSchemas[ActionType.GET_EXTERNAL_AUTH_PROVIDERS]
    >;
    DeleteExternalAuthProvider: z.infer<
      typeof ApiParamSchemas[ActionType.DELETE_EXTERNAL_AUTH_PROVIDER]
    >;
    OauthCallback: z.infer<typeof ApiParamSchemas[ActionType.OAUTH_CALLBACK]>;
    SamlAcsCallback: z.infer<
      typeof ApiParamSchemas[ActionType.SAML_ACS_CALLBACK]
    >;
    GetExternalAuthUsers: z.infer<
      typeof ApiParamSchemas[ActionType.GET_EXTERNAL_AUTH_USERS]
    >;
    GetExternalAuthOrgs: z.infer<
      typeof ApiParamSchemas[ActionType.GET_EXTERNAL_AUTH_ORGS]
    >;
    CreateEmailVerification: z.infer<
      typeof ApiParamSchemas[ActionType.CREATE_EMAIL_VERIFICATION]
    >;
    CheckEmailTokenValid: z.infer<
      typeof ApiParamSchemas[ActionType.CHECK_EMAIL_TOKEN_VALID]
    >;
    CreateInvite: z.infer<typeof ApiParamSchemas[ActionType.CREATE_INVITE]>;
    LoadInvite: z.infer<typeof ApiParamSchemas[ActionType.LOAD_INVITE]>;
    RevokeInvite: z.infer<typeof ApiParamSchemas[ActionType.REVOKE_INVITE]>;
    AcceptInvite: z.infer<typeof ApiParamSchemas[ActionType.ACCEPT_INVITE]>;
    CreateRecoveryKey: z.infer<
      typeof ApiParamSchemas[ActionType.CREATE_RECOVERY_KEY]
    >;
    LoadRecoveryKey: z.infer<
      typeof ApiParamSchemas[ActionType.LOAD_RECOVERY_KEY]
    >;
    RedeemRecoveryKey: z.infer<
      typeof ApiParamSchemas[ActionType.REDEEM_RECOVERY_KEY]
    >;
    UpdateTrustedRootPubkey: z.infer<
      typeof ApiParamSchemas[ActionType.UPDATE_TRUSTED_ROOT_PUBKEY]
    >;
    EnvkeyFetchUpdateTrustedRootPubkey: z.infer<
      typeof ApiParamSchemas[ActionType.ENVKEY_FETCH_UPDATE_TRUSTED_ROOT_PUBKEY]
    >;
    LoadDeviceGrant: z.infer<
      typeof ApiParamSchemas[ActionType.LOAD_DEVICE_GRANT]
    >;
    AcceptDeviceGrant: z.infer<
      typeof ApiParamSchemas[ActionType.ACCEPT_DEVICE_GRANT]
    >;
    FetchEnvs: z.infer<typeof ApiParamSchemas[ActionType.FETCH_ENVS]>;
    FetchLogs: z.infer<typeof ApiParamSchemas[ActionType.FETCH_LOGS]>;
    FetchDeletedGraph: z.infer<
      typeof ApiParamSchemas[ActionType.FETCH_DELETED_GRAPH]
    >;
    CreateDeviceGrant: z.infer<
      typeof ApiParamSchemas[ActionType.CREATE_DEVICE_GRANT]
    >;
    RevokeDeviceGrant: z.infer<
      typeof ApiParamSchemas[ActionType.REVOKE_DEVICE_GRANT]
    >;
    RevokeDevice: z.infer<typeof ApiParamSchemas[ActionType.REVOKE_DEVICE]>;
    UpdateOrgSettings: z.infer<
      typeof ApiParamSchemas[ActionType.UPDATE_ORG_SETTINGS]
    >;

    CreateOrgSamlProvider: z.infer<
      typeof ApiParamSchemas[ActionType.CREATE_ORG_SAML_PROVIDER]
    >;
    UpdateOrgSamlSettings: z.infer<
      typeof ApiParamSchemas[ActionType.UPDATE_ORG_SAML_SETTINGS]
    >;

    CreateScimProvisioningProvider: z.infer<
      typeof ApiParamSchemas[ActionType.CREATE_SCIM_PROVISIONING_PROVIDER]
    >;
    UpdateScimProvisioningProvider: z.infer<
      typeof ApiParamSchemas[ActionType.UPDATE_SCIM_PROVISIONING_PROVIDER]
    >;
    DeleteScimProvisioningProvider: z.infer<
      typeof ApiParamSchemas[ActionType.DELETE_SCIM_PROVISIONING_PROVIDER]
    >;
    ListInvitableScimUsers: z.infer<
      typeof ApiParamSchemas[ActionType.LIST_INVITABLE_SCIM_USERS]
    >;
    CheckScimProvider: z.infer<
      typeof ApiParamSchemas[ActionType.CHECK_SCIM_PROVIDER]
    >;
    CreateScimUser: z.infer<
      typeof ApiParamSchemas[ActionType.CREATE_SCIM_USER]
    >;
    GetScimUser: z.infer<typeof ApiParamSchemas[ActionType.GET_SCIM_USER]>;
    ListScimUsers: z.infer<typeof ApiParamSchemas[ActionType.LIST_SCIM_USERS]>;
    DeleteScimUser: z.infer<
      typeof ApiParamSchemas[ActionType.DELETE_SCIM_USER]
    >;
    UpdateScimUser: z.infer<
      typeof ApiParamSchemas[ActionType.UPDATE_SCIM_USER]
    >;

    UpdateUserRole: z.infer<
      typeof ApiParamSchemas[ActionType.UPDATE_USER_ROLE]
    >;
    RemoveFromOrg: z.infer<typeof ApiParamSchemas[ActionType.REMOVE_FROM_ORG]>;
    CreateCliUser: z.infer<typeof ApiParamSchemas[ActionType.CREATE_CLI_USER]>;
    RenameCliUser: z.infer<typeof ApiParamSchemas[ActionType.RENAME_CLI_USER]>;
    DeleteCliUser: z.infer<typeof ApiParamSchemas[ActionType.DELETE_CLI_USER]>;
    AuthenticateCliKey: z.infer<
      typeof ApiParamSchemas[ActionType.AUTHENTICATE_CLI_KEY]
    >;
    CreateApp: z.infer<typeof ApiParamSchemas[ActionType.CREATE_APP]>;
    RenameApp: z.infer<typeof ApiParamSchemas[ActionType.RENAME_APP]>;
    UpdateAppSettings: z.infer<
      typeof ApiParamSchemas[ActionType.UPDATE_APP_SETTINGS]
    >;
    DeleteApp: z.infer<typeof ApiParamSchemas[ActionType.DELETE_APP]>;
    GrantAppAccess: z.infer<
      typeof ApiParamSchemas[ActionType.GRANT_APP_ACCESS]
    >;
    RemoveAppAccess: z.infer<
      typeof ApiParamSchemas[ActionType.REMOVE_APP_ACCESS]
    >;
    CreateBlock: z.infer<typeof ApiParamSchemas[ActionType.CREATE_BLOCK]>;
    RenameBlock: z.infer<typeof ApiParamSchemas[ActionType.RENAME_BLOCK]>;
    UpdateBlockSettings: z.infer<
      typeof ApiParamSchemas[ActionType.UPDATE_BLOCK_SETTINGS]
    >;
    DeleteBlock: z.infer<typeof ApiParamSchemas[ActionType.DELETE_BLOCK]>;
    ConnectBlock: z.infer<typeof ApiParamSchemas[ActionType.CONNECT_BLOCK]>;
    DisconnectBlock: z.infer<
      typeof ApiParamSchemas[ActionType.DISCONNECT_BLOCK]
    >;
    UpdateEnvs: z.infer<typeof ApiParamSchemas[ActionType.UPDATE_ENVS]>;
    CreateVariableGroup: z.infer<
      typeof ApiParamSchemas[ActionType.CREATE_VARIABLE_GROUP]
    >;
    DeleteVariableGroup: z.infer<
      typeof ApiParamSchemas[ActionType.DELETE_VARIABLE_GROUP]
    >;
    CreateServer: z.infer<typeof ApiParamSchemas[ActionType.CREATE_SERVER]>;
    DeleteServer: z.infer<typeof ApiParamSchemas[ActionType.DELETE_SERVER]>;
    CreateLocalKey: z.infer<
      typeof ApiParamSchemas[ActionType.CREATE_LOCAL_KEY]
    >;
    DeleteLocalKey: z.infer<
      typeof ApiParamSchemas[ActionType.DELETE_LOCAL_KEY]
    >;
    GenerateKey: z.infer<typeof ApiParamSchemas[ActionType.GENERATE_KEY]>;
    RevokeKey: z.infer<typeof ApiParamSchemas[ActionType.REVOKE_KEY]>;
    RbacCreateOrgRole: z.infer<
      typeof ApiParamSchemas[ActionType.RBAC_CREATE_ORG_ROLE]
    >;
    RbacDeleteOrgRole: z.infer<
      typeof ApiParamSchemas[ActionType.RBAC_DELETE_ORG_ROLE]
    >;
    RbacUpdateOrgRole: z.infer<
      typeof ApiParamSchemas[ActionType.RBAC_UPDATE_ORG_ROLE]
    >;
    CreateEnvironment: z.infer<
      typeof ApiParamSchemas[ActionType.CREATE_ENVIRONMENT]
    >;
    DeleteEnvironment: z.infer<
      typeof ApiParamSchemas[ActionType.DELETE_ENVIRONMENT]
    >;
    UpdateEnvironmentSettings: z.infer<
      typeof ApiParamSchemas[ActionType.UPDATE_ENVIRONMENT_SETTINGS]
    >;
    RbacCreateEnvironmentRole: z.infer<
      typeof ApiParamSchemas[ActionType.RBAC_CREATE_ENVIRONMENT_ROLE]
    >;
    RbacDeleteEnvironmentRole: z.infer<
      typeof ApiParamSchemas[ActionType.RBAC_DELETE_ENVIRONMENT_ROLE]
    >;
    RbacUpdateEnvironmentRole: z.infer<
      typeof ApiParamSchemas[ActionType.RBAC_UPDATE_ENVIRONMENT_ROLE]
    >;
    RbacUpdateEnvironmentRoleSettings: z.infer<
      typeof ApiParamSchemas[ActionType.RBAC_UPDATE_ENVIRONMENT_ROLE_SETTINGS]
    >;
    RbacReorderEnvironmentRoles: z.infer<
      typeof ApiParamSchemas[ActionType.RBAC_REORDER_ENVIRONMENT_ROLES]
    >;
    RbacCreateAppRole: z.infer<
      typeof ApiParamSchemas[ActionType.RBAC_CREATE_APP_ROLE]
    >;
    RbacDeleteAppRole: z.infer<
      typeof ApiParamSchemas[ActionType.RBAC_DELETE_APP_ROLE]
    >;
    RbacUpdateAppRole: z.infer<
      typeof ApiParamSchemas[ActionType.RBAC_UPDATE_APP_ROLE]
    >;
    RbacCreateIncludedAppRole: z.infer<
      typeof ApiParamSchemas[ActionType.RBAC_CREATE_INCLUDED_APP_ROLE]
    >;
    DeleteIncludedAppRole: z.infer<
      typeof ApiParamSchemas[ActionType.DELETE_INCLUDED_APP_ROLE]
    >;
    CreateGroup: z.infer<typeof ApiParamSchemas[ActionType.CREATE_GROUP]>;
    RenameGroup: z.infer<typeof ApiParamSchemas[ActionType.RENAME_GROUP]>;
    DeleteGroup: z.infer<typeof ApiParamSchemas[ActionType.DELETE_GROUP]>;
    CreateGroupMembership: z.infer<
      typeof ApiParamSchemas[ActionType.CREATE_GROUP_MEMBERSHIP]
    >;
    DeleteGroupMembership: z.infer<
      typeof ApiParamSchemas[ActionType.DELETE_GROUP_MEMBERSHIP]
    >;
    CreateAppUserGroup: z.infer<
      typeof ApiParamSchemas[ActionType.CREATE_APP_USER_GROUP]
    >;
    DeleteAppUserGroup: z.infer<
      typeof ApiParamSchemas[ActionType.DELETE_APP_USER_GROUP]
    >;
    CreateAppGroupUserGroup: z.infer<
      typeof ApiParamSchemas[ActionType.CREATE_APP_GROUP_USER_GROUP]
    >;
    DeleteAppGroupUserGroup: z.infer<
      typeof ApiParamSchemas[ActionType.DELETE_APP_GROUP_USER_GROUP]
    >;
    CreateAppGroupUser: z.infer<
      typeof ApiParamSchemas[ActionType.CREATE_APP_GROUP_USER]
    >;
    DeleteAppGroupUser: z.infer<
      typeof ApiParamSchemas[ActionType.DELETE_APP_GROUP_USER]
    >;
    CreateAppBlockGroup: z.infer<
      typeof ApiParamSchemas[ActionType.CREATE_APP_BLOCK_GROUP]
    >;
    DeleteAppBlockGroup: z.infer<
      typeof ApiParamSchemas[ActionType.DELETE_APP_BLOCK_GROUP]
    >;
    CreateAppGroupBlock: z.infer<
      typeof ApiParamSchemas[ActionType.CREATE_APP_GROUP_BLOCK]
    >;
    DeleteAppGroupBlock: z.infer<
      typeof ApiParamSchemas[ActionType.DELETE_APP_GROUP_BLOCK]
    >;
    CreateAppGroupBlockGroup: z.infer<
      typeof ApiParamSchemas[ActionType.CREATE_APP_GROUP_BLOCK_GROUP]
    >;
    DeleteAppGroupBlockGroup: z.infer<
      typeof ApiParamSchemas[ActionType.DELETE_APP_GROUP_BLOCK_GROUP]
    >;
    ReorderBlocks: z.infer<typeof ApiParamSchemas[ActionType.REORDER_BLOCKS]>;
    ReorderGroupMemberships: z.infer<
      typeof ApiParamSchemas[ActionType.REORDER_GROUP_MEMBERSHIPS]
    >;
    ReorderAppBlockGroups: z.infer<
      typeof ApiParamSchemas[ActionType.REORDER_APP_BLOCK_GROUPS]
    >;
    ReorderAppGroupBlocks: z.infer<
      typeof ApiParamSchemas[ActionType.REORDER_APP_GROUP_BLOCKS]
    >;
    ReorderAppGroupBlockGroups: z.infer<
      typeof ApiParamSchemas[ActionType.REORDER_APP_GROUP_BLOCK_GROUPS]
    >;
    RevokeTrustedPubkeys: z.infer<
      typeof ApiParamSchemas[ActionType.REVOKE_TRUSTED_PUBKEYS]
    >;
    FetchEnvkey: z.infer<typeof ApiParamSchemas[ActionType.FETCH_ENVKEY]>;
    CheckEnvkey: z.infer<typeof ApiParamSchemas[ActionType.CHECK_ENVKEY]>;

    UpdateLicense: z.infer<typeof ApiParamSchemas[ActionType.UPDATE_LICENSE]>;

    ReencryptEnvs: z.infer<typeof ApiParamSchemas[ActionType.REENCRYPT_ENVS]>;

    FetchOrgStats: z.infer<typeof ApiParamSchemas[ActionType.FETCH_ORG_STATS]>;

    SelfHostedResyncFailover: z.infer<
      typeof ApiParamSchemas[ActionType.SELF_HOSTED_RESYNC_FAILOVER]
    >;

    SetOrgAllowedIps: z.infer<
      typeof ApiParamSchemas[ActionType.SET_ORG_ALLOWED_IPS]
    >;

    SetAppAllowedIps: z.infer<
      typeof ApiParamSchemas[ActionType.SET_APP_ALLOWED_IPS]
    >;

    UnsubscribeCloudLifecycleEmails: z.infer<
      typeof ApiParamSchemas[ActionType.UNSUBSCRIBE_CLOUD_LIFECYCLE_EMAILS]
    >;

    StartedOrgImport: z.infer<
      typeof ApiParamSchemas[ActionType.STARTED_ORG_IMPORT]
    >;
    FinishedOrgImport: z.infer<
      typeof ApiParamSchemas[ActionType.FINISHED_ORG_IMPORT]
    >;
  };

  export type ApiResultTypes = {
    Register: ValidationErrorResult | RegisterResult;
    InitSelfHosted: OkResult;
    UpgradeSelfHosted: GraphDiffsResult;
    UpgradeSelfHostedForceClear: GraphDiffsResult;
    CreateSession: SessionResult;
    GetSession: SessionResult | NotModifiedResult;
    ClearToken: OkResult;
    ForgetDevice: OkResult;
    ClearUserTokens: OkResult;
    ClearOrgTokens: OkResult;
    DeleteOrg: OkResult;
    RenameOrg: GraphDiffsResult;
    RenameUser: GraphDiffsResult;
    CreateExternalAuthSession:
      | {
          type: "pendingExternalAuthSession";
          id: string;
          authUrl: string;
          authMethod: Auth.AuthMethod;
        }
      | RequiresEmailAuthResult
      | SignInWrongProviderErrorResult;
    CreateExternalAuthInviteSession: ApiResultTypes["CreateExternalAuthSession"];
    GetExternalAuthSession:
      | {
          type: "externalAuthSession";
          session: Pick<
            Db.ExternalAuthSession,
            | "id"
            | "error"
            | "errorAt"
            | "authType"
            | "authMethod"
            | "provider"
            | "externalAuthProviderId"
            | "verifiedEmail"
            | "externalUid"
            | "userId"
            | "orgId"
            | "suggestFirstName"
            | "suggestLastName"
          >;
          existingUsers: ExistingAuthUser[];
        }
      | RequiresExternalAuthResult;

    GetExternalAuthProviders: {
      type: "externalAuthProviders";
      providers: (Model.ExternalAuthProvider & { endpoint?: string })[];
      samlSettingsByProviderId?: Record<
        string,
        Model.SamlProviderSettings | undefined
      >;
    };

    DeleteExternalAuthProvider: GraphDiffsResult;
    OauthCallback: { type: "oauthCallback"; result: string };
    SamlAcsCallback: {
      type: "samlAcsCallback";
      email: string;
      userId: string;
      externalAuthSessionId: string;
    };
    GetExternalAuthUsers: {
      type: "externalAuthUsers";
      users: Model.ExternalAuthUser[];
    };
    GetExternalAuthOrgs: {
      type: "externalAuthOrgs";
      orgs: {
        [id: string]: string;
      };
    };
    CreateEmailVerification: OkResult | SignInWrongProviderErrorResult;
    CheckEmailTokenValid: OkResult;
    CreateInvite: ValidationErrorResult | GraphDiffsResult;
    LoadInvite: LoadedInvite | RequiresExternalAuthResult;
    RevokeInvite: GraphDiffsResult;
    AcceptInvite: AcceptInviteResult;
    CreateRecoveryKey: GraphDiffsResult;
    LoadRecoveryKey: LoadedRecoveryKey | RequiresEmailAuthResult;
    RedeemRecoveryKey: RedeemRecoveryKeyResult;
    UpdateTrustedRootPubkey: OkResult;
    FetchGraph: GraphResult;
    LoadDeviceGrant: LoadedDeviceGrant | RequiresExternalAuthResult;
    AcceptDeviceGrant: AcceptDeviceGrantResult;
    FetchEnvs: FetchEnvsResult;
    FetchLogs: {
      type: "logs";
      logs: Logs.LoggedAction[];
      totalCount?: number;
      countReachedLimit?: boolean;
      deletedGraph?: Client.Graph.UserGraph;
      ips?: string[];
    };
    FetchDeletedGraph: {
      type: "deletedGraph";
      deletedGraph: Client.Graph.UserGraph;
    };
    CreateDeviceGrant: GraphDiffsResult | ValidationErrorResult;
    RevokeDeviceGrant: GraphDiffsResult;
    RevokeDevice: GraphDiffsResult;
    UpdateOrgSettings: ValidationErrorResult | GraphDiffsResult;

    CreateOrgSamlProvider: GraphDiffsResult;
    UpdateOrgSamlSettings: GraphDiffsResult;

    CreateScimProvisioningProvider: GraphDiffsResult;
    UpdateScimProvisioningProvider: GraphDiffsResult;
    DeleteScimProvisioningProvider: GraphDiffsResult;
    CheckScimProvider: {
      type: "checkScimProviderResponse";
      status: number;
      nickname: string;
    };
    CreateScimUser: { status: number } & (
      | ScimUserResponse
      | ({ type: "scimError" } & ScimError)
    );
    GetScimUser: { status: number } & (
      | ScimUserResponse
      | ({ type: "scimError" } & ScimError)
    );
    ListScimUsers: { status: number } & (
      | ({ type: "scimUserCandidateList" } & ScimListResponse<ScimUser>) // note: not ScimUserResponse
      | ({ type: "scimError" } & ScimError)
    );
    DeleteScimUser: GraphDiffsResult | ({ type: "scimError" } & ScimError);
    UpdateScimUser: { status: number } & (
      | ScimUserResponse
      | ({ type: "scimError" } & ScimError)
    );
    ListInvitableScimUsers: {
      type: "scimUserCandidates";
      scimUserCandidates: Model.ScimUserCandidate[];
    };

    UpdateUserRole: ValidationErrorResult | GraphDiffsResult;
    RemoveFromOrg: GraphDiffsResult;
    CreateCliUser: ValidationErrorResult | GraphDiffsResult;
    RenameCliUser: GraphDiffsResult;
    DeleteCliUser: GraphDiffsResult;
    AuthenticateCliKey: AuthenticateCliKeyResult;
    CreateApp: ValidationErrorResult | GraphDiffsResult;
    RenameApp: GraphDiffsResult;
    UpdateAppSettings: ValidationErrorResult | GraphDiffsResult;
    DeleteApp: GraphDiffsResult;
    GrantAppAccess: GraphDiffsResult;
    RemoveAppAccess: GraphDiffsResult;
    CreateBlock: ValidationErrorResult | GraphDiffsResult;
    RenameBlock: GraphDiffsResult;
    UpdateBlockSettings: ValidationErrorResult | GraphDiffsResult;
    DeleteBlock: GraphDiffsResult;
    ConnectBlock: GraphDiffsResult;
    DisconnectBlock: GraphDiffsResult;
    UpdateEnvs: ValidationErrorResult | GraphDiffsResult;
    CreateVariableGroup: ValidationErrorResult | GraphDiffsResult;
    DeleteVariableGroup: GraphDiffsResult;
    CreateServer: ValidationErrorResult | GraphDiffsResult;
    DeleteServer: GraphDiffsResult;
    CreateLocalKey: ValidationErrorResult | GraphDiffsResult;
    DeleteLocalKey: GraphDiffsResult;
    GenerateKey: GraphDiffsResult;
    RevokeKey: GraphDiffsResult;
    RbacCreateOrgRole: ValidationErrorResult | GraphDiffsResult;
    RbacDeleteOrgRole: GraphDiffsResult;
    RbacUpdateOrgRole: ValidationErrorResult | GraphDiffsResult;
    CreateEnvironment: ValidationErrorResult | GraphDiffsResult;
    DeleteEnvironment: GraphDiffsResult;
    UpdateEnvironmentSettings: ValidationErrorResult | GraphDiffsResult;
    RbacCreateEnvironmentRole: ValidationErrorResult | GraphDiffsResult;
    RbacDeleteEnvironmentRole: GraphDiffsResult;
    RbacUpdateEnvironmentRole: ValidationErrorResult | GraphDiffsResult;
    RbacUpdateEnvironmentRoleSettings: ValidationErrorResult | GraphDiffsResult;
    RbacReorderEnvironmentRoles: GraphDiffsResult;
    RbacCreateAppRole: ValidationErrorResult | GraphDiffsResult;
    RbacDeleteAppRole: GraphDiffsResult;
    RbacUpdateAppRole: ValidationErrorResult | GraphDiffsResult;
    RbacCreateIncludedAppRole: ValidationErrorResult | GraphDiffsResult;
    DeleteIncludedAppRole: GraphDiffsResult;
    CreateGroup: ValidationErrorResult | GraphDiffsResult;
    RenameGroup: ValidationErrorResult | GraphDiffsResult;
    DeleteGroup: GraphDiffsResult;
    CreateGroupMembership: ValidationErrorResult | GraphDiffsResult;
    DeleteGroupMembership: GraphDiffsResult;
    CreateAppUserGroup: ValidationErrorResult | GraphDiffsResult;
    DeleteAppUserGroup: GraphDiffsResult;
    CreateAppGroupUserGroup: ValidationErrorResult | GraphDiffsResult;
    DeleteAppGroupUserGroup: GraphDiffsResult;
    CreateAppGroupUser: ValidationErrorResult | GraphDiffsResult;
    DeleteAppGroupUser: GraphDiffsResult;
    CreateAppBlockGroup: ValidationErrorResult | GraphDiffsResult;
    DeleteAppBlockGroup: GraphDiffsResult;
    CreateAppGroupBlock: ValidationErrorResult | GraphDiffsResult;
    DeleteAppGroupBlock: GraphDiffsResult;
    CreateAppGroupBlockGroup: ValidationErrorResult | GraphDiffsResult;
    DeleteAppGroupBlockGroup: GraphDiffsResult;
    ReorderBlocks: GraphDiffsResult;
    ReorderGroupMemberships: GraphDiffsResult;
    ReorderAppBlockGroups: GraphDiffsResult;
    ReorderAppGroupBlocks: GraphDiffsResult;
    ReorderAppGroupBlockGroups: GraphDiffsResult;
    RevokeTrustedPubkeys: GraphDiffsResult;
    UpdateLicense: GraphDiffsResult;
    ReencryptEnvs: GraphDiffsResult;
    FetchEnvkey: Fetch.Result;
    CheckEnvkey: Fetch.CheckResult;
    EnvkeyFetchUpdateTrustedRootPubkey: OkResult;
    FetchOrgStats: {
      type: "orgStats";
      orgStats: Model.OrgStats;
    };
    SelfHostedResyncFailover: OkResult;
    SetOrgAllowedIps: GraphDiffsResult;
    SetAppAllowedIps: GraphDiffsResult;
    UnsubscribeCloudLifecycleEmails: OkResult;
    StartedOrgImport: OkResult;
    FinishedOrgImport: OkResult;
  };

  export type ApiParams = ApiParamTypes[keyof ApiParamTypes];

  export type ApiResult = ApiResultTypes[keyof ApiResultTypes];
  export type ScimApiResult =
    | ApiResultTypes["CheckScimProvider"]
    | ApiResultTypes["CreateScimUser"]
    | ApiResultTypes["GetScimUser"]
    | ApiResultTypes["ListScimUsers"]
    | ApiResultTypes["DeleteScimUser"]
    | ApiResultTypes["UpdateScimUser"];
}
