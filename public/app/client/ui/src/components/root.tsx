import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
} from "react";
import { BaseRoutes } from "./routes";
import { Client } from "@core/types";
import { dispatchCore, fetchState, isAlive } from "@core/lib/core_proc";
import {
  LocalUiState,
  ComponentProps,
  ComponentBaseProps,
  emptyEnvManagerState,
} from "@ui_types";
import { useWindowSize } from "@ui_lib/view";
import { forceRenderStyles } from "typestyle";
import * as styles from "@styles";
import * as R from "ramda";
import ReconnectingWebSocket, {
  Event as WebSocketEvent,
} from "reconnecting-websocket";
import {
  ElectronWindow,
  AvailableClientUpgrade,
  ClientUpgradeProgress,
} from "@core/types/electron";
import { SmallLoader, EnvkeyLogo } from "@images";
import { ClientUpgradesAvailable, ClientUpgradeStatus } from "@ui";
import { forceApplyPatch } from "@core/lib/utils/patch";
import { version } from "../../../electron/package.json";
import { style } from "typestyle";
import { ReportError } from "./base";

declare var window: ElectronWindow;

const LOCAL_UI_STATE_KEY = "localUiState";

const defaultLocalStateWithoutTimestamp: Omit<LocalUiState, "now"> = {
  accountId: undefined,
  loadedAccountId: undefined,
  lastLoadedAccountId: undefined,
  envManager: emptyEnvManagerState,
  selectedCategoryFilter: "all",
  sidebarWidth: styles.layout.SIDEBAR_WIDTH,
  pendingFooterHeight: 0,
};

let establishedInitialSocketConnection = false;
let fetchedInitialState = false;

const clientParams: Client.ClientParams<"app"> = {
    clientName: "app",
    clientVersion: version,
  },
  Root: React.FC = () => {
    const storedLocalUiStateJson = localStorage.getItem(LOCAL_UI_STATE_KEY);
    const storedLocalUiState = storedLocalUiStateJson
      ? (JSON.parse(storedLocalUiStateJson) as LocalUiState)
      : undefined;

    const defaultLocalState = {
      ...(storedLocalUiState
        ? R.mergeDeepRight(
            defaultLocalStateWithoutTimestamp,
            storedLocalUiState
          )
        : defaultLocalStateWithoutTimestamp),
      now: Date.now(),
    } as LocalUiState;

    const [coreState, _setCoreState] = useState<Client.State>(),
      coreStateRef = useRef(coreState),
      setCoreStateIfLatest = (state: Client.State, forceUpdate = false) => {
        if (
          // ensure state updates aren't applied out-of-order (can cause rare race conditions)
          forceUpdate ||
          !coreStateRef.current?.lastActiveAt ||
          !state.lastActiveAt ||
          state.lastActiveAt > coreStateRef.current.lastActiveAt
        ) {
          console.log(new Date().toISOString(), "updating core state", {
            bytes: Buffer.byteLength(JSON.stringify(state), "utf8"),
          });
          coreStateRef.current = state;
          _setCoreState(state);
        }
      },
      [uiState, _setLocalUiState] = useState(defaultLocalState),
      uiStateRef = useRef(uiState),
      setLocalUiState = (update: Partial<LocalUiState>) => {
        const updatedState = {
          ...uiStateRef.current,
          ...update,
        };

        window.localStorage.setItem(
          LOCAL_UI_STATE_KEY,
          JSON.stringify({
            ...updatedState,
            envManager: emptyEnvManagerState,
            pendingFooterHeight: 0,
            importStatus: undefined,
            envActionStatus: undefined,
          })
        );

        uiStateRef.current = updatedState;

        _setLocalUiState(updatedState);
      },
      [upgradeRestartLater, setUpgradeRestartLater] = useState(0),
      [availableClientUpgrade, setAvailableClientUpgrade] =
        useState<AvailableClientUpgrade>({}),
      [clientUpgradeProgress, setClientUpgradeProgress] =
        useState<ClientUpgradeProgress>(),
      [upgradeDownloaded, setUpgradeDownloaded] = useState(false),
      [startedUpgrade, setStartedUpgrade] = useState(false),
      [isStartingCore, setIsStartingCore] = useState(false),
      [winWidth, winHeight] = useWindowSize(uiState),
      fetchingStateRef = useRef(false),
      queueFetchStateRef = useRef(false),
      updateState = (state: Client.State, forceUpdate = false) => {
        setCoreStateIfLatest(state, forceUpdate);
        const accountId = uiStateRef.current.accountId;
        const loadedAccountId = uiStateRef.current.loadedAccountId;
        if (accountId != loadedAccountId) {
          setLocalUiState({
            loadedAccountId: accountId,
            lastLoadedAccountId: accountId,
          });
        }

        if (accountId != state.uiLastSelectedAccountId) {
          dispatch(
            {
              type: Client.ActionType.SET_UI_LAST_SELECTED_ACCOUNT_ID,
              payload: { selectedAccountId: accountId },
            },
            undefined,
            true
          );
        }

        fetchingStateRef.current = false;
        if (queueFetchStateRef.current) {
          queueFetchStateRef.current = false;
          fetchCoreState();
        }
      },
      fetchCoreState = async (
        params: { forceUpdate?: boolean; keys?: (keyof Client.State)[] } = {}
      ) => {
        const { forceUpdate, keys } = params;

        fetchingStateRef.current = true;
        const accountId = uiStateRef.current.accountId;

        console.log(new Date().toISOString(), "fetching core state", {
          accountId,
        });

        await fetchState(accountId, undefined, keys)
          .then(async (stateOrPartial) => {
            console.log(
              new Date().toISOString(),
              "fetched core state, applying update",
              {
                accountId,
              }
            );
            const res = updateState(
              keys
                ? { ...coreStateRef.current, ...stateOrPartial }
                : stateOrPartial,
              forceUpdate
            );

            console.log(new Date().toISOString(), "applied core state update", {
              accountId,
            });
            return res;
          })
          .catch((err) => {
            console.error("fetchCoreState -> fetchState error", err);
            throw err;
          });
      },
      onSocketFullStateUpdate = (e: WebSocketEvent) => {
        if (e.type == "open") {
          if (!establishedInitialSocketConnection) {
            establishedInitialSocketConnection = true;

            if (!fetchedInitialState) {
              fetchCoreState();
            }
            return;
          }
        }

        if (fetchingStateRef.current) {
          queueFetchStateRef.current = true;
        } else {
          fetchCoreState();
        }
      },
      onSocketMessage = (e: MessageEvent) => {
        (async () => {
          const msg = JSON.parse(e.data) as Client.LocalSocketMessage;
          // console.log("received socket message: ", msg);
          if (msg.type == "update") {
            if (
              !msg.accountId ||
              msg.accountId == uiStateRef.current.accountId
            ) {
              onSocketFullStateUpdate(e);
            }
          } else if (msg.type == "diffs") {
            const newState = R.clone(coreStateRef.current!);
            console.log(
              new Date().toISOString(),
              `received ${msg.diffs.length} socket message diffs`
            );
            forceApplyPatch(newState, msg.diffs);
            console.log(
              new Date().toISOString(),
              `applied socket message diffs`
            );
            setCoreStateIfLatest(newState);
            console.log(new Date().toISOString(), `set new state`);
          } else if (msg.type == "envActionStatus") {
            setLocalUiState({ envActionStatus: msg.status });
          } else if (msg.type == "importStatus") {
            console.log(
              new Date().toISOString(),
              "received import status update:",
              msg.status
            );
            setLocalUiState({ importStatus: msg.status });
          } else {
            console.log(
              new Date().toISOString(),
              "Received unknown socket message for core proc: ",
              e.data
            );
          }
        })();
      },
      dispatch: ComponentProps["dispatch"] = async (
        action,
        hostUrlOverride?: string,
        skipStateUpdate?: true,
        accountId?: string
      ) => {
        console.log(new Date().toISOString(), "dispatch:", action.type);

        const returnFullState = action.type == Client.ActionType.GET_SESSION;

        const res = await dispatchCore(
          action,
          clientParams,
          accountId ?? uiStateRef.current.accountId,
          hostUrlOverride,
          undefined,
          returnFullState
        );

        console.log(new Date().toISOString(), "core result:", action.type);

        let newState: Client.State | undefined;
        if (!skipStateUpdate) {
          if (returnFullState && "state" in res) {
            console.log(
              new Date().toISOString(),
              action.type,
              `received full state response`
            );
            setCoreStateIfLatest(res.state);
            console.log(new Date().toISOString(), "set new state");
          } else if ("diffs" in res && res.diffs && res.diffs.length > 0) {
            console.log(
              new Date().toISOString(),
              action.type,
              `${res.diffs.length} diffs to apply`
            );
            // console.log(res.diffs);
            newState = R.clone(coreStateRef.current!);
            const patchRes = forceApplyPatch(newState, res.diffs);
            console.log(new Date().toISOString(), "applied patch");
            // console.log(patchRes);
            setCoreStateIfLatest(newState);
            console.log(new Date().toISOString(), "set new state");
            // console.log(newState);
          }
        }

        // give state a chance to update
        await new Promise((resolve) => requestAnimationFrame(resolve));

        return {
          ...res,
          state: newState ? newState : coreState,
        } as Client.DispatchResult & { status: number };
      };

    const initLocalSocket = () => {
      const client = new ReconnectingWebSocket(
        "ws://localhost:19048",
        undefined,
        { debug: true }
      );
      client.addEventListener("open", onSocketFullStateUpdate);
      client.addEventListener("message", onSocketMessage);
      client.addEventListener("error", (e) => {
        console.log("Local socket error:", e);
      });
    };

    const init = useCallback(
      (n = 0) =>
        (async () => {
          // ensures we don't start trying to connect to core proc until it's running and the auth token has been retrieved from OS keyring and added to user agent
          if (!navigator.userAgent.startsWith(Client.CORE_PROC_AGENT_NAME)) {
            console.log(
              "navigator.userAgent does not include CORE_PROC_AGENT_NAME"
            );

            if (n == 0 && !(await isAlive(200))) {
              setIsStartingCore(true);
            }

            setTimeout(() => init(n + 1), 300);
            return;
          }

          window.addEventListener("beforeunload", () => {
            console.log(
              new Date().toISOString(),
              "window beforeunload event--disconnecting client"
            );
            if (coreState && !coreState.locked) {
              dispatch({ type: Client.ActionType.DISCONNECT_CLIENT });
            }
          });
          initLocalSocket();
          fetchCoreState({ forceUpdate: true });
        })(),
      [coreState]
    );

    useEffect(() => {
      init();
    }, [navigator.userAgent]);

    useLayoutEffect(() => {
      forceRenderStyles();
    }, []);

    useEffect(() => {
      if (
        uiStateRef.current.accountId &&
        uiStateRef.current.accountId != uiStateRef.current.loadedAccountId
      ) {
        fetchCoreState({ forceUpdate: true });
      }
    }, [uiStateRef.current.accountId, uiStateRef.current.loadedAccountId]);

    useEffect(() => {
      setTimeout(() => {
        const now = Date.now();

        setLocalUiState({ now });

        // prompt for upgrade again if UI is still running after 24 hours
        if (
          upgradeRestartLater &&
          now - upgradeRestartLater > 1000 * 60 * 60 * 24
        ) {
          setUpgradeRestartLater(0);
        }
      }, 60000);
    }, [uiState.now]);

    const upgradeProgressHandler = useCallback(
      (progress: ClientUpgradeProgress) => {
        console.log(new Date().toISOString(), "Root - upgrade progress", {
          progress,
        });
        console.log(new Date().toISOString(), "Root - clientUpgrade progress", {
          clientUpgradeProgress,
        });
        setClientUpgradeProgress(progress);
      },
      [clientUpgradeProgress]
    );

    useEffect(() => {
      window.electron.registerUpgradeProgressHandler(upgradeProgressHandler);
    }, [upgradeProgressHandler]);

    useEffect(() => {
      window.electron.registerUpgradeAvailableHandler((availableUpgrade) => {
        console.log(
          new Date().toISOString(),
          "Root - upgrade available",
          availableUpgrade
        );
        setAvailableClientUpgrade(availableUpgrade);
      });

      window.electron.registerUpgradeErrorHandler(() => {
        console.log(new Date().toISOString(), "Root - upgrade error");
        alert(
          "There was a problem downloading the upgrade. This might mean that a new upgrade is available. Please try again."
        );
        setClientUpgradeProgress(undefined);
        setAvailableClientUpgrade({});
      });

      window.electron.registerUpgradeCompleteHandler(() => {
        console.log(new Date().toISOString(), "Root - upgrade complete");
        setUpgradeDownloaded(true);
      });
    }, []);

    if (coreState) {
      const props: ComponentBaseProps = {
        core: coreState,
        ui: uiState,
        setUiState: setLocalUiState,
        refreshCoreState: fetchCoreState,
        dispatch,
        winWidth,
        winHeight,
        startedUpgrade,
      };

      return (
        <div
          className={
            styles.Root +
            (startedUpgrade
              ? " " +
                style({
                  paddingBottom: styles.layout.DEFAULT_PENDING_FOOTER_HEIGHT,
                })
              : "")
          }
        >
          <div id="content">
            <BaseRoutes {...props} />

            {!R.isEmpty(availableClientUpgrade) &&
            upgradeRestartLater == 0 &&
            !startedUpgrade ? (
              <ClientUpgradesAvailable
                {...props}
                availableClientUpgrade={availableClientUpgrade}
                clientUpgradeProgress={clientUpgradeProgress}
                onRestartLater={() => setUpgradeRestartLater(Date.now())}
                onStartUpgrade={() => {
                  setStartedUpgrade(true);
                  window.electron.downloadAndInstallUpgrades();
                }}
              />
            ) : (
              ""
            )}

            {startedUpgrade ? (
              <ClientUpgradeStatus
                {...props}
                upgradeDownloaded={upgradeDownloaded}
                clientUpgradeProgress={clientUpgradeProgress}
              />
            ) : (
              ""
            )}
          </div>
        </div>
      );
    } else {
      return (
        <div
          id="preloader"
          className={style({
            opacity: "1 !important",
            pointerEvents: "initial !important" as any,
          })}
        >
          <div className="container">
            <EnvkeyLogo scale={1.7} />
            <SmallLoader />

            {isStartingCore ? (
              <p
                className={style({
                  marginTop: "30px",
                  marginBottom: 0,
                  fontSize: "16px",
                  color: "rgba(255,255,255,0.9)",
                })}
              >
                Starting EnvKey core...{" "}
              </p>
            ) : (
              ""
            )}
          </div>
        </div>
      );
    }
  };

export default Root;
