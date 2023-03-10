import { Api, Blob } from "@core/types";
import {
  userEncryptedKeyPkey,
  encryptedBlobPkey,
  getScope,
  getUserEncryptedKeyOrBlobComposite,
} from "@core/lib/blob";
import * as R from "ramda";
import { query } from "../db";
import { indexBy, groupBy } from "@core/lib/utils/array";

export const getUserEncryptedKeys = async (
  params:
    | Blob.UserEncryptedKeyPkeyWithScopeParams
    | Blob.UserEncryptedKeyPkeyWithScopeParams[],
  queryParams: Omit<
    Api.Db.QueryParams,
    "pkey" | "scope" | "pkeyScope" | "pkeysWithScopes"
  >
) => {
  let toQuery: Api.Db.QueryParams;

  if (Array.isArray(params)) {
    const pkeysWithScopes = params.map((p) => ({
      pkey: userEncryptedKeyPkey(p),
      scope: getScope(p),
    }));
    toQuery = {
      pkeysWithScopes,
      ...queryParams,
    };
  } else {
    const pkey = userEncryptedKeyPkey(params);
    const scope = getScope(params);
    toQuery = {
      pkey,
      scope,
      ...queryParams,
    };
  }

  return query<Api.Db.UserEncryptedKey>(toQuery);
};
export const getEnvEncryptedKeys = (
  params:
    | Blob.UserEncryptedKeyPkeyWithScopeParams
    | Blob.UserEncryptedKeyPkeyWithScopeParams[],
  queryParams: Pick<Api.Db.QueryParams, "transactionConn">
) =>
  getUserEncryptedKeys(
    Array.isArray(params)
      ? params.map((p) => ({ ...p, blobType: "env" }))
      : {
          ...params,
          blobType: "env",
        },
    queryParams
  ).then((encryptedKeys) => {
    return indexBy(
      getUserEncryptedKeyOrBlobComposite,
      encryptedKeys.map(R.omit(["pkey", "skey"]))
    );
  }) as Promise<Blob.UserEncryptedKeysByEnvironmentIdOrComposite>;

type ChangesetEncryptedKeysScopeParams = Omit<
  Blob.UserEncryptedKeyPkeyWithScopeParams,
  "blobType"
> &
  Api.Net.FetchChangesetOptions;
export const getChangesetEncryptedKeys = (
  params:
    | ChangesetEncryptedKeysScopeParams
    | ChangesetEncryptedKeysScopeParams[],
  queryParams: Pick<Api.Db.QueryParams, "transactionConn">
) => {
  const paramsWithBlobType = Array.isArray(params)
    ? params.map(
        (p) =>
          ({
            ...p,
            blobType: "changeset",
          } as Blob.UserEncryptedKeyPkeyWithScopeParams)
      )
    : ({
        ...params,
        blobType: "changeset",
      } as Blob.UserEncryptedKeyPkeyWithScopeParams);

  return getUserEncryptedKeys(paramsWithBlobType, {
    ...queryParams,
    createdAfter: undefined,
    sortBy: "createdAt",
  }).then((encryptedKeys) =>
    indexBy(
      ({ environmentId }) => environmentId!,
      encryptedKeys.map(R.omit(["pkey", "skey"]))
    )
  ) as Promise<Blob.UserEncryptedChangesetKeysByEnvironmentId>;
};

export const getEncryptedBlobs = async (
  params:
    | Blob.EncryptedBlobPkeyWithScopeParams
    | Blob.EncryptedBlobPkeyWithScopeParams[],
  queryParams: Omit<
    Api.Db.QueryParams,
    "pkey" | "scope" | "pkeyScope" | "pkeysWithScopes"
  >
) => {
  let toQuery: Api.Db.QueryParams;

  if (Array.isArray(params)) {
    const pkeysWithScopes = params.map((p) => ({
      pkey: encryptedBlobPkey(p),
      scope: getScope(p),
    }));

    const createdAfterForParams = params
      .map((p) => "createdAfter" in p && p.createdAfter)
      .filter((p): p is number => typeof p == "number");

    const createdAfter =
      createdAfterForParams.length > 0
        ? Math.min(...createdAfterForParams)
        : undefined;

    toQuery = {
      pkeysWithScopes,
      ...queryParams,
      createdAfter,
    };
  } else {
    const pkey = encryptedBlobPkey(params);
    const scope = getScope(params);
    toQuery = {
      pkey,
      scope,
      ...queryParams,
      createdAfter: "createdAfter" in params ? params.createdAfter : undefined,
    };
  }

  return query<Api.Db.EncryptedBlob>(toQuery);
};
export const getEnvEncryptedBlobs = (
  params:
    | Blob.EncryptedBlobPkeyWithScopeParams
    | Blob.EncryptedBlobPkeyWithScopeParams[],
  queryParams: Pick<Api.Db.QueryParams, "transactionConn">
) =>
  getEncryptedBlobs(
    Array.isArray(params)
      ? params.map(
          (p) =>
            ({ ...p, blobType: "env" } as Blob.EncryptedBlobPkeyParams &
              Blob.ScopeParams)
        )
      : ({
          ...params,
          blobType: "env",
        } as Blob.EncryptedBlobPkeyParams & Blob.ScopeParams),
    queryParams
  ).then((blobs) => {
    return indexBy(
      getUserEncryptedKeyOrBlobComposite,
      blobs.map(R.omit(["pkey", "skey"]))
    );
  }) as Promise<Blob.UserEncryptedBlobsByComposite>;

type ChangesetBlobsScopeParams = Omit<
  Blob.EncryptedBlobPkeyWithScopeParams,
  "blobType"
> &
  Api.Net.FetchChangesetOptions;
export const getChangesetEncryptedBlobs = (
  params: ChangesetBlobsScopeParams | ChangesetBlobsScopeParams[],
  queryParams: Pick<Api.Db.QueryParams, "transactionConn">
) => {
  const paramsWithBlobType = Array.isArray(params)
    ? params.map(
        (p) =>
          ({
            ...p,
            blobType: "changeset",
          } as Blob.EncryptedBlobPkeyWithScopeParams)
      )
    : ({
        ...params,
        blobType: "changeset",
      } as Blob.EncryptedBlobPkeyWithScopeParams);

  return getEncryptedBlobs(paramsWithBlobType, {
    ...queryParams,
    createdAfter:
      ("createdAfter" in paramsWithBlobType &&
        paramsWithBlobType.createdAfter) ||
      undefined,
    sortBy: "createdAt",
  }).then((blobs) => {
    return groupBy(
      ({ environmentId }) => environmentId!,
      blobs.map(R.omit(["pkey", "skey"]))
    );
  }) as Promise<Blob.UserEncryptedBlobsByEnvironmentId>;
};
