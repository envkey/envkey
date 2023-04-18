import { clientAction } from "../handler";
import { Api } from "@core/types";
import { statusProducers } from "../lib/status";

clientAction<Api.Action.RequestActions["UpdateLicense"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.UPDATE_LICENSE,
  loggableType: "orgAction",
  loggableType2: "billingAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...statusProducers("isUpdatingLicense", "updateLicenseError"),
});

clientAction<Api.Action.RequestActions["FetchOrgStats"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.FETCH_ORG_STATS,
  loggableType: "authAction",
  authenticated: true,
  ...statusProducers("isFetchingOrgStats", "fetchOrgStatsError"),
  successStateProducer: (draft, { payload: { orgStats } }) => {
    draft.orgStats = orgStats;
  },
});

clientAction<Api.Action.RequestActions["CloudBillingSubscribeProduct"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.CLOUD_BILLING_SUBSCRIBE_PRODUCT,
  loggableType: "orgAction",
  loggableType2: "billingAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...statusProducers(
    "cloudBillingIsSubscribingProduct",
    "cloudBillingSubscribeProductError"
  ),
});

clientAction<
  Api.Action.RequestActions["CloudBillingUpdateSubscriptionQuantity"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.CLOUD_BILLING_UPDATE_SUBSCRIPTION_QUANTITY,
  loggableType: "orgAction",
  loggableType2: "billingAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...statusProducers(
    "cloudBillingIsUpdatingSubscriptionQuantity",
    "cloudBillingUpdateSubscriptionQuantityError"
  ),
});

clientAction<Api.Action.RequestActions["CloudBillingCancelSubscription"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.CLOUD_BILLING_CANCEL_SUBSCRIPTION,
  loggableType: "orgAction",
  loggableType2: "billingAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...statusProducers(
    "cloudBillingIsCancelingSubscription",
    "cloudBillingCancelSubscriptionError"
  ),
});

clientAction<Api.Action.RequestActions["CloudBillingUpdatePaymentMethod"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.CLOUD_BILLING_UPDATE_PAYMENT_METHOD,
  loggableType: "orgAction",
  loggableType2: "billingAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...statusProducers(
    "cloudBillingIsUpdatingPaymentMethod",
    "cloudBillingUpdatePaymentMethodError"
  ),
});

clientAction<Api.Action.RequestActions["CloudBillingUpdateSettings"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.CLOUD_BILLING_UPDATE_SETTINGS,
  loggableType: "orgAction",
  loggableType2: "billingAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...statusProducers(
    "cloudBillingIsUpdatingSettings",
    "cloudBillingUpdateSettingsError"
  ),
});

clientAction<Api.Action.RequestActions["CloudBillingFetchInvoices"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.CLOUD_BILLING_FETCH_INVOICES,
  loggableType: "authAction",
  loggableType2: "billingAction",
  authenticated: true,
  ...statusProducers(
    "cloudBillingIsFetchingInvoices",
    "cloudBillingFetchInvoicesError"
  ),
  successStateProducer: (draft, { payload: { invoices } }) => {
    draft.cloudBillingInvoices = invoices;
  },
});

clientAction<Api.Action.RequestActions["CloudBillingCheckPromotionCode"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.CLOUD_BILLING_CHECK_PROMOTION_CODE,
  loggableType: "authAction",
  loggableType2: "billingAction",
  authenticated: true,
  stateProducer: (draft, action) => {
    draft.cloudBillingCheckPromotionCodeError = undefined;
    draft.cloudBillingPromotionCode = undefined;
    draft.cloudBillingIsCheckingPromotionCode = true;
  },
  failureStateProducer: (draft, action) => {
    draft.cloudBillingCheckPromotionCodeError = action.payload;
  },
  endStateProducer: (draft, action) => {
    draft.cloudBillingIsCheckingPromotionCode = undefined;
  },
  successStateProducer: (
    draft,
    { payload: { exists, amountOff, percentOff }, meta }
  ) => {
    if (exists) {
      draft.cloudBillingPromotionCode = {
        code: meta.rootAction.payload.code,
        amountOff,
        percentOff,
      };
    } else {
      draft.cloudBillingPromotionCode = undefined;
    }
  },
});

clientAction<Api.Action.RequestActions["CloudBillingLoadProducts"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.CLOUD_BILLING_LOAD_PRODUCTS,
  loggableType: "hostAction",
  authenticated: undefined,
  ...statusProducers("isLoadingCloudProducts", "loadCloudProductsError"),
  successStateProducer: (draft, { payload: { products, prices } }) => {
    draft.cloudProducts = products;
    draft.cloudPrices = prices;
  },
});

clientAction<Api.Action.RequestActions["CloudBillingCheckV1PendingUpgrade"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.CLOUD_BILLING_CHECK_V1_PENDING_UPGRADE,
  loggableType: "hostAction",
  authenticated: undefined,
  ...statusProducers(
    "isCheckingV1PendingUpgrade",
    "checkV1PendingUpgradeError"
  ),
  successStateProducer: (draft, { payload: { hasPendingUpgrade } }) => {
    draft.hasV1PendingUpgrade = hasPendingUpgrade;
  },
});
