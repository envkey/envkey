import React, { useEffect, useState } from "react";
import { OrgComponent } from "@ui_types";
import { Api, Client } from "@core/types";
import { ElectronWindow } from "@core/types/electron";
import moment from "moment";
import { SmallLoader } from "@images";
import { formatUsd } from "@core/lib/utils/currency";
import { logAndAlertError } from "@ui_lib/errors";

declare var window: ElectronWindow;

export const Invoices: OrgComponent = (props) => {
  const { cloudBillingInvoices } = props.core;
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    props
      .dispatch({
        type: Api.ActionType.CLOUD_BILLING_FETCH_INVOICES,
        payload: {},
      })
      .then(() => setLoading(false));
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
                  <td className="download">
                    <a
                      href="#download"
                      onClick={async (e) => {
                        e.preventDefault();

                        const filePath = await window.electron.chooseFilePath(
                          "Save Invoice",
                          `envkey-invoice-${dateString}.pdf`
                        );

                        if (!filePath) {
                          return;
                        }

                        props
                          .dispatch({
                            type: Client.ActionType.DOWNLOAD_INVOICE,
                            payload: {
                              filePath,
                              invoiceId: invoice.id,
                            },
                          })
                          .then((res) => {
                            if (!res.success) {
                              logAndAlertError(
                                `There was a problem downloading the invoice.`,
                                (res.resultAction as any)?.payload
                              );
                            }
                          });
                      }}
                    >
                      Download
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <table />
      )}
    </div>
  );
};
