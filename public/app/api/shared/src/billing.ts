let billingIdFn: ((orgId: string) => string) | undefined;

export const registerBillingIdFn = (fn: typeof billingIdFn) => {
  billingIdFn = fn;
};

export const getOrgBillingId = (orgId: string) =>
  billingIdFn ? billingIdFn(orgId) : "";
