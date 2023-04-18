import React, { useState, useEffect, useLayoutEffect, useMemo } from "react";
import { Component } from "@ui_types";
import { HomeContainer } from "../home/home_container";
import * as styles from "@styles";
import { ExternalLink } from "../shared";
import { Client, Api, Billing } from "@core/types";
import { SmallLoader, SvgImage } from "@images";
import * as g from "@core/lib/graph";
import { formatUsd } from "@core/lib/utils/currency";
import { fetchState } from "@core/lib/core_proc";
import * as ui from "@ui";
import { capitalize } from "@core/lib/utils/string";

export const V1Upgrade: Component = (props) => {
  const [existingAccountId, setExistingAccountId] = useState<string>();
  const [validAccountIds, setValidAccountIds] = useState<string[]>();

  const [v1UpgradeAccountId, setV1UpgradeAccountId] = useState<string>();

  const [ssoEnabled, setSSOEnabled] = useState(false);
  const [importLocalKeys, setImportLocalKeys] = useState(true);

  const [appIds, setAppIds] = useState<string[]>();
  const [selectAllApps, setSelectAllApps] = useState(true);

  const [startedUpgrade, setStartedUpgrade] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [importing, setImporting] = useState(false);
  const [upgradeComplete, setUpgradeComplete] = useState(false);
  const [awaitingV1Complete, setAwaitingV1Complete] = useState(false);
  const [canceledUpgrade, setCanceledUpgrade] = useState(false);

  const [chosenProductId, setChosenProductId] = useState<string | undefined>();

  const [billingInterval, setBillingInterval] =
    useState<Api.V1Upgrade.Upgrade["billingInterval"]>("month");

  const [deviceName, setDeviceName] = useState(
    props.core.defaultDeviceName ?? ""
  );

  const handleImportFinished = () => {
    console.log("Import finished. Waiting for v1 to finish upgrade");

    setUpgrading(false);
    setImporting(false);
    setAwaitingV1Complete(true);
  };

  const handleUpgradeComplete = async () => {
    console.log("v1 upgrade complete.");

    await props.refreshCoreState();

    setAwaitingV1Complete(false);
    setUpgradeComplete(true);
  };

  const handleUpgradeError = () => {
    setUpgrading(false);
    setImporting(false);
    setCreatingOrg(false);
    setUpgradeComplete(true);
  };

  const handleOrgRegistration = () => {
    setCreatingOrg(false);
    if (props.core.registrationError) {
      setUpgrading(false);
      setUpgradeComplete(true);
    }
  };

  useLayoutEffect(() => {
    if (!props.core.v1UpgradeLoaded && (!startedUpgrade || canceledUpgrade)) {
      props.history.push("/home");
    }
  }, [props.core.v1UpgradeLoaded, canceledUpgrade]);

  useLayoutEffect(() => {
    props.setUiState({ accountId: undefined, loadedAccountId: undefined });
  }, []);

  useEffect(() => {
    if (props.core.v1UpgradeAccountId && !v1UpgradeAccountId) {
      setV1UpgradeAccountId(props.core.v1UpgradeAccountId);
    }
  }, [props.core.v1UpgradeAccountId]);

  useEffect(() => {
    (async () => {
      const importFinishedCondition =
        startedUpgrade &&
        upgrading &&
        importing &&
        !(
          props.core.v1UpgradeError ||
          (props.ui.importStatus?.importOrgError ?? props.core.importOrgError)
        ) &&
        props.ui.importStatus?.v1UpgradeStatus == "finished";

      const importStartedCondition =
        (props.ui.importStatus?.isImportingOrg ?? props.core.isImportingOrg) &&
        !importing &&
        !awaitingV1Complete &&
        !upgradeComplete;

      if (importFinishedCondition) {
        handleImportFinished();
      } else if (importStartedCondition) {
        setImporting(true);
      }
    })();
  }, [
    props.ui.importStatus?.isImportingOrg ?? props.core.isImportingOrg,
    props.ui.importStatus?.v1UpgradeStatus,
  ]);

  useEffect(() => {
    (async () => {
      if (awaitingV1Complete && !props.ui.importStatus?.v1UpgradeLoaded) {
        await handleUpgradeComplete();
      }
    })();
  }, [props.ui.importStatus?.v1UpgradeLoaded, awaitingV1Complete]);

  useEffect(() => {
    if (
      props.core.v1UpgradeError ??
      props.ui.importStatus?.importOrgError ??
      props.core.importOrgError ??
      props.core.loadCloudProductsError ??
      props.core.checkV1PendingUpgradeError
    ) {
      handleUpgradeError();
    }
  }, [
    props.core.v1UpgradeError,
    props.ui.importStatus?.importOrgError ?? props.core.importOrgError,
    props.core.loadCloudProductsError,
    props.core.checkV1PendingUpgradeError,
  ]);

  useEffect(() => {
    if (creatingOrg && (!props.core.isRegistering || props.ui.importStatus)) {
      handleOrgRegistration();
    } else if (props.core.isRegistering && !creatingOrg) {
      setCreatingOrg(true);
    }
  }, [props.core.isRegistering, props.ui.importStatus]);

  useEffect(() => {
    props.dispatch({
      type: Api.ActionType.CLOUD_BILLING_LOAD_PRODUCTS,
      payload: {},
    });

    const accounts = Object.values(props.core.orgUserAccounts).filter(
      (account) => account && account.token
    );

    if (accounts.length > 0) {
      (async () => {
        const valid: string[] = [];
        for (const account of accounts) {
          if (!account || !account.token) {
            continue;
          }

          let accountState = await fetchState(account.userId);

          if (!(accountState.graph && accountState.graph[account.userId])) {
            const res = await props.dispatch(
              {
                type: Client.ActionType.GET_SESSION,
                payload: {},
              },
              undefined,
              true,
              account.userId
            );
            if (res.success) {
              accountState = res.state;
            } else {
              console.error("failed to get session", {
                userId: account.userId,
                orgId: account.orgId,
                res,
              });
              continue;
            }
          }

          if (
            g.authz.hasOrgPermission(
              accountState.graph,
              account.userId,
              "org_archive_import_export"
            )
          ) {
            valid.push(account.userId);
            setValidAccountIds(valid);
          }
        }
        setValidAccountIds(valid);
      })();
    } else {
      setValidAccountIds([]);
    }
  }, []);

  useEffect(() => {
    if (props.core.v1UpgradeLoaded?.stripeCustomerId) {
      props.dispatch({
        type: Api.ActionType.CLOUD_BILLING_CHECK_V1_PENDING_UPGRADE,
        payload: {
          stripeCustomerId: props.core.v1UpgradeLoaded.stripeCustomerId,
        },
      });
    }
  }, [props.core.v1UpgradeLoaded?.stripeCustomerId]);

  useLayoutEffect(() => {
    if (existingAccountId) {
      props.dispatch(
        {
          type: Client.ActionType.RESET_ORG_IMPORT,
        },
        undefined,
        undefined,
        existingAccountId
      );
      props.setUiState({
        accountId: existingAccountId,
        loadedAccountId: undefined,
      });
    } else {
      props.dispatch({
        type: Client.ActionType.RESET_ORG_IMPORT,
      });
      props.setUiState({ accountId: undefined, loadedAccountId: undefined });
    }
  }, [existingAccountId]);

  useEffect(() => {
    (async () => {
      if (
        existingAccountId &&
        props.ui.loadedAccountId &&
        props.ui.loadedAccountId == existingAccountId &&
        props.core.graph &&
        props.core.graph[existingAccountId]
      ) {
        await props.dispatch({
          type: Client.ActionType.RESET_ORG_IMPORT,
        });
        await props.dispatch({
          type: Client.ActionType.DECRYPT_ORG_ARCHIVE,
          payload: { ...props.core.v1UpgradeLoaded!, isV1Upgrade: true },
        });
      } else if (!existingAccountId && props.core.filteredOrgArchive) {
        await props.dispatch({
          type: Client.ActionType.RESET_ORG_IMPORT,
        });
      }
    })();
  }, [
    Boolean(
      existingAccountId &&
        props.ui.loadedAccountId &&
        props.ui.loadedAccountId == existingAccountId &&
        props.core.graph &&
        props.core.graph[existingAccountId]
    ),
  ]);

  const {
    license: selectedAccountLicense,
    currentPrice: selectedAccountCurrentPrice,
    numActiveUsers: selectedAccountNumActiveUsers,
    subscription: selectedAccountSubscription,
    org: selectedOrg,
  } = useMemo(() => {
    if (!existingAccountId || !props.core.graphUpdatedAt) {
      return {};
    }

    const { license, org, subscription } = g.graphTypes(props.core.graph);

    const numActiveUsers = org.activeUserOrInviteCount;

    return {
      license,
      currentPrice: subscription
        ? (props.core.graph[subscription.priceId] as Billing.Price)
        : undefined,
      numActiveUsers,
      subscription,
      org,
    };
  }, [props.core.graphUpdatedAt, existingAccountId]);

  const dispatchUpgrade = (resume = false) => {
    props.dispatch(
      {
        type: Client.ActionType.START_V1_UPGRADE,
        payload:
          resume && props.core.v1ActiveUpgrade && props.core.v1UpgradeAccountId
            ? {
                ...props.core.v1ActiveUpgrade,
                accountId: props.core.v1UpgradeAccountId,
                newProductId: undefined,
                billingInterval: undefined,
                freeTier: undefined,
              }
            : {
                accountId: existingAccountId,
                deviceName: existingAccountId ? undefined : deviceName,
                importOrgUsers: !ssoEnabled,
                importLocalKeys,
                importServers: true,
                importEnvParentIds: appIds,
                ssoEnabled,
                billingInterval:
                  existingAccountId || props.core.hasV1PendingUpgrade === true
                    ? undefined
                    : billingInterval,
                newProductId:
                  existingAccountId || props.core.hasV1PendingUpgrade === true
                    ? undefined
                    : selectedProduct?.id,
                freeTier:
                  existingAccountId || props.core.hasV1PendingUpgrade === true
                    ? undefined
                    : chosenProductId == "free",
              },
      },
      undefined,
      undefined,
      resume ? props.core.v1UpgradeAccountId : undefined
    );
    setUpgrading(true);
    setStartedUpgrade(true);
  };

  const numUsers =
    existingAccountId && selectedOrg && props.core.filteredOrgArchive
      ? props.core.filteredOrgArchive.orgUsers.length +
        (selectedOrg.activeUserOrInviteCount ?? 0)
      : props.core.v1UpgradeLoaded?.numUsers ?? 0;
  const freeTierEnabled = numUsers <= 3 && !ssoEnabled;
  const defaultPlan = g.planForNumUsers(
    props.core.cloudProducts ?? [],
    numUsers,
    ssoEnabled
  );
  const validPlans = [defaultPlan!].filter(Boolean);

  if (defaultPlan && !ssoEnabled && !defaultPlan.product.ssoEnabled) {
    validPlans.push(
      g.planForNumUsers(props.core.cloudProducts ?? [], numUsers, true)!
    );
  }

  const selectedProduct =
    chosenProductId == "free" && !existingAccountId
      ? undefined
      : props.core.cloudProducts?.find((p) =>
          chosenProductId
            ? chosenProductId == p.id
            : defaultPlan?.product.id == p.id
        );
  const selectedPrice = selectedProduct
    ? props.core.cloudPrices?.find(
        (p) =>
          p.productId == selectedProduct.id && p.interval == billingInterval
      )
    : undefined;

  const selectedAccountLicenseExceeded =
    existingAccountId &&
    selectedAccountLicense &&
    ((selectedAccountLicense.maxUsers &&
      selectedAccountLicense.maxUsers != -1 &&
      numUsers > selectedAccountLicense.maxUsers) ||
      (selectedAccountLicense.isCloudBasics && ssoEnabled));

  const resetUpgradeButton = (label = "Cancel Upgrade") => (
    <button
      disabled={canceledUpgrade}
      className="secondary"
      onClick={async (e) => {
        e.preventDefault();
        setCanceledUpgrade(true);
        props.dispatch({
          type: Client.ActionType.RESET_V1_UPGRADE,
          payload: { cancelUpgrade: true },
        });
      }}
    >
      {canceledUpgrade ? <SmallLoader /> : label}
    </button>
  );

  const availablePlansStart = [
    "With ",
    <strong>
      {numUsers} active user
      {numUsers > 1 ? "s" : ""}
    </strong>,
    ssoEnabled ? " and SSO enabled," : <strong>,</strong>,
  ];

  const availablePlansDefaultOnly = defaultPlan ? (
    <p>
      {availablePlansStart} you'll be subscribed to the{" "}
      <strong>{defaultPlan.product.name.replace("v2 ", "")} Plan.</strong>
    </p>
  ) : (
    ""
  );

  const availablePlansCopy = () => {
    const start = availablePlansStart;

    const end = [
      <p>
        {[
          `As a v1 user, you'll get a `,
          <strong>lifetime 10% discount.</strong>,
          " ",
        ]}
      </p>,

      validPlans.length > 1 || freeTierEnabled ? (
        <p>Which plan would you like to subscribe to?</p>
      ) : (
        ""
      ),
    ];

    if (validPlans.length > 1) {
      if (freeTierEnabled) {
        return [
          <p>
            {start} you have the option of subscribing to our free{" "}
            <strong>Community Cloud Plan,</strong> our{" "}
            <strong>Cloud Basics Plan,</strong> (with priority support and
            unlimited audit logs) or our <strong>Cloud Pro Plan</strong> (with
            SSO and teams).
          </p>,
          end,
        ];
      } else {
        return [
          <p>
            {start} you have the option of subscribing to our{" "}
            <strong>Cloud Basics Plan</strong> or our
            <strong>Cloud Pro Plan</strong> (with SSO and teams).
          </p>,
          end,
        ];
      }
    } else if (defaultPlan) {
      return [availablePlansDefaultOnly, end];
    }
  };

  let status: string;
  if (creatingOrg) {
    status = "Creating organization";
  } else if (props.core.isDecryptingOrgArchive) {
    status = "Loading v1 upgrade";
  } else if (
    props.ui.importStatus?.importOrgStatus ||
    (importing && props.core.importOrgStatus)
  ) {
    status = (props.ui.importStatus?.importOrgStatus ??
      props.core.importOrgStatus)!;
  } else if (startedUpgrade) {
    status = "Finishing upgrade";
  } else {
    status = "Preparing upgrade";
  }
  const upgradeStatus = (
    <form>
      <div className="field">
        <SmallLoader />
        <p className="org-import-status">{status}...</p>
      </div>
    </form>
  );

  const finishButtons = (cancelLabel?: string, finishLabel?: string) => (
    <div className="buttons">
      {resetUpgradeButton(cancelLabel)}
      <button
        className="primary"
        disabled={canceledUpgrade}
        onClick={(e) => {
          e.preventDefault();
          dispatchUpgrade(
            Boolean(props.core.v1ActiveUpgrade && props.core.v1UpgradeAccountId)
          );
        }}
      >
        {finishLabel ?? "Finish"} Upgrade →
      </button>
    </div>
  );

  const err =
    props.core.loadCloudProductsError ??
    props.core.checkV1PendingUpgradeError ??
    props.core.v1UpgradeError ??
    props.ui.importStatus?.importOrgError ??
    props.core.importOrgError;

  let errorMessage: string | undefined;
  if (err) {
    if (err.error !== true && err.error.message) {
      errorMessage = err.error.message;
    } else if ("errorReason" in err && err.errorReason) {
      errorMessage = err.errorReason;
    }
  }

  if (errorMessage) {
    errorMessage = capitalize(errorMessage.replace("v1 upgrade - ", "")) + ".";
  }

  if (err) {
    console.log("v1 upgrade error: ", { err, errorMessage });
  }

  const upgradeError = (
    <form>
      <p>
        There was a problem finishing the upgrade. Please contact{" "}
        <strong>support@envkey.com</strong> for help.
      </p>
      <div>
        {errorMessage ? <p className="error">{errorMessage}</p> : ""}
        {finishButtons("Back To Home", "Retry")}
      </div>
    </form>
  );

  const hasServerOrLocalKeyErrors =
    props.ui.importStatus?.importOrgServerErrors ||
    props.ui.importStatus?.importOrgLocalKeyErrors;

  const upgradeFinished = (
    <form>
      <div>
        <p className="org-import-status">Your upgrade has finished!</p>
      </div>

      {props.ui.importStatus?.importOrgServerErrors ? (
        <p className="error">
          <h4>There were errors importing the following server ENVKEYs</h4>
          <ul>
            {Object.keys(props.ui.importStatus?.importOrgServerErrors).map(
              (label) => (
                <li key={label}>
                  <br />
                  <strong>{label}:</strong>
                  <br />
                  <span>
                    {props.ui.importStatus?.importOrgServerErrors![label]}
                  </span>
                </li>
              )
            )}
          </ul>
        </p>
      ) : (
        ""
      )}

      {props.ui.importStatus?.importOrgLocalKeyErrors ? (
        <p className="error">
          <h4>There were errors importing the following local ENVKEYs</h4>
          <ul>
            {Object.keys(props.ui.importStatus?.importOrgLocalKeyErrors).map(
              (label) => (
                <li key={label}>
                  <br />
                  <strong>{label}:</strong>
                  <br />
                  <span>
                    {props.ui.importStatus?.importOrgLocalKeyErrors![label]}
                  </span>
                </li>
              )
            )}
          </ul>
        </p>
      ) : (
        ""
      )}

      {hasServerOrLocalKeyErrors ? (
        <p>
          You can re-generate the missing ENVKEYs manually. You can also contact{" "}
          <strong>support@envkey.com</strong> for help.
        </p>
      ) : (
        ""
      )}

      <div className="buttons">
        <button
          className="primary"
          onClick={(e) => {
            e.preventDefault();

            const userId = v1UpgradeAccountId!;
            const orgId = props.core.orgUserAccounts[userId]!.orgId;

            props.setUiState({
              accountId: userId,
              loadedAccountId: userId,
              lastLoadedAccountId: userId,
            });

            const url = existingAccountId
              ? `/org/${orgId}`
              : `/org/${orgId}/welcome`;

            props.history.push(url);
          }}
        >
          Go To Your V2 Org →
        </button>
      </div>
    </form>
  );

  const ssoSection = (
    <div>
      <div className="field no-margin">
        <label>SSO</label>
      </div>
      {ssoCopy}
      <div
        className={"field checkbox" + (ssoEnabled ? " selected" : "")}
        onClick={() => setSSOEnabled(!ssoEnabled)}
      >
        <label>Use SSO</label>
        <input type="checkbox" checked={ssoEnabled} />
      </div>
    </div>
  );

  const newOrExistingOrgSection =
    validAccountIds && validAccountIds.length > 0 ? (
      <div>
        <div className="field no-margin">
          <label>New Or Existing Org</label>
        </div>

        <p>
          You can either upgrade your v1 org into a new v2 org, or you can
          upgrade it into an existing v2 org.
        </p>

        <div className="field">
          <div className="select">
            <select
              value={existingAccountId ?? "new"}
              onChange={(e) => {
                const accountId =
                  e.target.value == "new" ? undefined : e.target.value;
                setExistingAccountId(accountId);
              }}
            >
              <option value="new">Upgrade into a new org</option>
              {validAccountIds.map((accountId) => {
                const account = props.core.orgUserAccounts[accountId]!;
                return (
                  <option value={accountId}>
                    Upgrade into {account.orgName}
                  </option>
                );
              })}
            </select>
            <SvgImage type="down-caret" />
          </div>
        </div>
      </div>
    ) : (
      ""
    );

  const localKeysSection = (
    <div>
      <div className="field no-margin">
        <label>Local Development ENVKEYs</label>
      </div>
      {localKeysCopy}
      <div
        className={"field checkbox" + (importLocalKeys ? " selected" : "")}
        onClick={() => setImportLocalKeys(!importLocalKeys)}
      >
        <label>Import V1 Local Keys</label>
        <input type="checkbox" checked={importLocalKeys} />
      </div>
    </div>
  );

  const billingSection = () => {
    if (props.core.hasV1PendingUpgrade === true) {
      return "";
    }

    if (props.core.v1UpgradeLoaded!.signedPresetBilling) {
      return "";
    }
    if (existingAccountId && selectedOrg && selectedOrg.customLicense) {
      return "";
    }
    if (existingAccountId && !selectedAccountLicenseExceeded) {
      return "";
    }
    if (existingAccountId && (!selectedAccountLicense || !selectedOrg)) {
      return "";
    }

    const header = (
      <div>
        <div className="field no-margin">
          <label>Billing</label>
        </div>
        <p>
          <strong>
            <ExternalLink {...props} to={"https://www.envkey.com/pricing/"}>
              See pricing for v2 plans →
            </ExternalLink>
          </strong>{" "}
        </p>
      </div>
    );

    if (existingAccountId && selectedAccountLicenseExceeded) {
      return (
        <div>
          {header}
          {availablePlansDefaultOnly}
          <p>Your v1 subscription will be canceled.</p>
        </div>
      );
    }

    return (
      <div>
        {header}
        {availablePlansCopy()}
        {freeTierEnabled || validPlans.length > 1
          ? [
              <div className="field">
                <div className="select">
                  <select
                    onChange={(e) => {
                      setChosenProductId(e.target.value as string);
                    }}
                    value={chosenProductId ?? defaultPlan?.product.id}
                  >
                    {validPlans
                      .map((plan) => (
                        <option key={plan.product.id} value={plan.product.id}>
                          {plan.product.name.replace("v2 ", "")}
                        </option>
                      ))
                      .concat(
                        freeTierEnabled
                          ? [
                              <option key="free" value="free">
                                Community Cloud
                              </option>,
                            ]
                          : []
                      )}
                  </select>
                  <SvgImage type="down-caret" />
                </div>
              </div>,
            ]
          : null}
        {chosenProductId == "free"
          ? ""
          : [
              <p>
                You can get an{" "}
                <strong>additional discount if you pay annually</strong> (about
                16% off). How would you like to pay?
              </p>,

              <div className="field">
                <div className="select">
                  <select
                    onChange={(e) => {
                      setBillingInterval(
                        e.target.value as typeof billingInterval
                      );
                    }}
                    value={billingInterval}
                  >
                    <option value="month">Pay Monthly</option>
                    <option value="year">Pay Annually</option>
                  </select>
                  <SvgImage type="down-caret" />
                </div>
              </div>,
            ]}
        {selectedProduct && selectedPrice ? (
          [
            <p>
              We'll use your v1 payment details. Your v1 subscription will be
              canceled.
            </p>,
            <div className="field no-margin">
              <label>Total Price</label>
            </div>,
            <p>
              {formatUsd(
                selectedPrice.amount * (freeTierEnabled ? 0.85 : 0.9)
              ) + (billingInterval == "year" ? " per year" : " per month")}
            </p>,
          ]
        ) : (
          <p>Your v1 subscription will be canceled.</p>
        )}
      </div>
    );
  };

  const deviceNameSection = (
    <div className="field">
      <label>Name Of This Device</label>
      <input
        type="text"
        placeholder="Enter a name..."
        value={deviceName ?? ""}
        required
        onChange={(e) => setDeviceName(e.target.value)}
      />
    </div>
  );

  const finishActionSection = (
    <div>
      <div className="field no-margin">
        <label>That's everything</label>
      </div>
      <p>
        You're ready to finish the upgrade. Please reach out to{" "}
        <strong>support@envkey.com</strong> if you have any problems, questions,
        or feedback relating to the upgrade or any aspect of EnvKey v2.
      </p>
      {finishButtons()}
    </div>
  );

  const resumeSection = (
    <div>
      <div className="field no-margin">
        <label>Upgrade Interrupted</label>
      </div>
      <p>
        It looks like you started upgrading, but the upgrade didn't finish.
        Would you like to resume it?
      </p>
      {finishButtons(undefined, "Resume")}
    </div>
  );

  const appSelectSection =
    props.core.filteredOrgArchive &&
    props.core.filteredOrgArchive.apps.length > 1 ? (
      <div>
        <div className="field">
          <label>Apps</label>
          <p>
            Do you want to move all the apps from your v1 org to your v2 org, or
            choose which to bring over?
          </p>
          <div className="select">
            <select
              value={selectAllApps ? "all" : "choose"}
              onChange={(e) => {
                const selectAll = e.target.value == "all";
                setSelectAllApps(selectAll);
                if (selectAll) {
                  setAppIds(undefined);
                }
              }}
            >
              <option value="all">Upgrade all apps</option>
              <option value="choose">Select which apps to upgrade</option>
            </select>
            <SvgImage type="down-caret" />
          </div>
        </div>
        {selectAllApps ? (
          ""
        ) : (
          <div className="field select-apps">
            <label>Select Apps</label>
            <ui.CheckboxMultiSelect
              winHeight={props.winHeight}
              noSubmitButton={true}
              emptyText={`No apps to upgrade`}
              items={props.core.filteredOrgArchive.apps.map((app) => {
                return {
                  label: <label>{app.name}</label>,
                  searchText: app.name,
                  id: app.id,
                };
              })}
              onChange={(ids) => setAppIds(ids)}
            />
          </div>
        )}
      </div>
    ) : (
      ""
    );

  if (!props.core.v1UpgradeLoaded && !startedUpgrade) {
    return (
      <HomeContainer anchor="center">
        <div className={styles.V1Upgrade}></div>
      </HomeContainer>
    );
  }

  if (
    existingAccountId &&
    selectedAccountLicenseExceeded &&
    selectedOrg &&
    selectedOrg.customLicense
  ) {
    <HomeContainer anchor="center">
      <div className={styles.V1Upgrade}>
        <h3>
          <strong>Upgrade</strong> From V1
        </h3>

        <p>
          You're on a custom billing plan and your plan's user limit would be
          exceeded by the upgrade. Please contact{" "}
          <strong>sales@envkey.com</strong>
        </p>
      </div>
    </HomeContainer>;
  }

  let content: React.ReactNode;

  // console.log({
  //   upgrading,
  //   awaitingV1Complete,
  //   validAccountIds,
  //   "props.core.cloudProducts": props.core.cloudProducts,
  // });

  if (
    upgrading ||
    awaitingV1Complete ||
    !props.core.cloudProducts ||
    (typeof props.core.hasV1PendingUpgrade == "undefined" &&
      !upgradeComplete) ||
    !validAccountIds
  ) {
    content = upgradeStatus;
  } else if (
    upgradeComplete ||
    (startedUpgrade && !props.core.v1UpgradeLoaded)
  ) {
    if (
      props.core.v1UpgradeError ||
      (props.ui.importStatus?.importOrgError ?? props.core.importOrgError) ||
      props.core.loadCloudProductsError ||
      props.core.checkV1PendingUpgradeError ||
      canceledUpgrade
    ) {
      content = upgradeError;
    } else {
      content = upgradeFinished;
    }
  } else {
    content = (
      <form>
        {props.core.v1ActiveUpgrade && props.core.v1UpgradeAccountId
          ? [resumeSection]
          : [
              newOrExistingOrgSection,
              ssoSection,
              existingAccountId ? appSelectSection : "",
              localKeysSection,
              billingSection(),
              existingAccountId ? "" : deviceNameSection,
              clientLibrariesSection,
              finishActionSection,
            ]}
      </form>
    );
  }

  return (
    <HomeContainer anchor="center">
      <div className={styles.V1Upgrade}>
        <h3>
          <strong>Upgrade</strong> From V1
        </h3>

        {content}
      </div>
    </HomeContainer>
  );
};

const clientLibrariesSection = (
  <div>
    <div className="field no-margin">
      <label>Client Libraries</label>
    </div>
    <p>
      After your upgrade finishes, you'll also need to{" "}
      <strong>upgrade up any EnvKey client libraries</strong> to their latest{" "}
      <strong>2.x.x</strong> versions (this includes envkey-source in addition
      to any language-specific libraries).
      <br />
      <br />
      <strong>
        1.x.x libraries will continue working with your v1 ENVKEYs in the
        meantime,
      </strong>{" "}
      so you can do this gradually without worrying about downtime, but changes
      you make in v2 won't be picked up until you upgrade client libraries.
    </p>
  </div>
);

const localKeysCopy = (
  <p>
    In EnvKey v2, managing local development ENVKEYs manually is no longer
    necessary.
    <br />
    <br /> <strong>If you don't import</strong> your v1 local ENVKEYs, you'll
    need to run <code>envkey init</code> in the root directory of each of your
    apps, and then commit the resulting <strong>.envkey</strong> file to version
    control. All users with access to an app will then be able to load the local
    development environment without generating a local key. After upgrading,
    each user should also{" "}
    <strong>clear out any v1 local ENVKEYs set in .env files.</strong>
    <br />
    <br />
    <strong>If you do import</strong> your v1 local ENVKEYs, all your existing
    local ENVKEYs will continue working in v2 without requiring you to run{" "}
    <code>envkey init</code> in your projects. You can also import your local
    ENVKEYs now, then move away from them gradually later.
  </p>
);

const ssoCopy = (
  <p>
    Imported v1 users will use <strong>email authentication.</strong> If you
    want to use <strong>SSO</strong> instead, check the box below and re-invite
    users after the upgrade finishes and you've configured SSO.
  </p>
);
