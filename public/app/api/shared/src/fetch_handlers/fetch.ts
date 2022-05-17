import { updateTrustedRoot } from "../models/crypto";
import {
  apiAction,
  getThrottleRequestFn,
  getThrottleResponseFn,
} from "../handler";
import { Api, Billing, Model } from "@core/types";
import { getFetchResponse, getHandlerContext, getTargetIds } from "../fetch";
import { getDb, query } from "../db";
import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import { sha256 } from "@core/lib/crypto/utils";
import * as R from "ramda";
import {
  getScope,
  getGeneratedEnvkeyEncryptedKeyOrBlobComposite,
} from "@core/lib/blob";
import { log } from "@core/lib/utils/logger";
import { env } from "../env";
import { getOrg } from "../models/orgs";
import { getOrgStats, getVerifyLicenseFn } from "../auth";
import { ipMatchesAny } from "@core/lib/utils/ip";

apiAction<
  Api.Action.RequestActions["FetchEnvkey"],
  Api.Net.ApiResultTypes["FetchEnvkey"]
>({
  type: Api.ActionType.FETCH_ENVKEY,
  graphAction: false,
  authenticated: false,
  handler: async ({ type, payload }, now, requestParams, transactionConn) => {
    const { envkeyIdPart } = payload;
    if (!envkeyIdPart || envkeyIdPart.includes("-")) {
      throw new Api.ApiError("not found", 404);
    }
    const [generatedEnvkey, encryptedKeys] = await Promise.all([
      getDb<Api.Db.GeneratedEnvkey>(envkeyIdPart, { transactionConn }),

      query<Api.Db.GeneratedEnvkeyEncryptedKey>({
        pkey: ["envkey", envkeyIdPart].join("|"),
        omitData: requestParams.method == "head",
        transactionConn,
      }),
    ]);

    if (
      !generatedEnvkey ||
      generatedEnvkey.deletedAt ||
      sha256(envkeyIdPart) != generatedEnvkey.envkeyIdPartHash
    ) {
      throw new Api.ApiError("not found", 404);
    }

    if (
      generatedEnvkey.allowedIps &&
      !ipMatchesAny(requestParams.ip, generatedEnvkey.allowedIps)
    ) {
      log("", {
        "generatedEnvkey.allowedIps": generatedEnvkey.allowedIps,
        ip: requestParams.ip,
      });

      throw new Api.ApiError("not found", 404);
    }

    const blobScopes = R.uniq(
      encryptedKeys.map(
        (encryptedKey) =>
          getScope({
            blobType: "env",
            envParentId: encryptedKey.blockId ?? encryptedKey.envParentId,
            environmentId: encryptedKey.environmentId,
            envPart: "env",
          })!
      )
    );

    const orgId = generatedEnvkey.pkey;

    const [allRootPubkeyReplacements, blobs] = await Promise.all([
      query<Api.Db.RootPubkeyReplacement>({
        pkey: generatedEnvkey.pkey,
        scope: "g|rootPubkeyReplacement|",
        sortBy: "createdAt",
        transactionConn,
      }),
      encryptedKeys.length > 0
        ? query<Api.Db.EncryptedBlob>({
            pkey: ["encryptedBlobs", orgId].join("|"),
            scope: blobScopes,
            transactionConn,
          })
        : Promise.resolve([]),
    ]);

    let org: Api.Db.Org | undefined;
    let orgStats: Model.OrgStats | undefined;
    let license: Billing.License | undefined;
    if (env.IS_CLOUD) {
      const throttleRequestFn = getThrottleRequestFn();
      if (!throttleRequestFn) {
        throw new Api.ApiError(
          "throttle request function wasn't registered",
          500
        );
      }

      [org, orgStats] = await Promise.all([
        getOrg(orgId, transactionConn),
        getOrgStats(orgId, transactionConn),
      ]);

      if (!org || !orgStats) {
        throw new Api.ApiError("couldn't fetch org and org stats", 500);
      }

      const verifyLicenseFn = getVerifyLicenseFn();
      license = verifyLicenseFn(orgId, org.signedLicense, now);

      // FETCH_ENVKEY requests are tiny so we don't need to throttle based on requestBytes
      await throttleRequestFn(org, orgStats, license, 0, false);
    }

    const response = getFetchResponse(
      generatedEnvkey,
      encryptedKeys,
      R.indexBy(getGeneratedEnvkeyEncryptedKeyOrBlobComposite, blobs),
      allRootPubkeyReplacements.filter(
        (replacement) =>
          !replacement.deletedAt &&
          replacement.processedAtById[generatedEnvkey.id] === false
      )
    );

    const responseBytes = Buffer.byteLength(JSON.stringify(response), "utf8");

    if (env.IS_CLOUD) {
      const throttleResponseFn = getThrottleResponseFn();
      if (!throttleResponseFn) {
        throw new Api.ApiError(
          "throttle response function wasn't registered",
          500
        );
      }
      if (!org || !orgStats || !license) {
        throw new Api.ApiError("org, orgStats, and license required", 500);
      }
      await throttleResponseFn(org, orgStats, license, responseBytes);
    }

    return {
      type: "handlerResult",
      response,
      responseBytes,
      handlerContext: getHandlerContext(generatedEnvkey, encryptedKeys),
      ...getTargetIds(generatedEnvkey, encryptedKeys),
    };
  },
});

apiAction<
  Api.Action.RequestActions["CheckEnvkey"],
  Api.Net.ApiResultTypes["CheckEnvkey"]
>({
  type: Api.ActionType.CHECK_ENVKEY,
  graphAction: false,
  authenticated: false,
  handler: async ({ type, payload }, now, requestParams, transactionConn) => {
    const { envkeyIdPart } = payload;
    if (!envkeyIdPart || envkeyIdPart.includes("-")) {
      throw new Api.ApiError("not found", 404);
    }
    const generatedEnvkey = await getDb<Api.Db.GeneratedEnvkey>(envkeyIdPart, {
      transactionConn,
    });

    if (
      !generatedEnvkey ||
      generatedEnvkey.deletedAt ||
      sha256(envkeyIdPart) != generatedEnvkey.envkeyIdPartHash
    ) {
      throw new Api.ApiError("not found", 404);
    }

    const keyableParent = await getDb<Api.Db.KeyableParent>(
      generatedEnvkey.keyableParentId,
      {
        transactionConn,
      }
    );

    if (!keyableParent || keyableParent.deletedAt) {
      throw new Api.ApiError("not found", 404);
    }

    return {
      type: "handlerResult",
      response: {
        type: "checkResult",
        appId: generatedEnvkey.appId,
        orgId: generatedEnvkey.pkey,
      },
      handlerContext: {
        type,
        orgId: generatedEnvkey.pkey,
        actorId:
          keyableParent.type == "localKey"
            ? keyableParent.userId
            : keyableParent.id,
        deviceId:
          keyableParent.type == "localKey" ? keyableParent.deviceId : undefined,
        generatedEnvkey,
      },
      logTargetIds: [generatedEnvkey.appId],
    };
  },
});

apiAction<
  Api.Action.RequestActions["EnvkeyFetchUpdateTrustedRootPubkey"],
  Api.Net.ApiResultTypes["EnvkeyFetchUpdateTrustedRootPubkey"]
>({
  type: Api.ActionType.ENVKEY_FETCH_UPDATE_TRUSTED_ROOT_PUBKEY,
  authenticated: false,
  graphAction: false,
  handler: async ({ type, payload }, now, requestParams, transactionConn) => {
    const generatedEnvkey = await getDb<Api.Db.GeneratedEnvkey>(
      payload.envkeyIdPart,
      { transactionConn }
    );

    if (!generatedEnvkey) {
      throw new Api.ApiError("not found", 404);
    }

    const signedData = R.props(
      ["envkeyIdPart", "orgId", "replacementIds", "signedTrustedRoot"],
      payload
    );
    if (
      !nacl.sign.detached.verify(
        naclUtil.decodeUTF8(JSON.stringify(signedData)),
        naclUtil.decodeBase64(payload.signature),
        naclUtil.decodeBase64(generatedEnvkey.pubkey.keys.signingKey)
      )
    ) {
      throw new Api.ApiError("invalid signature", 401);
    }

    const updateRes = await updateTrustedRoot(
      payload.orgId,
      generatedEnvkey,
      payload.replacementIds,
      payload.signedTrustedRoot,
      now,
      transactionConn
    );

    return {
      ...updateRes,
      handlerContext: {
        type,
        actorId: generatedEnvkey.keyableParentId,
      },
      logTargetIds: [generatedEnvkey.id],
    };
  },
});
