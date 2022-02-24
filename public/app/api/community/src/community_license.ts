import { Api } from "@core/types";
import { env } from "../../shared/src/env";

export const getCommunityLicense: Api.VerifyLicenseFn = () => ({
  type: "license",
  id: "community-license",
  env: env.NODE_ENV,
  orgBillingId: "community-billing-id",
  plan: "free",
  hostType: "community",
  expiresAt: -1,
  maxDevices: -1,
  maxServerEnvkeys: -1,
  createdAt: 0,
});
