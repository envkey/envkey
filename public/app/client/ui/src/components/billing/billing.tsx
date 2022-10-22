import React, { useMemo } from "react";
import { OrgComponent } from "@ui_types";
import * as g from "@core/lib/graph";
import * as styles from "@styles";
import { CurrentLicense } from "./current_license";
import { PaymentMethod } from "./payment_method";
import { SelfHostedLicense } from "./self_hosted_license";
import { Invoices } from "./invoices";
import { BillingSettings } from "./billing_settings";

export const BillingUI: OrgComponent = (props) => {
  const { graph, graphUpdatedAt } = props.core;
  const currentUserId = props.ui.loadedAccountId!;

  const { license, subscription, paymentSource, org } = useMemo(
    () => g.graphTypes(graph),
    [graphUpdatedAt, currentUserId]
  );

  return (
    <div className={styles.Billing}>
      <CurrentLicense {...props} />
      {license.hostType == "cloud" && !org.customLicense
        ? [
            <div className="field buttons">
              <button
                className="tertiary"
                onClick={() => {
                  props.history.replace(
                    props.orgRoute("/my-org/billing/subscription")
                  );
                }}
              >
                Change Plan
              </button>
            </div>,
            subscription && paymentSource ? <PaymentMethod {...props} /> : "",
            <BillingSettings {...props} />,
            subscription ? <Invoices {...props} /> : "",
          ]
        : ""}

      {process.env.NODE_ENV == "development" || license.hostType != "cloud" ? (
        <SelfHostedLicense {...props} />
      ) : (
        ""
      )}

      {license.hostType == "cloud" && org.customLicense ? (
        <p>
          Please contact <strong>sales@envkey.com</strong> to upgrade or
          downgrade your license.
        </p>
      ) : (
        ""
      )}
    </div>
  );
};
