import { getDb } from "../db";
import { Api } from "@core/types";
import { PoolConnection } from "mysql2/promise";
import * as graphKey from "../graph_key";

// SCIM candidate users are not in the graph
export const scimCandidateDbKey = (params: {
  orgId: string;
  providerId: string;
  userCandidateId: string;
}): { pkey: string; skey: string } => {
  const { orgId, providerId, userCandidateId } = params;
  return {
    pkey: providerId,
    skey: "scimUserCandidate" + "|" + orgId + "|" + userCandidateId,
  };
};

export const mustGetScimProvider = async (
  providerId: string,
  transactionConn: PoolConnection | undefined
): Promise<Api.Db.ScimProvisioningProvider> => {
  const pointer = await getDb<Api.Db.ScimProvisioningProviderPointer>(
    {
      pkey: providerId,
      skey: "scimProvisioningProviderPointer",
    },
    { transactionConn }
  );
  if (!pointer) {
    const msg = `A SCIM provider was not found with the id ${providerId}`;
    const status = 404;

    if (transactionConn) {
      throw new Api.ApiError(msg, status);
    } else {
      throw new Api.ApiError(msg, status);
    }
  }
  const provider = await getDb<Api.Db.ScimProvisioningProvider>(
    graphKey.scimProvisioningProvider(pointer.orgId, providerId),
    { transactionConn }
  );
  if (!provider) {
    const msg = "The provisioning provider lookup failed";
    const status = 500;
    if (transactionConn) {
      throw new Api.ApiError(msg, status);
    } else {
      throw new Api.ApiError(msg, status);
    }
  }
  return provider;
};
