import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
} from "react";
import { BaseRoutes } from "./routes";
import { Client } from "@core/types";
import { dispatchCore, fetchState } from "@core/lib/core_proc";
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
  UpgradeProgress,
} from "@core/types/electron";
import { SmallLoader } from "@images";
import { ClientUpgrades } from "@ui";
import { applyPatch } from "rfc6902";
import { version } from "../../../electron/package.json";

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
        console.log(new Date().toISOString(), "updating UI state");

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
          })
        );

        uiStateRef.current = updatedState;

        _setLocalUiState(updatedState);
      },
      [upgradeRestartLater, setUpgradeRestartLater] = useState(0),
      [availableClientUpgrade, setAvailableClientUpgrade] =
        useState<AvailableClientUpgrade>({}),
      [clientUpgradeProgress, setClientUpgradeProgress] =
        useState<ClientUpgradeProgress>({}),
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
      fetchCoreState = async (forceUpdate = false) => {
        fetchingStateRef.current = true;
        const accountId = uiStateRef.current.accountId;

        console.log(new Date().toISOString(), "fetching core state", {
          accountId,
        });

        await fetchState(accountId)
          .then(async (state) => {
            return updateState(state, forceUpdate);
          })
          .catch((err) => {
            console.error("fetchCoreState -> fetchState error", err);
            throw err;
          });
      },
      onSocketUpdate = (e: WebSocketEvent) => {
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

          if (msg.type == "update") {
            onSocketUpdate(e);
          } else if (msg.type == "diffs") {
            const newState = R.clone(coreStateRef.current!);
            applyPatch(newState, msg.diffs);
            setCoreStateIfLatest(newState);
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
        skipStateUpdate?: true
      ) => {
        console.log(new Date().toISOString(), "dispatch:", action.type);

        const res = await dispatchCore(
          action,
          clientParams,
          uiStateRef.current.accountId,
          hostUrlOverride
        );

        console.log(new Date().toISOString(), "core result:", action.type);

        let newState: Client.State | undefined;
        if (!skipStateUpdate && res.diffs && res.diffs.length > 0) {
          console.log(
            new Date().toISOString(),
            action.type,
            `${res.diffs.length} diffs to apply`
          );
          newState = R.clone(coreStateRef.current!);
          applyPatch(newState, res.diffs);
          setCoreStateIfLatest(newState);
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
      client.addEventListener("open", onSocketUpdate);
      client.addEventListener("message", onSocketMessage);
      client.addEventListener("error", (e) => {
        console.log("Local socket error:", e);
      });
    };

    const init = useCallback(() => {
      // ensures we don't start trying to connect to core proc until it's running and the auth token has been retrieved from OS keyring and added to user agent
      if (!navigator.userAgent.startsWith(Client.CORE_PROC_AGENT_NAME)) {
        console.log(
          "navigator.userAgent does not include CORE_PROC_AGENT_NAME"
        );
        setTimeout(init, 300);
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

      fetchCoreState(true);
    }, [coreState]);

    useEffect(init, [navigator.userAgent]);

    useLayoutEffect(() => {
      forceRenderStyles();
    }, []);

    useEffect(() => {
      if (
        uiStateRef.current.accountId &&
        uiStateRef.current.accountId != uiStateRef.current.loadedAccountId
      ) {
        fetchCoreState(true);
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
      (progress: UpgradeProgress) => {
        console.log(new Date().toISOString(), "Root - upgrade progress", {
          progress,
        });
        console.log(new Date().toISOString(), "Root - clientUpgrade progress", {
          clientUpgradeProgress,
        });
        setClientUpgradeProgress({
          ...clientUpgradeProgress,
          [progress.clientProject]: progress,
        });
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

      window.electron.registerNewerUpgradeAvailableHandler(
        (availableUpgrade) => {
          console.log(
            new Date().toISOString(),
            "Root - newer upgrade available",
            availableUpgrade
          );
          alert("A newer upgrade is available.");
          setAvailableClientUpgrade(availableUpgrade);
        }
      );

      // this is only called if there was no desktop upgrade
      // (just CLI or envkey-source), otherwise the app will
      // restart with the latest version
      window.electron.registerUpgradeCompleteHandler(() => {
        console.log(new Date().toISOString(), "Root - upgrade complete");

        setTimeout(() => {
          setClientUpgradeProgress({});
          setAvailableClientUpgrade({});
          alert("Upgrade complete.");
        }, 2000);
      });

      window.electron.registerUpgradeErrorHandler(() => {
        console.log(new Date().toISOString(), "Root - upgrade error");
        alert(
          "There was a problem downloading the upgrade. This might mean that a new upgrade is available. Please try again."
        );
        setClientUpgradeProgress({});
        setAvailableClientUpgrade({});
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
      };
      return (
        <div className={styles.Root}>
          <div id="content">
            <BaseRoutes {...props} />

            {!R.isEmpty(availableClientUpgrade) && upgradeRestartLater == 0 ? (
              <ClientUpgrades
                {...props}
                availableClientUpgrade={availableClientUpgrade}
                clientUpgradeProgress={clientUpgradeProgress}
                onRestartLater={() => setUpgradeRestartLater(Date.now())}
              />
            ) : (
              ""
            )}
          </div>
        </div>
      );
    } else {
      return (
        <div>
          <SmallLoader />
        </div>
      );
    }
  };

export default Root;
