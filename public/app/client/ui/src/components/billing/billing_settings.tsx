import React, { useState, useEffect, useLayoutEffect } from "react";
import { OrgComponent } from "@ui_types";
import { Api, Billing } from "@core/types";
import * as g from "@core/lib/graph";
import * as styles from "@styles";
import { SmallLoader } from "@images";
import { logAndAlertError } from "@ui_lib/errors";

export const BillingSettings: OrgComponent = (props) => {
  const { graph } = props.core;
  const org = g.getOrg(graph);
  const { customer } = g.graphTypes(graph);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const [name, setName] = useState(org.billingSettings?.name ?? "");
  const [email, setEmail] = useState(org.billingSettings?.email ?? "");
  const [address, setAddress] = useState(org.billingSettings?.address ?? "");
  const [vat, setVat] = useState(org.billingSettings?.vat ?? "");

  const [updatingSettings, setUpdatingSettings] = useState(false);

  const settingsState: Billing.BillingSettings = {
    name: name || undefined,
    email: email || undefined,
    address: address || undefined,
    vat: vat || undefined,
  };

  const settingsUpdated =
    name != (org.billingSettings?.name ?? "") ||
    email != (org.billingSettings?.email ?? "") ||
    address != (org.billingSettings?.address ?? "") ||
    vat != (org.billingSettings?.vat ?? "");

  useEffect(() => {
    if (updatingSettings) {
      setUpdatingSettings(false);
    }
  }, [JSON.stringify(org.billingSettings ?? {})]);

  return [
    settingsUpdated ? (
      <span className="unsaved-changes">Unsaved changes</span>
    ) : (
      ""
    ),
    <div className="billing-settings">
      <h3>
        Billing <strong>Settings</strong>
      </h3>

      <div className="field">
        <label>Organization Legal Name</label>
        <input
          type="text"
          disabled={updatingSettings}
          value={name}
          placeholder={org.name}
          onChange={(e) => setName(e.target.value)}
        />
        <span>
          Optional. Your organization's legal name for display on invoices.
          Defaults to organization name.
        </span>
      </div>

      <div className="field">
        <label>Billing Email</label>
        <input
          type="email"
          disabled={updatingSettings}
          value={email}
          placeholder={customer?.billingEmail}
          onChange={(e) => setEmail(e.target.value)}
        />
        <span>
          Optional. Invoices will be sent here. Defaults to Org Owner's email.
          Displayed on invoices.
        </span>
      </div>

      <div className="field">
        <label>Billing Address</label>
        <input
          type="text"
          disabled={updatingSettings}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <span>Optional. Displayed on invoices.</span>
      </div>

      <div className="field">
        <label>VAT Number</label>
        <input
          type="text"
          disabled={updatingSettings}
          value={vat}
          onChange={(e) => setVat(e.target.value)}
        />
        <span>Optional. Displayed on invoices.</span>
      </div>

      <div className="field buttons">
        <button
          className="primary"
          disabled={!settingsUpdated}
          onClick={() => {
            setUpdatingSettings(true);
            props
              .dispatch({
                type: Api.ActionType.CLOUD_BILLING_UPDATE_SETTINGS,
                payload: settingsState,
              })
              .then((res) => {
                if (!res.success) {
                  logAndAlertError(
                    `There was a problem updating billing settings.`,
                    (res.resultAction as any)?.payload
                  );
                }
              });
          }}
        >
          {updatingSettings ? <SmallLoader /> : "Update Settings"}
        </button>
      </div>
    </div>,
  ] as any; // 'any' workaround for TS not recognizing functional components that return an array
};
