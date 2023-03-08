import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import { V1Upgrade } from "../types/api/v1_upgrade";

const SIGNER_PUBKEY = "EHeJA64P3q1sD0Mrg3KnqkLPLkbsuMm5MIxTLli3GlE=";

export const verifyV1Upgrade = (
  v1Payload: { ts: number; signature: string },
  now: number
): true | string => {
  console.log("v1 verify upgrade - signature", v1Payload.signature);

  if (
    !nacl.sign.detached.verify(
      naclUtil.decodeUTF8(v1Payload.ts.toString()),
      naclUtil.decodeBase64(v1Payload.signature),
      naclUtil.decodeBase64(SIGNER_PUBKEY)
    )
  ) {
    return "v1 signature invalid";
  }

  // v1 authorization is valid for 24 hours
  const elapsed = now - v1Payload.ts;
  if (elapsed >= 1000 * 60 * 60 * 24) {
    return "v1 upgrade authorization expired";
  }

  return true;
};

export const verifyV1PresetBilling = (
  signedPresetBilling: string
): V1Upgrade.PresetBilling | string => {
  const bytes = nacl.sign.open(
    naclUtil.decodeBase64(signedPresetBilling),
    naclUtil.decodeBase64(SIGNER_PUBKEY)
  );

  if (!bytes) {
    return "v1 signature invalid";
  }

  return JSON.parse(naclUtil.encodeUTF8(bytes)) as V1Upgrade.PresetBilling;
};
