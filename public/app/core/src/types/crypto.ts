import * as z from "zod";

export namespace Crypto {
  const CompoundKeySchema = z.object({
    keys: z.object({
      signingKey: z.string(),
      encryptionKey: z.string(),
    }),
  });

  export const PubkeySchema = z
    .object({
      signature: z.string().optional(),
    })
    .merge(CompoundKeySchema);

  export const PrivkeySchema = CompoundKeySchema;

  export type Pubkey = z.infer<typeof PubkeySchema>;

  export type Privkey = z.infer<typeof PrivkeySchema>;

  export const EncryptedDataSchema = z.object({
    data: z.string(),
    nonce: z.string(),
  });

  export type BinaryEncryptedData = {
    data: Uint8Array;
    nonce: Uint8Array;
  };

  export type BinaryEncryptionKeypair = {
    pubkey: Uint8Array;
    privkey: Uint8Array;
  };

  export type EncryptedData = z.infer<typeof EncryptedDataSchema>;

  export const SignedDataSchema = z.object({ data: z.string() });
  export type SignedData = z.infer<typeof SignedDataSchema>;

  export const PassphraseEncryptedDataSchema = z
    .object({
      salt: z.string(),
    })
    .merge(EncryptedDataSchema);
  export type PassphraseEncryptedData = z.infer<
    typeof PassphraseEncryptedDataSchema
  >;

  export const KeypairSchema = z.object({
    pubkey: PubkeySchema,
    privkey: PrivkeySchema,
  });
  export type Keypair = z.infer<typeof KeypairSchema>;

  export const EncryptedKeypairSchema = z.object({
    pubkey: PubkeySchema,
    encryptedPrivkey: EncryptedDataSchema,
  });
  export type EncryptedKeypair = z.infer<typeof EncryptedKeypairSchema>;

  export const PassphraseEncryptedKeypairSchema = z.object({
    pubkey: PubkeySchema,
    encryptedPrivkey: PassphraseEncryptedDataSchema,
  });
  export type PassphraseEncryptedKeypair = z.infer<
    typeof PassphraseEncryptedKeypairSchema
  >;

  export const DecryptParamsSchema = z
    .object({
      encrypted: EncryptedDataSchema,
    })
    .merge(KeypairSchema);

  export type DecryptParams = z.infer<typeof DecryptParamsSchema>;
}
