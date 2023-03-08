import React, { useMemo, useLayoutEffect } from "react";
import { Route, Switch, HashRouter } from "react-router-dom";
import { ComponentBaseProps, Component } from "@ui_types";
import * as ui from "@ui";
import { style } from "typestyle";

type UiRoute = [string, Component<any>];

const Wrapper: Component<{}, { component: Component }> = (props) => {
  const willRedirect = useMemo(() => {
    if (
      props.core.locked &&
      !(
        props.location.pathname == "/locked" ||
        props.location.pathname == "/redeem-recovery-key"
      )
    ) {
      return "/locked";
    } else if (!props.core.locked && props.location.pathname == "/locked") {
      return "/";
    } else if (
      props.core.v1UpgradeLoaded &&
      props.location.pathname != "/v1-upgrade"
    ) {
      return "/v1-upgrade";
    } else if (
      props.core.v1UpgradeInviteToken &&
      props.core.v1UpgradeEncryptionToken &&
      props.location.pathname != "/v1-upgrade-accept-invite"
    ) {
      return "/v1-upgrade-accept-invite";
    }
  }, [
    props.core.locked,
    props.core.v1UpgradeLoaded,
    props.core.v1UpgradeInviteToken,
    props.core.v1UpgradeEncryptionToken,
  ]);

  useLayoutEffect(() => {
    if (willRedirect) {
      console.log("willRedirect:", willRedirect);
      props.history.replace(willRedirect);
    }
  }, [willRedirect]);

  if (willRedirect) {
    return <div></div>;
  }

  return React.createElement(props.component, props);
};

const uiRoute = (
  props: ComponentBaseProps,
  [path, component]: UiRoute,
  i: number
) => {
  return (
    <Route
      key={i}
      path={path}
      render={(routeProps) => {
        return (
          <div className={style({ width: "100%", height: "100%" })}>
            {React.createElement(Wrapper, {
              ...props,
              ...routeProps,
              routeParams: routeProps.match?.params ?? {},
              component,
            })}
          </div>
        );
      }}
    />
  );
};

export const uiRoutes = (props: ComponentBaseProps, ...rs: UiRoute[]) => {
    return <Switch>{rs.map((r, i) => uiRoute(props, r, i))}</Switch>;
  },
  BaseRoutes: React.FC<ComponentBaseProps> = (props) => {
    return (
      <HashRouter>
        <div className={style({ width: "100%", height: "100%" })}>
          {uiRoutes(
            props,
            ["/home", ui.HomeMenu],
            ["/select-account", ui.SelectAccount],
            ["/sign-in/:accountId", ui.SignIn],
            ["/sign-in-saml/:accountId", ui.SignInSaml],
            ["/init-self-hosted/:subdomain", ui.InitSelfHosted],
            ["/create-org", ui.RegisterChooseOrgType],
            ["/register-cloud", ui.RegisterCloud],
            ["/register-community", ui.RegisterCommunity],
            ["/register-enterprise", ui.RegisterSelfHosted],
            ["/accept-invite", ui.AcceptInvite],
            ["/lock-set-passphrase", ui.LockSetPassphrase],
            ["/device-settings", ui.DeviceSettings],
            ["/redeem-recovery-key", ui.RedeemRecoveryKey],
            ["/v1-upgrade", ui.V1Upgrade],
            ["/v1-upgrade-accept-invite", ui.V1UpgradeAcceptInvite],
            ["/org/:orgId", ui.SignedInAccountContainer],
            ["/locked", ui.Unlock],
            ["/", ui.IndexRedirect]
          )}
        </div>
      </HashRouter>
    );
  };
