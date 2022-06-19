import { Api } from "@core/types";

let billingIdFn: ((orgId: string) => string) | undefined;

export const registerBillingIdFn = (fn: typeof billingIdFn) => {
  billingIdFn = fn;
};

export const getOrgBillingId = (orgId: string) =>
  billingIdFn ? billingIdFn(orgId) : "";

export const verifySignedLicense: Api.VerifyLicenseFn = (
  orgId,
  signedLicense,
  now,
  enforceExpiration = false
) => {
  if (!verifyLicenseFn) {
    throw new Api.ApiError("verifyLicenseFn not registered", 500);
  }
  return verifyLicenseFn(orgId, signedLicense, now, enforceExpiration);
};

let verifyLicenseFn: Api.VerifyLicenseFn | undefined;

export const registerVerifyLicenseFn = (fn: Api.VerifyLicenseFn) => {
  verifyLicenseFn = fn;
};

export const getVerifyLicenseFn = () => {
  if (!verifyLicenseFn) {
    throw new Api.ApiError("verifyLicenseFn not registered", 500);
  }
  return verifyLicenseFn;
};
