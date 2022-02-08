import { Crypto } from "./crypto";
import * as z from "zod";

export namespace Trust {
  type InvitedById = string;
  type InvitePubkey = Crypto.Pubkey;

  type SignedById = string;

  type TrustedCliOrRecovery = [
    "cliUser" | "recoveryKey",
    Crypto.Pubkey,
    SignedById
  ];
  type TrustedDevice = [
    "orgUserDevice",
    Crypto.Pubkey,
    InvitePubkey,
    InvitedById
  ];

  type TrustedInvite = ["invite" | "deviceGrant", InvitePubkey, InvitedById];

  type TrustedEnvkey = ["generatedEnvkey", Crypto.Pubkey, SignedById];

  export type TrustedRootPubkey = ["root", Crypto.Pubkey];

  export type TrustedUserPubkey = TrustedCliOrRecovery | TrustedDevice;

  export type UserTrustChain = {
    [id: string]: TrustedUserPubkey;
  };

  export type RootTrustChain = {
    [id: string]: TrustedRootPubkey;
  };

  export const SignedTrustChainSchema = Crypto.SignedDataSchema;
  export type SignedTrustChain = z.infer<typeof SignedTrustChainSchema>;

  export type TrustedPubkey =
    | TrustedRootPubkey
    | TrustedUserPubkey
    | TrustedInvite
    | TrustedEnvkey;

  export type TrustedSessionPubkey = TrustedPubkey;

  export type TrustedSessionPubkeys = {
    [id: string]: TrustedSessionPubkey;
  };
}
