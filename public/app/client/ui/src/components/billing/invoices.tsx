import React, { useEffect, useState } from "react";
import { OrgComponent } from "@ui_types";
import { Api, Client } from "@core/types";
import moment from "moment";
import { SmallLoader } from "@images";
import { formatUsd } from "@core/lib/utils/currency";
import { logAndAlertError } from "@ui_lib/errors";
import { getDefaultApiHostUrl } from "../../../../shared/src/env";

export const Invoices: OrgComponent = (props) => {
  const { cloudBillingInvoices } = props.core;
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTimeout(() => {
      props
        .dispatch({
          type: Api.ActionType.CLOUD_BILLING_FETCH_INVOICES,
          payload: {},
        })
        .then(() => setLoading(false));
    }, 2000);
  }, []);

  return (
    <div className="invoices">
      <h3>
        Past <strong>Invoices</strong>
      </h3>

      {loading ? (
        <SmallLoader />
      ) : cloudBillingInvoices.length > 0 ? (
        <table className="invoice-list">
          <thead>
            <tr>
              <th>Date</th>
              <th>Plan</th>
              {/* <th>Users</th> */}
              <th>Total</th>
              <th>Period</th>
              <th>Status</th>
              <th>Reference</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cloudBillingInvoices.map((invoice) => {
              const dateString = moment(invoice.createdAt).format("YYYY-MM-DD");

              return (
                <tr className="invoice-row">
                  <td>{dateString}</td>
                  <td>{invoice.productName.replace("v2 ", "")}</td>
                  {/* <td>
                    {invoice.numActiveUsers}/{invoice.maxUsers}
                  </td> */}
                  <td>{formatUsd(invoice.total)}</td>
                  <td>{invoice.periodString}</td>
                  <td>{invoice.status}</td>
                  <td>{invoice.refNumber}</td>
                  <td className="view">
                    <a
                      href="#view"
                      onClick={async (e) => {
                        e.preventDefault();

                        props
                          .dispatch({
                            type: Client.ActionType.OPEN_URL,
                            payload: {
                              url: `https://${getDefaultApiHostUrl()}/invoices/${
                                invoice.id
                              }`,
                            },
                          })
                          .then((res) => {
                            if (!res.success) {
                              logAndAlertError(
                                `There was a problem viewing the invoice.`,
                                (res.resultAction as any)?.payload
                              );
                            }
                          });
                      }}
                    >
                      View
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p>No invoices have been generated yet.</p>
      )}
    </div>
  );
};
