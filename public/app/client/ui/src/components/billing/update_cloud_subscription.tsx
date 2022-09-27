import React, { useState, useMemo, useCallback, useEffect } from "react";
import { OrgComponent } from "@ui_types";
import { Billing, Api } from "@core/types";
import { updatePaymentSource } from "@ui_lib/billing";
import { ChoosePlan } from "./choose_plan";
import { SvgImage, SmallLoader } from "@images";
import * as g from "@core/lib/graph";
import { formatUsd } from "@core/lib/utils/currency";
import * as R from "ramda";
import { logAndAlertError } from "@ui_lib/errors";
import * as styles from "@styles";

let promotionCodeTimeout: ReturnType<typeof setTimeout> | undefined = undefined;

export const UpdateCloudSubscription: OrgComponent = (props) => {
  const { graph, graphUpdatedAt } = props.core;
  const currentUserId = props.ui.loadedAccountId!;

  const { org, subscription, pricesByComposite, paymentSource } =
    useMemo(() => {
      const {
        org,
        subscription: sub,
        prices,
        paymentSource,
      } = g.graphTypes(graph);

      const pricesByComposite = R.indexBy(
        (price) => `${price.productId}|${price.interval}`,
        prices
      ) as Record<string, Billing.Price>;

      return { org, subscription: sub, pricesByComposite, paymentSource };
    }, [graphUpdatedAt, currentUserId]);

  const currentProduct = subscription
    ? (graph[subscription.productId] as Billing.Product)
    : undefined;
  const currentPrice = subscription
    ? (graph[subscription.priceId] as Billing.Price)
    : undefined;

  const [showChoosePlan, setShowChoosePlan] = useState(!Boolean(subscription));

  const [billingInterval, setBillingInterval] = useState<
    Billing.Price["interval"]
  >(currentPrice?.interval ?? "year");

  const [selectedProductId, setSelectedProductId] = useState(
    currentProduct?.id
  );

  const [quantity, setQuantity] = useState(subscription?.quantity ?? 1);

  const [promotionCode, setPromotionCode] = useState("");

  const [isCheckingPromotionCode, setIsCheckingPromotionCode] = useState(false);

  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (
      isCheckingPromotionCode &&
      !props.core.cloudBillingIsCheckingPromotionCode
    ) {
      setIsCheckingPromotionCode(false);
    }
  }, [props.core.cloudBillingIsCheckingPromotionCode]);

  useEffect(() => {
    if (
      updating &&
      !(
        props.core.cloudBillingIsSubscribingProduct ||
        props.core.cloudBillingIsUpdatingSubscriptionQuantity ||
        props.core.cloudBillingIsCancelingSubscription
      )
    ) {
      props.history.replace(props.orgRoute("/my-org/billing"));
    }
  }, [
    props.core.cloudBillingIsSubscribingProduct,
    props.core.cloudBillingIsUpdatingSubscriptionQuantity,
    props.core.cloudBillingIsCancelingSubscription,
  ]);

  const selectedProduct = selectedProductId
    ? (graph[selectedProductId] as Billing.Product)
    : undefined;
  const selectedPrice = selectedProductId
    ? pricesByComposite[`${selectedProductId}|${billingInterval}`]
    : undefined;

  const displayPrice = selectedPrice
    ? (selectedPrice.amount / (selectedPrice.interval == "year" ? 12 : 1)) *
      quantity
    : 0;

  const priceString = selectedPrice
    ? formatUsd(displayPrice) +
      ` USD per month${
        selectedPrice.interval == "year"
          ? ` (${formatUsd(selectedPrice.amount * quantity)} USD per year)`
          : ""
      }`
    : "Free";

  const percentOff =
    subscription?.percentOff ??
    props.core.cloudBillingPromotionCode?.percentOff;
  const amountOff =
    subscription?.amountOff ?? props.core.cloudBillingPromotionCode?.amountOff;

  let discount = 0;
  if (percentOff || amountOff) {
    discount = percentOff ? (percentOff / 100) * displayPrice : amountOff!;
  }
  const totalString =
    selectedPrice && discount
      ? formatUsd(displayPrice - discount) +
        ` USD per month${
          selectedPrice.interval == "year"
            ? ` (${formatUsd(
                selectedPrice.amount * quantity - discount * 12
              )} USD per year)`
            : ""
        }`
      : "Free";

  const hasSubscriptionChange =
    currentProduct?.id != selectedProductId ||
    currentPrice?.id != selectedPrice?.id;
  const hasChange =
    hasSubscriptionChange || (subscription?.quantity ?? 1) != quantity;

  const hasValidPromotionCode =
    props.core.cloudBillingPromotionCode &&
    promotionCode &&
    props.core.cloudBillingPromotionCode.code == promotionCode;

  const addPaymentSourceIfNeeded = useCallback(
    async (error?: string): Promise<boolean> => {
      if (!paymentSource && selectedProduct && selectedPrice) {
        const token = await updatePaymentSource({
          data: { error },
        });

        if (token) {
          const res = await props.dispatch({
            type: Api.ActionType.CLOUD_BILLING_UPDATE_PAYMENT_METHOD,
            payload: { token },
          });

          if (res.success) {
            return true;
          } else {
            const payload = (res.resultAction as any).payload;

            if (payload.type == "stripeError") {
              return addPaymentSourceIfNeeded(payload.errorReason);
            }

            logAndAlertError(
              "There was an error updating your org's payment method.",
              payload
            );
          }
        } else {
          return false;
        }
      }

      return true;
    },
    [graphUpdatedAt, paymentSource?.id, selectedProduct?.id, selectedPrice?.id]
  );

  const dispatchSubscriptionAction = useCallback(async () => {
    if (
      selectedProductId &&
      currentProduct?.id == selectedProduct?.id &&
      currentPrice?.id == selectedPrice?.id &&
      subscription &&
      subscription.quantity != quantity
    ) {
      const res = await props.dispatch({
        type: Api.ActionType.CLOUD_BILLING_UPDATE_SUBSCRIPTION_QUANTITY,
        payload: {
          quantity,
        },
      });
      if (!res.success) {
        logAndAlertError(
          `There was a problem updating your subscription.`,
          (res.resultAction as any)?.payload
        );
      }
    } else if (
      selectedProduct &&
      selectedPrice &&
      (selectedProduct.id != currentProduct?.id ||
        selectedPrice.id != currentPrice?.id)
    ) {
      const res = await props.dispatch({
        type: Api.ActionType.CLOUD_BILLING_SUBSCRIBE_PRODUCT,
        payload: {
          productId: selectedProduct.id,
          priceId: selectedPrice.id,
          quantity,
          promotionCode:
            promotionCode && hasValidPromotionCode ? promotionCode : undefined,
        },
      });
      if (!res.success) {
        logAndAlertError(
          `There was a problem updating your subscription.`,
          (res.resultAction as any)?.payload
        );
      }
    } else if (currentProduct && !selectedProductId) {
      const res = await props.dispatch({
        type: Api.ActionType.CLOUD_BILLING_CANCEL_SUBSCRIPTION,
        payload: {},
      });
      if (!res.success) {
        logAndAlertError(
          `There was a problem downgrading your subscription.`,
          (res.resultAction as any)?.payload
        );
      }
    }
  }, [
    graphUpdatedAt,
    selectedProduct?.id,
    selectedPrice?.id,
    quantity,
    promotionCode && hasValidPromotionCode,
  ]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const yearToMonth =
      currentPrice &&
      currentPrice.interval == "year" &&
      selectedPrice &&
      selectedPrice.interval == "month";

    if (yearToMonth) {
      console.log("year to month");
      alert(
        "To switch from paying annually to monthly, please contact sales@envkey.com"
      );
      return;
    }

    // ensure number of active users doesn't exceed the limit
    const activeUsers = org.activeUserOrInviteCount ?? 0;
    if (selectedProduct) {
      const planMax = quantity * selectedProduct.maxUsers;
      if (activeUsers > planMax) {
        alert(
          `Your org currently has ${activeUsers} active users or invites. Please remove ${
            activeUsers - planMax
          } before downgrading to this plan.`
        );
        return;
      }
    } else if ((org.activeUserOrInviteCount ?? 0) > 3) {
      alert(
        `Your org currently has ${activeUsers} active users or invites. Please remove ${
          activeUsers - 3
        } before downgrading to this plan.`
      );
      return;
    }

    setUpdating(true);

    const hasPaymentSource = await addPaymentSourceIfNeeded();
    if (hasPaymentSource) {
      await dispatchSubscriptionAction();
    } else {
      setUpdating(false);
    }
  };

  if (showChoosePlan) {
    return (
      <ChoosePlan
        {...props}
        selectedProductId={selectedProductId}
        onSelect={(productId) => {
          setSelectedProductId(productId);
          setShowChoosePlan(false);
        }}
        onClose={() => setShowChoosePlan(false)}
      />
    );
  }

  return (
    <div className={styles.Billing}>
      <div className="back-link">
        <a
          onClick={() => {
            props.history.replace(props.orgRoute("/my-org/billing"));
          }}
        >
          ← Back
        </a>
      </div>
      <h3>
        Manage <strong>Subscription</strong>
      </h3>
      {hasChange ? (
        <span className="unsaved-changes">Unsaved changes</span>
      ) : (
        ""
      )}

      <p>
        {selectedProduct?.id == currentProduct?.id
          ? "You're on the "
          : "You've selected the "}
        <strong>
          {selectedProduct?.name?.replace("v2 ", "") ?? "Community Cloud"}
        </strong>{" "}
        plan.
      </p>

      <div className="field buttons">
        <button className="tertiary" onClick={() => setShowChoosePlan(true)}>
          {hasSubscriptionChange && selectedProduct?.id != currentProduct?.id
            ? "Change Selected Plan"
            : "Select A New Plan"}
        </button>
      </div>

      {selectedProduct && selectedProduct.adjustableQuantity
        ? [
            <div className="field">
              <label>Max Users</label>
              <input
                type="number"
                value={selectedProduct.maxUsers * quantity}
                step={selectedProduct.maxUsers}
                min={selectedProduct.maxUsers}
                onChange={(e) =>
                  setQuantity(e.target.valueAsNumber / selectedProduct.maxUsers)
                }
                onKeyDown={(e) => e.preventDefault()}
              ></input>
            </div>,
            <div className="field">
              <label>Max ENVKEY Watchers</label>
              <input
                type="number"
                value={selectedProduct.maxEnvkeyWatchers * quantity}
                step={selectedProduct.maxEnvkeyWatchers}
                min={selectedProduct.maxEnvkeyWatchers}
                onChange={(e) =>
                  setQuantity(
                    e.target.valueAsNumber / selectedProduct.maxEnvkeyWatchers
                  )
                }
                onKeyDown={(e) => e.preventDefault()}
              ></input>
            </div>,
          ]
        : [
            <div className="field">
              <label>Max Users</label>
              <span>{selectedProduct?.maxUsers ?? 3}</span>
            </div>,
            <div className="field">
              <label>Max ENVKEY Watchers</label>
              <span>{selectedProduct?.maxEnvkeyWatchers ?? 50}</span>
            </div>,
          ]}

      {selectedProductId ? (
        <div className="field">
          <label>Billing Period</label>

          <div className={"select"}>
            <select
              value={billingInterval}
              onChange={(e) =>
                setBillingInterval(e.target.value as "month" | "year")
              }
            >
              <option value="year">Annual</option>
              <option value="month">Monthly</option>
            </select>
            <SvgImage type="down-caret" />
          </div>
        </div>
      ) : (
        ""
      )}

      <div className="field">
        <label>{hasValidPromotionCode ? "Base Price" : "Price"}</label>
        <span>{priceString}</span>
      </div>

      {!subscription?.promotionCode &&
      hasSubscriptionChange &&
      selectedProductId ? (
        <div className="field">
          <label>Promotion Code</label>
          <input
            value={promotionCode}
            onChange={(e) => {
              const code = e.target.value.toUpperCase();
              setPromotionCode(code);

              if (code.length >= 6 && code.length <= 10) {
                setIsCheckingPromotionCode(true);

                if (promotionCodeTimeout) {
                  clearTimeout(promotionCodeTimeout);
                }

                promotionCodeTimeout = setTimeout(async () => {
                  const res = await props.dispatch({
                    type: Api.ActionType.CLOUD_BILLING_CHECK_PROMOTION_CODE,
                    payload: { code },
                  });

                  if (!res.success) {
                    logAndAlertError(
                      `There was a problem checking the promotion code.`,
                      (res.resultAction as any)?.payload
                    );
                  }
                }, 1000);
              } else {
                setIsCheckingPromotionCode(false);
                if (promotionCodeTimeout) {
                  clearTimeout(promotionCodeTimeout);
                }
              }
            }}
          />
          {promotionCode &&
          (promotionCode.length < 6 || promotionCode.length > 10) ? (
            <div className="error">
              A valid promotion code is between 6 and 10 characters.
            </div>
          ) : (
            ""
          )}
          {isCheckingPromotionCode ? (
            <div>
              <SmallLoader />
            </div>
          ) : (
            ""
          )}
          {promotionCode &&
          promotionCode.length >= 6 &&
          promotionCode.length <= 10 &&
          !isCheckingPromotionCode &&
          !props.core.cloudBillingIsCheckingPromotionCode &&
          !props.core.cloudBillingPromotionCode ? (
            <div className="error">Invalid promotion code</div>
          ) : (
            ""
          )}
        </div>
      ) : (
        ""
      )}

      {hasValidPromotionCode || percentOff || amountOff
        ? [
            <div className="field">
              <label>Discount</label>
              <span>
                {percentOff
                  ? `${percentOff}% off`
                  : `${formatUsd(amountOff!)} off`}
              </span>
            </div>,
            <div className="field">
              <label>Price With Discount</label>
              <span>{totalString}</span>
            </div>,
          ]
        : ""}

      <div className="buttons">
        <button className="primary" disabled={!hasChange} onClick={onSubmit}>
          {updating ? <SmallLoader /> : "Confirm And Update Plan"}
        </button>
      </div>
    </div>
  );
};
