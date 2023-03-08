import { Api, Auth } from "@core/types";
import { PoolConnection } from "mysql2/promise";

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

let canAutoUpgradeLicenseFn:
  | ((orgGraph: Api.Graph.OrgGraph) => Promise<boolean>)
  | undefined;
export const registerCanAutoUpgradeLicenseFn = (
  fn: typeof canAutoUpgradeLicenseFn
) => {
  canAutoUpgradeLicenseFn = fn;
};
export const getCanAutoUpgradeLicenseFn = () => {
  return canAutoUpgradeLicenseFn;
};

let resolveProductAndQuantityFn:
  | ((
      transactionConn: PoolConnection,
      auth: Auth.AuthContext,
      orgGraph: Api.Graph.OrgGraph,
      addOrRemove: "add-user" | "remove-user",
      now: number
    ) => Promise<[Api.Graph.OrgGraph, Api.Db.ObjectTransactionItems]>)
  | undefined;
export const registerResolveProductAndQuantityFn = (
  fn: typeof resolveProductAndQuantityFn
) => {
  resolveProductAndQuantityFn = fn;
};
export const getResolveProductAndQuantityFn = () => {
  return resolveProductAndQuantityFn;
};

let cancelSubscriptionFn:
  | ((params: {
      stripeCustomerId: string;
      stripeSubscriptionId: string;
      removePaymentMethods: boolean;
    }) => Promise<any>)
  | undefined;
export const registerCancelSubscriptionFn = (
  fn: typeof cancelSubscriptionFn
) => {
  cancelSubscriptionFn = fn;
};
export const getCancelSubscriptionFn = () => {
  return cancelSubscriptionFn;
};
