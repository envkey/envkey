import { memoizeShallowAll as memoize } from "@core/lib/utils/memoize";
import { sha256 } from "@core/lib/crypto/utils";
import { env } from "../../../../../public/app/api/shared/src/env";

export const getOrgBillingId = memoize((orgId: string) =>
  sha256(
    JSON.stringify([orgId, env.DEPLOYMENT_TAG, env.DOMAIN].filter(Boolean))
  )
);
