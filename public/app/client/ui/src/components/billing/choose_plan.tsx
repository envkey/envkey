import React, { useMemo } from "react";
import { OrgComponent } from "@ui_types";
import { Billing } from "@core/types";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import * as styles from "@styles";

export const ChoosePlan: OrgComponent<
  {},
  {
    selectedProductId?: string;
    onSelect: (productId: string | undefined) => any;
    onClose: () => any;
  }
> = (props) => {
  const { graph, graphUpdatedAt } = props.core;
  const currentUserId = props.ui.loadedAccountId!;

  const { products } = useMemo(
    () => g.graphTypes(graph),
    [graphUpdatedAt, currentUserId]
  );

  const selectedProduct = props.selectedProductId
    ? (graph[props.selectedProductId] as Billing.Product)
    : undefined;

  return (
    <div className={styles.Billing + " choose-plan"}>
      <div className="back-link">
        <a onClick={props.onClose}>← Back</a>
      </div>
      <h3>
        Choose Your <strong>Plan</strong>
      </h3>

      {R.sortBy(
        R.prop("maxUsers"),
        products.filter(R.complement(R.propEq("id", selectedProduct?.id)))
      ).map((product) => (
        <div className="field">
          <label>{product.name.replace("v2 ", "")}</label>

          <p>
            <div>
              {product.adjustableQuantity ? "" : "Up to "}
              {product.maxUsers}
              {product.adjustableQuantity ? " or more" : ""} users
            </div>
            <div>
              {product.adjustableQuantity ? "" : "Up to "}
              {product.maxEnvkeyWatchers}
              {product.adjustableQuantity ? " or more" : ""} ENVKEY watchers
            </div>
            <div>Unlimited audit log retention</div>
            {product.ssoEnabled ? <div>SSO</div> : ""}
            {product.teamsEnabled ? <div>Teams</div> : ""}
          </p>

          <div className="field buttons">
            <button
              className="tertiary"
              onClick={() => props.onSelect(product.id)}
            >
              Select {product.name.replace("v2 ", "")}
            </button>
          </div>
        </div>
      ))}

      {selectedProduct ? (
        <div className="field">
          <label>Community Cloud</label>

          <p>
            <div>Up to 3 users</div>
            <div>Up to 50 ENVKEY watchers</div>
            <div>30 days audit log retention</div>
          </p>

          <div className="buttons">
            <button
              className="tertiary"
              onClick={() => props.onSelect(undefined)}
            >
              Select Community Cloud
            </button>
          </div>
        </div>
      ) : (
        ""
      )}
    </div>
  );
};
