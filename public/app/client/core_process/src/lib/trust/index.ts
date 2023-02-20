import { Client, Crypto, Model, Trust } from "@core/types";
import {
  verifyJson,
  encryptJson,
  decryptJson,
  signJson,
  verifyPublicKeySignature,
} from "@core/lib/crypto/proxy";
import { dispatch } from "../../handler";
import * as R from "ramda";
import {
  getActiveGeneratedEnvkeysByKeyableParentId,
  getKeyablesByPubkeyId,
  graphTypes,
} from "@core/lib/graph";
import { getAuth, getPubkeyHash } from "@core/lib/client";
import { log } from "@core/lib/utils/logger";

export const verifyCurrentUser = async (
    initialState: Client.State,
    context: Client.Context
  ) => {
    let state = initialState;

    const auth = getAuth(state, context.accountIdOrCliKey);

    if (!auth || !auth.privkey || !context.accountIdOrCliKey) {
      throw new Error("Action requires authentication and decrypted privkey");
    }

    let pubkey: Crypto.Pubkey | undefined;
    let keyableId: string | undefined;

    const user = state.graph[auth.userId] as
      | Model.CliUser
      | Model.OrgUser
      | undefined;

    if (!user) {
      throw new Error("authenticated user or cli user not found in graph");
    }

    if (user.type == "cliUser") {
      pubkey = user.pubkey;
      keyableId = user.id;
    } else if (auth.type == "clientUserAuth") {
      const currentOrgUserDevice = state.graph[auth.deviceId] as
        | Model.OrgUserDevice
        | undefined;

      if (!currentOrgUserDevice) {
        throw new Error("currentOrgUserDevice not found in graph");
      }
      pubkey = currentOrgUserDevice.pubkey;
      keyableId = currentOrgUserDevice.id;
    }

    if (!pubkey || !keyableId) {
      throw new Error("pubkey or keyableId undefined");
    }

    const [verifyRes, _] = await Promise.all([
      verifySignedTrustedRootPubkey(state, pubkey, context),
      verifyKeypair(pubkey, auth.privkey),
    ]);

    if (!verifyRes.success) {
      return verifyRes;
    }

    const replacementsRes = await processRootPubkeyReplacementsIfNeeded(
      verifyRes.state,
      context,
      true
    );

    if (replacementsRes && !replacementsRes.success) {
      throw new Error("couldn't process root pubkey replacements");
    }

    const res = await verifyOrgKeyable(
      (replacementsRes ?? verifyRes).state,
      keyableId,
      context
    );
    if (!res) {
      throw new Error("current user pubkey couldn't be verified");
    }

    return { success: true, state: res };
  },
  verifyKeypair = async (pubkey: Crypto.Pubkey, privkey: Crypto.Privkey) => {
    const data = { message: "test" },
      [encrypted, signed] = await Promise.all([
        encryptJson({
          data,
          pubkey,
          privkey,
        }),
        signJson({ data, privkey }),
      ]),
      [decrypted, verified] = await Promise.all([
        decryptJson({
          encrypted,
          privkey,
          pubkey,
        }),
        verifyJson({ signed, pubkey }).catch((err) => undefined),
      ]);

    if (!verified || !R.equals(data, decrypted) || !R.equals(data, verified)) {
      throw new Error("keypair verification failed");
    }
  },
  verifySignedTrustedRootPubkey = async (
    state: Client.State,
    pubkey: Crypto.Pubkey,
    context: Client.Context
  ) => {
    if (state.trustedRoot) {
      return { success: true, state };
    }

    if (!state.signedTrustedRoot) {
      throw new Error("signedTrustedRoot undefined");
    }

    const verified = (await verifyJson({
      signed: state.signedTrustedRoot.data,
      pubkey: pubkey,
    })) as Trust.RootTrustChain;

    return dispatch(
      {
        type: Client.ActionType.VERIFIED_SIGNED_TRUSTED_ROOT_PUBKEY,
        payload: verified,
      },
      context
    );
  },
  getTrustAttributes = (state: Client.State, keyableId: string) => {
    if (!keyableId) {
      throw new Error("keyableId undefined");
    }

    const keyable = state.graph[keyableId] as
      | Model.KeyableParent
      | Model.CliUser
      | Model.Invite
      | Model.DeviceGrant
      | Model.OrgUserDevice
      | Model.RecoveryKey
      | undefined;

    if (!keyable) {
      throw new Error("Keyable not found");
    }

    let pubkey: Crypto.Pubkey,
      invitePubkey: Crypto.Pubkey | undefined,
      signedById: string | undefined,
      isRoot = false,
      keyableType: Trust.TrustedPubkey[0];

    if (keyable.type == "localKey" || keyable.type == "server") {
      const generatedEnvkey = getActiveGeneratedEnvkeysByKeyableParentId(
        state.graph
      )[keyable.id];
      if (!generatedEnvkey) {
        throw new Error("No envkey generated for keyableParent.");
      }

      keyableType = "generatedEnvkey";
      pubkey = generatedEnvkey.pubkey;
      signedById = generatedEnvkey.signedById;
    } else {
      if (!keyable.pubkey) {
        throw new Error("Keyable pubkey not generated");
      }

      pubkey = keyable.pubkey;

      switch (keyable.type) {
        case "orgUserDevice":
          keyableType = "orgUserDevice";

          if (keyable.approvedByType == "creator" || keyable.isRoot) {
            isRoot = true;
          } else {
            let intermediateKeyableId: string;

            switch (keyable.approvedByType) {
              case "invite":
                intermediateKeyableId = keyable.inviteId;
                break;

              case "deviceGrant":
                intermediateKeyableId = keyable.deviceGrantId;
                break;

              case "recoveryKey":
                intermediateKeyableId = keyable.recoveryKeyId;
                break;
            }
            const intermediateKeyable = state.graph[intermediateKeyableId] as
              | Model.Invite
              | Model.DeviceGrant
              | Model.RecoveryKey;

            signedById = intermediateKeyable.signedById;
            invitePubkey = intermediateKeyable.pubkey;
          }
          break;

        case "cliUser":
        case "invite":
        case "deviceGrant":
        case "recoveryKey":
          keyableType = keyable.type;
          signedById = keyable.signedById;
          break;
      }
    }

    let signedByPubkeyId: string | undefined;
    if (signedById) {
      const { pubkey: signedByPubkey } = state.graph[signedById] as
        | Model.OrgUserDevice
        | Model.CliUser;
      signedByPubkeyId = getPubkeyHash(signedByPubkey);
    }

    return {
      pubkeyId: getPubkeyHash(pubkey),
      keyableType,
      pubkey,
      invitePubkey,
      signedById,
      signedByPubkeyId,
      isRoot,
    };
  },
  getAlreadyTrusted = (
    state: Client.State,
    pubkeyId: string,
    keyableType: Trust.TrustedPubkey[0],
    pubkey: Crypto.Pubkey,
    invitePubkey: Crypto.Pubkey | undefined,
    signedByPubkeyId: string | undefined,
    isRoot: boolean
  ) => {
    let alreadyTrusted: Trust.TrustedPubkey;
    if (isRoot === true) {
      alreadyTrusted = state.trustedRoot![pubkeyId];
    } else {
      alreadyTrusted = state.trustedSessionPubkeys[pubkeyId];
    }

    if (alreadyTrusted) {
      const shouldEq = [
        isRoot ? "root" : keyableType,
        pubkey,
        invitePubkey,
        signedByPubkeyId,
      ].filter(Boolean);

      if (!R.equals(shouldEq, alreadyTrusted)) {
        return false;
      }

      return true;
    }

    return false;
  },
  verifyOrgKeyable = async (
    initialState: Client.State,
    initialKeyableId: string,
    context: Client.Context
  ): Promise<false | Client.State> => {
    let state = initialState;

    if (!state.trustedRoot || R.isEmpty(state.trustedRoot)) {
      throw new Error("Verified trustedRoot required.");
    }

    const {
      pubkeyId: initialPubkeyId,
      keyableType: initialKeyableType,
      pubkey: initialPubkey,
      invitePubkey: initialInvitePubkey,
      signedById: initialSignedById,
      signedByPubkeyId: initialSignedByPubkeyId,
      isRoot: initialIsRoot,
    } = getTrustAttributes(state, initialKeyableId);

    // Check if initial keyable is already trusted
    if (
      getAlreadyTrusted(
        state,
        initialPubkeyId,
        initialKeyableType,
        initialPubkey,
        initialInvitePubkey,
        initialSignedByPubkeyId,
        initialIsRoot
      )
    ) {
      return state;
    }

    // If keyable is not yet trusted, attempt to verify back to a signer who *is* trusted
    let verifyingChain = [
      [
        initialPubkeyId,
        [
          initialKeyableType,
          initialPubkey,
          initialInvitePubkey,
          initialSignedByPubkeyId,
        ].filter(Boolean),
      ],
    ] as [string, Trust.TrustedSessionPubkey][];

    let currentKeyableId = initialSignedById!;

    while (true) {
      const {
        pubkeyId,
        keyableType,
        signedById,
        signedByPubkeyId,
        pubkey,
        invitePubkey,
        isRoot,
      } = getTrustAttributes(state, currentKeyableId);

      if (!isRoot) {
        const { pubkey: signerPubkey } = getTrustAttributes(state, signedById!);

        if (invitePubkey) {
          // ensure pubkey is signed by invite pubkey, and invite pubkey is signed by signer
          // verification throws error if invalid
          await Promise.all([
            verifyPublicKeySignature({
              signedPubkey: pubkey,
              signerPubkey: invitePubkey,
            }),
            verifyPublicKeySignature({
              signedPubkey: invitePubkey,
              signerPubkey,
            }),
          ]);
        } else {
          // ensure pubkey is signed by signer
          // verification throws error if invalid
          await verifyPublicKeySignature({
            signedPubkey: pubkey,
            signerPubkey,
          });
        }
      }

      if (
        getAlreadyTrusted(
          state,
          pubkeyId,
          keyableType,
          pubkey,
          invitePubkey,
          signedByPubkeyId,
          isRoot
        )
      ) {
        for (let [verifiedPubkeyId, verifiedTrustedPubkey] of verifyingChain) {
          const res = await dispatch(
            {
              type: Client.ActionType.ADD_TRUSTED_SESSION_PUBKEY,
              payload: {
                id: verifiedPubkeyId,
                trusted: verifiedTrustedPubkey as Trust.TrustedSessionPubkey,
              },
            },
            context
          );
          if (res.success) {
            state = res.state;
          }
        }

        return state;
      } else {
        if (!signedById || !signedByPubkeyId) {
          log("Keyable could not be verified.", {
            currentKeyableId,
            pubkeyId,
            keyableType,
            signedById,
            signedByPubkeyId,
            pubkey,
            invitePubkey,
            isRoot,
            verifyingChain,
          });
          throw new Error("Keyable could not be verified.");
        }

        verifyingChain.push([
          pubkeyId,
          [keyableType, pubkey, invitePubkey, signedByPubkeyId].filter(
            Boolean
          ) as Trust.TrustedSessionPubkey,
        ]);

        currentKeyableId = signedById;
      }
    }
    throw new Error("Keyable could not be verified.");
  },
  processRevocationRequestsIfNeeded = async (
    state: Client.State,
    context: Client.Context
  ) => {
    // this function is intended to be called asynchronously by the handler after graph updates, not awaited (doing so would block state updates/rendering for no good reason)
    let { pubkeyRevocationRequests } = graphTypes(state.graph);

    if (
      !state.isProcessingRevocationRequests &&
      pubkeyRevocationRequests.length > 0
    ) {
      return dispatch(
        {
          type: Client.ActionType.PROCESS_REVOCATION_REQUESTS,
        },
        context
      );
    }
  },
  processRootPubkeyReplacementsIfNeeded = async (
    state: Client.State,
    context: Client.Context,
    commitTrusted?: true
  ) => {
    const { rootPubkeyReplacements } = graphTypes(state.graph);

    if (
      !state.isProcessingRootPubkeyReplacements &&
      rootPubkeyReplacements.length > 0
    ) {
      return dispatch(
        {
          type: Client.ActionType.PROCESS_ROOT_PUBKEY_REPLACEMENTS,
          payload: { commitTrusted },
        },
        context
      );
    }
  },
  clearRevokedOrOutdatedSessionPubkeys = (
    state: Client.State,
    context: Client.Context
  ) => {
    if (R.isEmpty(state.trustedSessionPubkeys)) {
      return;
    }
    const keyablesByPubkeyId = getKeyablesByPubkeyId(state.graph);

    for (let trustedPubkeyId in state.trustedSessionPubkeys) {
      let shouldClear = false;

      if (keyablesByPubkeyId[trustedPubkeyId]) {
        // apart from clearing keys that have been revoked and are no longer in the graph, we should also clear any whose trust attributes have been updated

        const keyableId = keyablesByPubkeyId[trustedPubkeyId].id;

        const {
          pubkeyId,
          keyableType,
          signedByPubkeyId,
          pubkey,
          invitePubkey,
          isRoot,
        } = getTrustAttributes(state, keyableId);

        shouldClear = !getAlreadyTrusted(
          state,
          pubkeyId,
          keyableType,
          pubkey,
          invitePubkey,
          signedByPubkeyId,
          isRoot
        );
      } else {
        shouldClear = true;
      }

      if (shouldClear) {
        dispatch(
          {
            type: Client.ActionType.CLEAR_TRUSTED_SESSION_PUBKEY,
            payload: { id: trustedPubkeyId },
          },
          context
        );
      }
    }
  },
  verifyRootPubkeyReplacement = async (
    state: Client.State,
    replacement: Model.RootPubkeyReplacement
  ): Promise<true> => {
    if (!state.trustedRoot) {
      throw new Error("trustedRoot undefined");
    }

    const replacingTrustChain = (await verifyJson({
      signed: replacement.signedReplacingTrustChain.data,
      pubkey: replacement.replacingPubkey,
    })) as Trust.UserTrustChain;

    return verifyPubkeyWithTrustChain(
      replacement.replacingPubkey,
      state.trustedRoot,
      replacingTrustChain
    );
  },
  verifyPubkeyWithTrustChain = async (
    verifyPubkey: Crypto.Pubkey,
    trustedRoot: Trust.RootTrustChain,
    trustChain: Trust.UserTrustChain
  ): Promise<true> => {
    const checked: { [id: string]: true } = {};

    let currentPubkey = verifyPubkey;
    let currentPubkeyId = getPubkeyHash(currentPubkey);

    while (true) {
      if (checked[currentPubkeyId]) {
        throw new Error(
          "Circular trust chain. Couldn't find trusted root pubkey."
        );
      }

      if (trustedRoot[currentPubkeyId]) {
        return true;
      }

      const trusted = trustChain[currentPubkeyId];

      if (!trusted) {
        throw new Error("Trusted pubkey chain broken.");
      }

      let trustedSignerId: string;
      let invitePubkey: Crypto.Pubkey | undefined;

      if (trusted[0] == "orgUserDevice") {
        invitePubkey = trusted[2];
        trustedSignerId = trusted[3];
      } else {
        trustedSignerId = trusted[2];
      }

      const trustedSigner = (trustChain[trustedSignerId] ??
        trustedRoot[trustedSignerId]) as
        | Trust.TrustedUserPubkey
        | Trust.TrustedRootPubkey;

      if (!trustedSigner) {
        throw new Error("Trusted pubkey chain broken.");
      }

      const signerPubkey = trustedSigner[1];

      if (invitePubkey) {
        // ensure pubkey is signed by invite pubkey, and invite pubkey is signed by signer
        // verification throws error if invalid
        await Promise.all([
          verifyPublicKeySignature({
            signedPubkey: currentPubkey,
            signerPubkey: invitePubkey,
          }),
          verifyPublicKeySignature({
            signedPubkey: invitePubkey,
            signerPubkey,
          }),
        ]);
      } else {
        // ensure pubkey is signed by signer
        // verification throws error if invalid
        await verifyPublicKeySignature({
          signedPubkey: currentPubkey,
          signerPubkey,
        });
      }

      if (trustedSigner[0] == "root") {
        return true;
      } else {
        currentPubkey = signerPubkey;
        currentPubkeyId = trustedSignerId;
      }
    }

    throw new Error("Unreachable");
  };
