import { Crypto } from "../crypto";
import Api from "../api";
import { Model } from "../model";
import { Trust } from "../trust";
import * as z from "zod";

export namespace Blob {
  const BlobTypeSchema = z.enum(["env", "changeset"]);

  const EnvTypeSchema = z.enum([
    "env",
    "inheritanceOverrides",
    "subEnv",
    "localOverrides",
  ]);

  const EnvPartSchema = z.enum(["env", "meta", "inherits"]);

  export type EncryptedKeyBase = z.infer<typeof EncryptedKeyBaseSchema>;
  export const EncryptedKeyBaseSchema = z
    .object({
      data: Crypto.EncryptedDataSchema,
      encryptedById: z.string(),
    })
    .merge(Model.TimestampsSchema);

  export type UserEncryptedKey = z.infer<typeof UserEncryptedKeySchema>;
  export const UserEncryptedKeySchema = EncryptedKeyBaseSchema.extend({
    type: z.literal("userEncryptedKey"),
    envParentId: z.string().optional(),
    environmentId: z.string().optional(),
    inheritsEnvironmentId: z.string().optional(),
    blobType: BlobTypeSchema,
    envType: EnvTypeSchema.optional(),
    envPart: EnvPartSchema.optional(),
  });

  export type GeneratedEnvkeyEncryptedKey = z.infer<
    typeof GeneratedEnvkeyEncryptedKeySchema
  >;
  export const GeneratedEnvkeyEncryptedKeySchema =
    EncryptedKeyBaseSchema.extend({
      type: z.literal("generatedEnvkeyEncryptedKey"),
      encryptedByPubkey: Crypto.PubkeySchema,
      encryptedByTrustChain: Trust.SignedTrustChainSchema,
      envParentId: z.string(),
      environmentId: z.string(),
      keyableParentId: z.string(),
      generatedEnvkeyId: z.string(),
      envType: EnvTypeSchema,
      inheritsEnvironmentId: z.string().optional(),
      userId: z.string().optional(),
      blockId: z.string().optional(),
      orderIndex: z.number().optional(),
    });

  export type EncryptedBlob = z.infer<typeof EncryptedBlobSchema>;
  export const EncryptedBlobSchema = z
    .object({
      type: z.literal("encryptedBlob"),
      encryptedById: z.string(),
      data: Crypto.EncryptedDataSchema,
      changesetId: z.string().optional(),
      createdById: z.string().optional(),
      envParentId: z.string().optional(),
      blockId: z.string().optional(),
      environmentId: z.string().optional(),
      inheritsEnvironmentId: z.string().optional(),
      blobType: BlobTypeSchema,
      envType: EnvTypeSchema.optional(),
      envPart: EnvPartSchema.optional(),
    })
    .merge(Model.TimestampsSchema);

  export type GeneratedEnvkeySet = z.infer<typeof GeneratedEnvkeySetSchema>;
  const GeneratedEnvkeySetSchema = z.object({
    env: z.literal(true).optional(),
    localOverrides: z.literal(true).optional(),
    subEnv: z.literal(true).optional(),
    inheritanceOverrides: z
      .union([z.literal(true), z.array(z.string())])
      .optional(),
  });

  export type UserEnvSet = z.infer<typeof UserEnvSetSchema>;
  export const UserEnvSetSchema = z.object({
    env: z.literal(true).optional(),
    meta: z.literal(true).optional(),
    inherits: z.literal(true).optional(),
    inheritanceOverrides: z
      .union([z.literal(true), z.array(z.string())])
      .optional(),
    changesets: z.literal(true).optional(),
  });

  export type LocalsSet = z.infer<typeof LocalsSetSchema>;
  const LocalsSetSchema = UserEnvSetSchema.pick({
    env: true,
    meta: true,
    changesets: true,
  });

  export type EnvParentsSet = z.infer<typeof EnvParentsSetSchema>;
  const EnvParentsSetSchema = z.record(
    z.object({
      environments: z.record(UserEnvSetSchema).optional(),
      locals: z.record(LocalsSetSchema).optional(),
    })
  );

  export type KeySet = z.infer<typeof KeySetSchema>;
  export const KeySetSchema = z.object({
    type: z.literal("keySet"),
    users: z.record(z.record(EnvParentsSetSchema)).optional(),
    keyableParents: z.record(z.record(GeneratedEnvkeySetSchema)).optional(),
    blockKeyableParents: z
      .record(z.record(z.record(GeneratedEnvkeySetSchema)))
      .optional(),
    newDevice: EnvParentsSetSchema.optional(),
  });

  export type BlobSet = z.infer<typeof BlobSetSchema>;
  export const BlobSetSchema = EnvParentsSetSchema;

  export type UserEncryptedKeyPkeyParams = {
    orgId: string;
    userId: string;
    deviceId: string;
  };

  export type SkeyParams =
    | (({
        blobType: "env";
      } & {
        envParentId: string;
        environmentId: string;
      }) &
        (
          | {
              envType: "env" | "subEnv";
              envPart: "env" | "meta" | "inherits";
            }
          | {
              envType: "localOverrides";
              envPart: "env" | "meta";
            }
          | {
              envType: "inheritanceOverrides";
              inheritsEnvironmentId: string;
              envPart: "env";
            }
        ))
    | {
        blobType: "changeset";
        envParentId: string;
        environmentId: string;
        id?: string;
      };

  export type ScopeParams =
    | ({
        blobType: "env";
      } & (
        | { envParentId?: undefined }
        | ({
            envParentId: string;
          } & (
            | {
                environmentId?: undefined;
              }
            | {
                environmentId: string;
                envPart?: "env";
              }
          ))
      ))
    | ({
        envParentId: string;
        blobType: "changeset";
        environmentId?: string;
      } & Api.Net.FetchChangesetOptions)
    | {
        blobType?: undefined;
      };

  export type UserEncryptedKeyParams = UserEncryptedKeyPkeyParams & SkeyParams;

  export type UserEncryptedKeyPkeyWithScopeParams = UserEncryptedKeyPkeyParams &
    ScopeParams;

  export type EncryptedBlobPkeyParams = { orgId: string };

  export type EncryptedBlobParams = EncryptedBlobPkeyParams & SkeyParams;

  export type EncryptedBlobPkeyWithScopeParams = EncryptedBlobPkeyParams &
    ScopeParams;

  export type UserEncryptedKeysByEnvironmentIdOrComposite = Record<
    string,
    Blob.UserEncryptedKey
  >;

  export type UserEncryptedChangesetKeysByEnvironmentId = Record<
    string,
    Blob.UserEncryptedKey
  >;

  export type UserEncryptedBlobsByComposite = Record<
    string,
    Blob.EncryptedBlob
  >;

  export type UserEncryptedBlobsByEnvironmentId = Record<
    string,
    Blob.EncryptedBlob[]
  >;
}
