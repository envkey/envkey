import React, { useLayoutEffect } from "react";
import { Client } from "@core/types";
import { Component } from "@ui_types";

export const IndexRedirect: Component = (props) => {
  useLayoutEffect(() => {
    let redirectAccountId = props.core.uiLastSelectedAccountId;
    let account: Client.ClientUserAuth | undefined;

    if (!redirectAccountId) {
      const accountIds = Object.keys(props.core.orgUserAccounts);
      if (accountIds.length == 1) {
        redirectAccountId = accountIds[0];
      }
    }

    if (redirectAccountId) {
      account = props.core.orgUserAccounts[redirectAccountId];
      if (!account?.token) {
        redirectAccountId = undefined;
        account = undefined;
      }
    }

    if (redirectAccountId && account) {
      props.setUiState({
        accountId: redirectAccountId,
        loadedAccountId: undefined,
      });
      console.log(
        new Date().toISOString(),
        "redirecting to org:",
        `/org/${account.orgId}`
      );
      props.history.replace(
        props.core.uiLastSelectedUrl ?? `/org/${account.orgId}`
      );
    } else {
      if (props.core.uiLastSelectedAccountId) {
        console.log(new Date().toISOString(), "clearing last selected");

        props.dispatch(
          {
            type: Client.ActionType.SET_UI_LAST_SELECTED_ACCOUNT_ID,
            payload: { selectedAccountId: undefined },
          },
          undefined,
          true
        );
        props.dispatch(
          {
            type: Client.ActionType.SET_UI_LAST_SELECTED_URL,
            payload: { url: undefined },
          },
          undefined,
          true
        );
      }

      console.log(new Date().toISOString(), "redirecting home");
      props.history.replace("/home");
    }
  }, []);

  return <div></div>;
};
