import { Client, Model, Trust, Crypto } from "../../types";
import { sha256 } from "../crypto/utils";

export const getPubkeyHash = (pubkey: Crypto.Pubkey) =>
  sha256(JSON.stringify(pubkey));

export const getTrustChain = (
  state: Pick<Client.State, "graph" | "trustedSessionPubkeys" | "trustedRoot">,
  userOrDeviceId: string
): Trust.UserTrustChain => {
  const trustedSessionPubkeys = state.trustedSessionPubkeys,
    trustedRoot = state.trustedRoot;

  if (!trustedRoot) {
    throw new Error("Verified trustedUserPubkeys required.");
  }

  const trustChain: Trust.UserTrustChain = {},
    checked: { [id: string]: true } = {},
    authId = userOrDeviceId,
    { pubkey: currentUserPubkey } = state.graph[authId] as
      | Model.OrgUserDevice
      | Model.CliUser;

  let currentKeyableId = authId;
  let currentPubkeyId = getPubkeyHash(currentUserPubkey);

  while (true) {
    if (checked[currentPubkeyId]) {
      throw new Error(
        "Circular trust chain. Couldn't find trusted root pubkey."
      );
    }

    checked[currentPubkeyId] = true;

    if (trustedRoot[currentPubkeyId]) {
      return trustChain;
    }

    const trusted = trustedSessionPubkeys[currentPubkeyId];

    if (!trusted) {
      throw new Error("Trusted pubkey chain broken.");
    }

    let trustedInviter = state.graph[currentKeyableId] as
      | Model.CliUser
      | Model.OrgUserDevice;

    if (!trustedInviter || !trustedInviter.pubkey) {
      throw new Error("Trusted inviter not found. Chain broken.");
    }

    // if creator of org and NOT the trusted root, throw an error
    if (
      trustedInviter.type == "orgUserDevice" &&
      trustedInviter.approvedByType == "creator"
    ) {
      throw new Error("Trusted pubkey chain broken.");
    }

    if (trustedInviter.type == "cliUser") {
      const { pubkey: inviterPubkey } = state.graph[
        trustedInviter.signedById
      ] as Model.CliUser | Model.OrgUserDevice;
      const inviterPubkeyId = getPubkeyHash(inviterPubkey);

      trustChain[currentPubkeyId] = [
        "cliUser",
        trustedInviter.pubkey,
        inviterPubkeyId,
      ];
      currentKeyableId = trustedInviter.signedById;
      currentPubkeyId = inviterPubkeyId;
    } else {
      let intermediateKeyableId: string;
      switch (trustedInviter.approvedByType) {
        case "invite":
          intermediateKeyableId = trustedInviter.inviteId;
          break;

        case "deviceGrant":
          intermediateKeyableId = trustedInviter.deviceGrantId;
          break;

        case "recoveryKey":
          intermediateKeyableId = trustedInviter.recoveryKeyId;
          break;
      }

      const intermediateKeyable = state.graph[intermediateKeyableId] as
        | Model.Invite
        | Model.DeviceGrant
        | Model.RecoveryKey;

      const signedById = intermediateKeyable.signedById;
      const { pubkey: signedByPubkey } = state.graph[signedById] as
        | Model.CliUser
        | Model.OrgUserDevice;
      const signedByPubkeyId = getPubkeyHash(signedByPubkey);

      trustChain[currentPubkeyId] = [
        "orgUserDevice",
        trustedInviter.pubkey!,
        intermediateKeyable.pubkey,
        signedByPubkeyId,
      ];

      currentKeyableId = signedById;
      currentPubkeyId = signedByPubkeyId;
    }
  }
};
