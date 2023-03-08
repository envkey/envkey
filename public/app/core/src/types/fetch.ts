import { Crypto, Trust, Api } from ".";

type RootPubkeyReplacement = Pick<
  Api.Db.RootPubkeyReplacement,
  "id" | "replacingPubkeyId" | "replacingPubkey" | "signedReplacingTrustChain"
>;

export namespace Fetch {
  export type Result = KeyableBlob & {
    type: "fetchResult";
    orgId: string;
    encryptedPrivkey: Crypto.EncryptedData;
    pubkey: Crypto.Pubkey;
    signedTrustedRoot: Crypto.SignedData;
    blocks?: KeyableBlob[];
    rootPubkeyReplacements?: RootPubkeyReplacement[];
    v1Payload?: Api.Db.GeneratedEnvkey["v1Payload"];
  };

  export type CheckResult = {
    type: "checkResult";
    orgId: string;
    appId: string;
  };

  export type KeyableBlob = {
    env?: KeyableBlobFields;
    subEnv?: KeyableBlobFields;
    locals?: KeyableBlobFields;
    inheritanceOverrides?: { [environmentId: string]: KeyableBlobFields };
  };

  export type KeyableBlobFields = {
    encryptedKey: Crypto.EncryptedData;
    encryptedEnv: Crypto.EncryptedData;
    encryptedByPubkeyId: string;
    encryptedByPubkey: Crypto.Pubkey;
    encryptedByTrustChain: Trust.SignedTrustChain;
  };
}
