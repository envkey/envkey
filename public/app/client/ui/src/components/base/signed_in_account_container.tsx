import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Component } from "@ui_types";
import { Client, Model, Rbac } from "@core/types";
import * as ui from "@ui";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import { getUiTree } from "@ui_lib/ui_tree";
import { getEnvParentPath } from "@ui_lib/paths";
import {
  getPendingUpdateDetails,
  getAllPendingConflicts,
  getNumPendingConflicts,
} from "@core/lib/client";
import { style } from "typestyle";
import * as styles from "@styles";
import * as semver from "semver";
import { wait } from "@core/lib/utils/wait";

// controls rate off firing off ACCOUNT_ACTIVE events to prevent core proc from clearing cache when ui is active
// refer to core proc IDLE_ACCOUNT_CACHE_EXPIRATION
const ACCOUNT_ACTIVE_BUFFER = 1000 * 60 * 10; // 10 minutes

let initialOrgRoleId: string | undefined;
let initialOrgPermissionsJson: string | undefined;

let lastUserInteraction = Date.now();

export const SignedInAccountContainer: Component<{ orgId: string }> = (
  props
) => {
  let auth: Client.ClientUserAuth | undefined;
  const orgId = props.routeParams.orgId;
  const org = props.core.graph[orgId] as Model.Org | undefined;
  const searchParams = new URLSearchParams(props.location.search);
  const showRoleInfoId = searchParams.get("showRoleInfoId");

  const accountsForOrg = Object.values(props.core.orgUserAccounts).filter(
    (account) => account && account.orgId == orgId
  ) as Client.ClientUserAuth[];

  if (accountsForOrg.length == 1) {
    auth = accountsForOrg[0];
  } else if (props.ui.accountId) {
    const maybeAuth = props.core.orgUserAccounts[props.ui.accountId];

    if (maybeAuth) {
      auth = maybeAuth;
    }
  }

  // clear selected account on unmount
  useEffect(
    () => () => {
      props.setUiState({
        accountId: undefined,
        loadedAccountId: undefined,
      });
    },
    []
  );

  useLayoutEffect(() => {
    if (auth && auth.orgId == orgId) {
      if (props.ui.accountId !== auth.userId) {
        props.setUiState({
          accountId: auth.userId,
          loadedAccountId: undefined,
        });
      } else if (!auth.token) {
        props.history.replace(`/sign-in/${auth.userId}`);
      }
    } else {
      if (accountsForOrg.length == 0) {
        props.history.replace("/home");
      } else if (accountsForOrg.length > 1) {
        props.history.replace("/select-account");
      }
    }
  }, [Boolean(auth), orgId, props.ui.accountId]);

  // handle removed from org, org deleted, or token expired
  useLayoutEffect(() => {
    if (
      props.core.fetchSessionError &&
      typeof props.core.fetchSessionError.error == "object"
    ) {
      switch (props.core.fetchSessionError.error.message) {
        case "device not found":
          alert(
            `This device no longer has access to the organization${
              auth?.orgName ? ` '${auth.orgName}'` : ""
            }.`
          );
          props.dispatch({
            type: Client.ActionType.FORGET_DEVICE,
            payload: { accountId: props.ui.accountId! },
          });
          props.history.replace("/home");
          break;

        case "user not found":
          alert(
            `You no longer belong to the organization${
              auth?.orgName ? ` '${auth.orgName}'` : ""
            }.`
          );
          props.dispatch({
            type: Client.ActionType.FORGET_DEVICE,
            payload: { accountId: props.ui.accountId! },
          });
          props.history.replace("/home");
          break;

        case "org not found":
          alert(
            `The organization${
              auth?.orgName ? ` '${auth.orgName}'` : ""
            } has been deleted.`
          );
          props.dispatch({
            type: Client.ActionType.FORGET_DEVICE,
            payload: { accountId: props.ui.accountId! },
          });
          props.history.replace("/home");
          break;

        case "ip not permitted":
          alert(
            `The organization${
              auth?.orgName ? ` '${auth.orgName}'` : ""
            } cannot be accessed from your IP address.`
          );
          props.history.replace("/home");
          break;

        case "token invalid":
        case "token expired":
          props.history.replace(`/sign-in/${props.ui.accountId!}`);
          break;
      }
    }
  }, [props.core.fetchSessionError?.error]);

  // handle throttle error
  useLayoutEffect(() => {
    if (props.core.throttleError) {
      const canManageBilling =
        props.ui.loadedAccountId &&
        props.core.graphUpdatedAt &&
        g.authz.hasOrgPermission(
          props.core.graph,
          props.ui.loadedAccountId,
          "org_manage_billing"
        );

      alert(
        `Your request has been throttled.\n\nThrottle error: ${
          props.core.throttleError.error.message ?? "usage limits exceeded"
        }.\n\n${
          canManageBilling
            ? "Upgrade your org's license to increase your limits."
            : "Contact an org owner about upgrading your license and increasing your limits."
        }`
      );

      props.dispatch({ type: Client.ActionType.CLEAR_THROTTLE_ERROR });

      if (props.core.fetchSessionError?.error) {
        props.history.replace("/home");
      } else if (canManageBilling) {
        props.history.replace(orgRoute("/my-org/billing"));
      } else {
        props.history.replace(orgRoute("/"));
      }
    }
  }, [props.core.throttleError]);

  const [numFetchedSessionsForAccountId, setNumFetchedSessionsForAccountId] =
    useState<[string, number]>([props.ui.loadedAccountId ?? "", 0]);

  useEffect(() => {
    setNumFetchedSessionsForAccountId([props.ui.loadedAccountId ?? "", 0]);
  }, [props.ui.loadedAccountId]);

  const shouldFetchSession = Boolean(
    props.ui.loadedAccountId &&
      auth &&
      auth.token &&
      auth.privkey &&
      (!props.core.graphUpdatedAt ||
        !props.core.graph[props.ui.loadedAccountId]) &&
      !props.core.isFetchingSession &&
      !props.core.fetchSessionError &&
      (!numFetchedSessionsForAccountId ||
        numFetchedSessionsForAccountId[0] != props.ui.loadedAccountId ||
        numFetchedSessionsForAccountId[1] < 3)
  );

  useLayoutEffect(() => {
    (async () => {
      if (shouldFetchSession) {
        if (document.documentElement.classList.contains("loaded")) {
          document.documentElement.classList.remove("loaded");
        }

        const numFetches = numFetchedSessionsForAccountId[1];
        if (numFetches > 0) {
          await wait(numFetches * 1000);
        }

        props.dispatch({ type: Client.ActionType.GET_SESSION });
      }
    })();
  }, [props.ui.loadedAccountId, shouldFetchSession]);

  const shouldRequireRecoveryKey = useMemo(() => {
    if (
      !props.ui.loadedAccountId ||
      !auth ||
      auth.orgId != orgId ||
      !props.core.graphUpdatedAt
    ) {
      return false;
    }

    const currentUser = props.core.graph[
      props.ui.loadedAccountId
    ] as Model.OrgUser;

    if (!currentUser) {
      return false;
    }

    if (
      g.authz.hasOrgPermission(
        props.core.graph,
        currentUser.id,
        "org_generate_recovery_key"
      )
    ) {
      const activeRecoveryKey = g.getActiveRecoveryKeysByUserId(
        props.core.graph
      )[currentUser.id];

      return !activeRecoveryKey;
    }
  }, [
    Boolean(auth),
    props.core.graphUpdatedAt,
    orgId,
    props.ui.loadedAccountId,
  ]);

  const [showRequireRecoveryKey, setShowRequireRecoveryKey] = useState(
    shouldRequireRecoveryKey
  );

  const shouldRequireDeviceSecurity = useMemo(() => {
    if (
      !props.ui.loadedAccountId ||
      !auth ||
      auth.orgId != orgId ||
      !props.core.graphUpdatedAt
    ) {
      return false;
    }

    const currentUser = props.core.graph[
      props.ui.loadedAccountId
    ] as Model.OrgUser;

    if (!currentUser) {
      return false;
    }

    if (!orgId) {
      return false;
    }
    const org = props.core.graph[orgId] as Model.Org | undefined;
    if (!org) {
      return false;
    }

    return (
      // org requires passphrase and one isn't set
      (org.settings.crypto.requiresPassphrase &&
        !props.core.requiresPassphrase) ||
      // org requires lockout and one isn't set
      (org.settings.crypto.requiresLockout && !props.core.lockoutMs) ||
      // org requires a minimum lockout and current one is too high
      (org.settings.crypto.lockoutMs &&
        props.core.lockoutMs &&
        props.core.lockoutMs > org.settings.crypto.lockoutMs)
    );
  }, [
    Boolean(auth),
    props.core.graphUpdatedAt,
    orgId,
    org && JSON.stringify(org.settings.crypto),
    props.ui.loadedAccountId,
    props.core.requiresPassphrase,
    props.core.lockoutMs,
  ]);

  const onUserInteraction = () => {
    const now = Date.now();
    const elapsed = now - lastUserInteraction;

    if (elapsed > ACCOUNT_ACTIVE_BUFFER) {
      props.dispatch(
        { type: Client.ActionType.ACCOUNT_ACTIVE },
        undefined,
        true
      );
    }

    lastUserInteraction = now;
  };

  useEffect(() => {
    document.body.addEventListener("mouseover", onUserInteraction);
    document.body.addEventListener("scroll", onUserInteraction);
    document.body.addEventListener("keydown", onUserInteraction);

    return () => {
      document.body.removeEventListener("mouseover", onUserInteraction);
      document.body.removeEventListener("scroll", onUserInteraction);
      document.body.removeEventListener("keydown", onUserInteraction);
    };
  }, []);

  useLayoutEffect(() => {
    if (shouldRequireRecoveryKey && !showRequireRecoveryKey) {
      setShowRequireRecoveryKey(true);
    }
  }, [shouldRequireRecoveryKey]);

  const shouldRedirectPath = useMemo(() => {
    if (!props.ui.loadedAccountId) {
      return false;
    }

    if (shouldRequireRecoveryKey || showRequireRecoveryKey) {
      return false;
    }

    if (
      auth &&
      props.core.graphUpdatedAt &&
      props.location.pathname.endsWith(orgId)
    ) {
      const { apps } = g.graphTypes(props.core.graph);
      console.log("number of apps:", apps.length);

      if (apps.length > 0) {
        console.log("redirecting to first app");
        return getEnvParentPath(apps[0]);
      } else {
        console.log("no apps, redirecting to /welcome");
        return "/welcome";
      }
    }
  }, [
    Boolean(auth),
    props.core.graphUpdatedAt,
    props.location.pathname.endsWith(orgId),
    shouldRequireRecoveryKey || showRequireRecoveryKey,
    orgId,
    props.ui.loadedAccountId,
  ]);

  useLayoutEffect(() => {
    if (shouldRedirectPath) {
      return;
    }

    window.scrollTo(0, 0);
    props.dispatch(
      {
        type: Client.ActionType.SET_UI_LAST_SELECTED_URL,
        payload: {
          url: props.location.pathname,
        },
      },
      undefined,
      true
    );
  }, [props.location.pathname]);

  const orgRoute = (path: string) => {
    if (props.ui.loadedAccountId) {
      const account = props.core.orgUserAccounts[props.ui.loadedAccountId];
      if (account) {
        return `/org/${account.orgId}${path}`;
      }
    }
    return "";
  };

  // default path
  useLayoutEffect(() => {
    if (shouldRedirectPath) {
      props.history.replace(orgRoute(shouldRedirectPath));
    }
  }, [shouldRedirectPath]);

  const uiTree = useMemo(() => {
    const tree =
      auth && !shouldRedirectPath && props.ui.loadedAccountId
        ? getUiTree(props.core, auth!.userId, props.ui.now)
        : null;

    return tree;
  }, [
    props.ui.loadedAccountId,
    props.core.graphUpdatedAt,
    auth?.userId,
    shouldRedirectPath,
    props.ui.now,
  ]);

  const { pendingUpdateDetails, pendingConflicts, numPendingConflicts } =
    useMemo(() => {
      let params: Parameters<typeof getPendingUpdateDetails>[1];
      if (props.ui.importingNewEnvParentId) {
        const { apps, blocks } = g.graphTypes(props.core.graph);
        const envParentIds = new Set([...apps, ...blocks].map(R.prop("id")));
        envParentIds.delete(props.ui.importingNewEnvParentId);
        params = { envParentIds };
      }

      const pendingUpdateDetails = getPendingUpdateDetails(props.core, params);
      const pendingConflicts = getAllPendingConflicts(props.core);
      const numPendingConflicts = getNumPendingConflicts(props.core);

      return {
        pendingUpdateDetails,
        pendingConflicts,
        numPendingConflicts,
      };
    }, [
      props.core.pendingEnvsUpdatedAt,
      JSON.stringify(props.core.envsFetchedAt),
    ]);

  useEffect(() => {
    if (
      props.core.pendingEnvUpdates.length > 0 &&
      props.ui.pendingFooterHeight == 0
    ) {
      props.setUiState({
        pendingFooterHeight: styles.layout.DEFAULT_PENDING_FOOTER_HEIGHT,
      });
    } else if (
      props.core.pendingEnvUpdates.length == 0 &&
      props.ui.pendingFooterHeight != 0
    ) {
      props.setUiState({
        pendingFooterHeight: 0,
      });
    }
  }, [props.core.pendingEnvsUpdatedAt]);

  const currentUser = auth
    ? (props.core.graph[auth.userId] as Model.OrgUser)
    : undefined;
  const orgRole = currentUser
    ? (props.core.graph[currentUser.orgRoleId] as Rbac.OrgRole)
    : undefined;
  const orgPermissionsJson = JSON.stringify(
    orgRole
      ? Array.from(g.getOrgPermissions(props.core.graph, orgRole.id)).sort()
      : []
  );

  useEffect(() => {
    if (orgRole) {
      initialOrgRoleId = orgRole?.id;
      initialOrgPermissionsJson = orgPermissionsJson;
    }
  }, [auth?.userId, Boolean(orgRole)]);

  useEffect(() => {
    if (orgRole && initialOrgRoleId != orgRole.id) {
      alert(
        "Your role in the organization has been changed. Your role is now: " +
          orgRole.name
      );
    } else if (orgRole && orgPermissionsJson != initialOrgPermissionsJson) {
      alert("Your permissions for this organization have been updated.");
    }

    initialOrgRoleId = orgRole?.id;
    initialOrgPermissionsJson = orgPermissionsJson;
  }, [auth?.userId, orgRole?.id, orgPermissionsJson]);

  useEffect(() => {
    if (auth && props.core.fetchSessionError) {
      console.log("fetchSessionErr", {
        err: props.core.fetchSessionError,
      });
    }
  }, [auth?.userId, JSON.stringify(props.core.fetchSessionError)]);

  const shouldRender =
    (auth && props.core.fetchSessionError) ||
    !(
      !props.ui.loadedAccountId ||
      !currentUser ||
      !auth ||
      auth.orgId != orgId ||
      shouldRedirectPath ||
      !uiTree
    );

  useLayoutEffect(() => {
    if (
      shouldRender &&
      !document.documentElement.classList.contains("loaded")
    ) {
      document.documentElement.classList.add("loaded");
    }
  }, [shouldRender]);

  if (auth && props.core.fetchSessionError) {
    return (
      <div className={styles.ErrorState}>
        <div>
          <h2>
            Can't connect to{" "}
            {auth.hostType == "cloud"
              ? "EnvKey Cloud API."
              : `${auth.orgName} API host.`}
          </h2>

          <h3>{auth.hostUrl}</h3>

          <Link to="/home" className="back">
            <span>← Back To Home</span>
          </Link>
        </div>
      </div>
    );
  }

  if (
    !props.ui.loadedAccountId ||
    !currentUser ||
    !org ||
    !auth ||
    auth.orgId != orgId ||
    shouldRedirectPath ||
    !uiTree
  ) {
    return <div></div>;
  }

  const hasPendingEnvUpdates = pendingUpdateDetails.filteredUpdates.length > 0;

  if (showRequireRecoveryKey) {
    return (
      <ui.RequireRecoveryKey
        {...props}
        uiTree={uiTree}
        orgRoute={orgRoute}
        hasPendingEnvUpdates={hasPendingEnvUpdates}
        onClear={() => {
          setShowRequireRecoveryKey(false);
        }}
      />
    );
  } else if (shouldRequireDeviceSecurity) {
    return (
      <ui.RequireDeviceSecurity
        {...props}
        uiTree={uiTree}
        orgRoute={orgRoute}
        hasPendingEnvUpdates={hasPendingEnvUpdates}
      />
    );
  }

  const currentApiVersion = org.selfHostedVersions?.api;
  const currentInfraVersion = org.selfHostedVersions?.infra;
  const apiUpgradeAvailable = Boolean(
    currentApiVersion &&
      props.core.selfHostedUpgradesAvailable.api?.latest &&
      semver.gt(
        props.core.selfHostedUpgradesAvailable.api.latest,
        currentApiVersion
      )
  );
  const infraUpgradeAvailable = Boolean(
    currentInfraVersion &&
      props.core.selfHostedUpgradesAvailable.infra?.latest &&
      semver.gt(
        props.core.selfHostedUpgradesAvailable.infra.latest,
        currentInfraVersion
      )
  );

  return (
    <div>
      <section
        className={style({
          position: "fixed",
          top: 0,
          left: 0,
          width: styles.layout.SIDEBAR_WIDTH,
          transition: "height",
          transitionDuration: "0.2s",
          height: `calc(100% - ${props.ui.pendingFooterHeight}px)`,
        })}
      >
        <ui.Sidebar
          {...props}
          uiTree={uiTree}
          orgRoute={orgRoute}
          hasPendingEnvUpdates={hasPendingEnvUpdates}
        />
      </section>

      <section
        className={style({
          position: "absolute",
          top: 0,
          left: styles.layout.SIDEBAR_WIDTH,
          width: `calc(100% - ${styles.layout.SIDEBAR_WIDTH}px)`,
          background: "#fff",
          paddingBottom: hasPendingEnvUpdates
            ? props.ui.pendingFooterHeight
            : 0,
        })}
      >
        <ui.OrgRoutes
          {...props}
          uiTree={uiTree}
          orgRoute={orgRoute}
          hasPendingEnvUpdates={hasPendingEnvUpdates}
        />
      </section>

      <ui.PendingFooter
        {...props}
        uiTree={uiTree}
        orgRoute={orgRoute}
        hasPendingEnvUpdates={hasPendingEnvUpdates}
        pendingUpdateDetails={pendingUpdateDetails}
        pendingConflicts={pendingConflicts}
        numPendingConflicts={numPendingConflicts}
      />

      {showRoleInfoId && !(apiUpgradeAvailable || infraUpgradeAvailable) ? (
        <ui.RbacInfo
          {...props}
          uiTree={uiTree}
          orgRoute={orgRoute}
          hasPendingEnvUpdates={hasPendingEnvUpdates}
        />
      ) : (
        ""
      )}

      {apiUpgradeAvailable || infraUpgradeAvailable ? (
        <ui.SelfHostedUpgrade
          {...props}
          uiTree={uiTree}
          orgRoute={orgRoute}
          hasPendingEnvUpdates={hasPendingEnvUpdates}
        />
      ) : (
        ""
      )}
    </div>
  );
};
