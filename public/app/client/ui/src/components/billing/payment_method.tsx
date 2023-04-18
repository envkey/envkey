import React, { useMemo, useState } from "react";
import { OrgComponent } from "@ui_types";
import { Api } from "@core/types";
import * as g from "@core/lib/graph";
import { updatePaymentSource } from "@ui_lib/billing";
import { logAndAlertError } from "@ui_lib/errors";
import { SmallLoader } from "@images";
import { capitalize } from "@core/lib/utils/string";

export const PaymentMethod: OrgComponent = (props) => {
  const { graph, graphUpdatedAt } = props.core;
  const currentUserId = props.ui.loadedAccountId!;

  const { paymentSource } = useMemo(() => {
    const { paymentSource } = g.graphTypes(graph);

    return { paymentSource };
  }, [graphUpdatedAt, currentUserId]);

  const [updating, setUpdating] = useState(false);

  if (!paymentSource) {
    return <div></div>;
  }

  const onUpdate = async (error?: string) => {
    setUpdating(true);

    const token = await updatePaymentSource({
      data: { error },
    });

    if (token) {
      const res = await props.dispatch({
        type: Api.ActionType.CLOUD_BILLING_UPDATE_PAYMENT_METHOD,
        payload: {
          token,
        },
      });

      if (!res.success) {
        const payload = (res.resultAction as any).payload;

        if (payload.type == "stripeError") {
          onUpdate(payload.errorReason);
          return;
        }

        logAndAlertError(
          "There was an error updating your org's payment method.",
          payload
        );
      }
    }

    setUpdating(false);
  };

  return (
    <div className="payment-method">
      <h3>
        <strong>Payment</strong> Method
      </h3>

      <p>
        <strong>
          {paymentSource.brand ? capitalize(paymentSource.brand) : "Unknown"}{" "}
        </strong>
        <span>
          xxxx xxxx xxxx <strong>{paymentSource.last4 ?? "????"}</strong>
        </span>
      </p>

      <p>
        <label>Expires </label>
        <span>
          <strong>
            {paymentSource.expYear && paymentSource.expMonth
              ? `${paymentSource.expMonth}/${paymentSource.expYear}`
              : "Unknown"}
          </strong>
        </span>
      </p>

      <div className="field buttons">
        <button
          disabled={updating}
          className="tertiary"
          onClick={() => onUpdate()}
        >
          {updating ? <SmallLoader /> : "Update Card"}
        </button>
      </div>
    </div>
  );
};
