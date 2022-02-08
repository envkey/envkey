import { Api } from "@core/types";
import { query } from "@api_shared/db";

export const getRootPubkeyReplacements = async (
  orgId: string,
  createdAfter: number
) =>
  query<Api.Db.RootPubkeyReplacement>({
    pkey: orgId,
    scope: "g|rootPubkeyReplacement|",
    createdAfter,
    deleted: "any",
    transactionConn: undefined,
  });
