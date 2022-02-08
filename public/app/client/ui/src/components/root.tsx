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

declare var window: ElectronWindow;

const LOCAL_UI_STATE_KEY = "localUiState";

const defaultLocalStateWithoutTimestamp: Omit<LocalUiState, "now"> = {
  accountId: undefined,
  loadedAccountId: undefined,
  envManager: emptyEnvManagerState,
  selectedCategoryFilter: "all",
  sidebarWidth: styles.layout.SIDEBAR_WIDTH,
  pendingFooterHeight: 0,
};

let establishedInitialSocketConnection = false;
let fetchedInitialState = false;

const clientParams: Client.ClientParams<"app"> = {
    clientName: "app",
    clientVersion: "2.0",
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
      setCoreState = (state: Client.State) => {
        coreStateRef.current = state;
        _setCoreState(state);
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
      updateState = (state: Client.State) => {
        setCoreState(state);
        const accountId = uiStateRef.current.accountId;
        const loadedAccountId = uiStateRef.current.loadedAccountId;
        if (accountId != loadedAccountId) {
          setLocalUiState({ loadedAccountId: accountId });
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
      fetchCoreState = async () => {
        fetchingStateRef.current = true;
        const accountId = uiStateRef.current.accountId;

        await fetchState(accountId)
          .then(updateState)
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
      dispatch: ComponentProps["dispatch"] = async (
        action,
        hostUrlOverride?: string,
        skipStateUpdate?: true
      ) => {
        const res = await dispatchCore(
          action,
          clientParams,
          uiStateRef.current.accountId,
          hostUrlOverride
        );

        let newState: Client.State | undefined;
        if (!skipStateUpdate && res.diffs && res.diffs.length > 0) {
          newState = R.clone(coreStateRef.current!);
          applyPatch(newState, res.diffs);
          setCoreState(newState);
        }

        // give state a chance to update
        await new Promise((resolve) => requestAnimationFrame(resolve));

        return {
          ...res,
          state: newState ? newState : coreState,
        } as Client.DispatchResult & { status: number };
      };

    useEffect(() => {
      // ensures we don't start trying to connect to core proc until it's running and the auth token has been retrieved from OS keyring and added to user agent
      if (!navigator.userAgent.startsWith(Client.CORE_PROC_AGENT_NAME)) {
        return;
      }

      window.addEventListener("beforeunload", () => {
        console.log("window beforeunload event--disconnecting client");
        if (coreState && !coreState.locked) {
          dispatch({ type: Client.ActionType.DISCONNECT_CLIENT });
        }
      });
      const client = new ReconnectingWebSocket("ws://localhost:19048");
      client.addEventListener("open", onSocketUpdate);
      client.addEventListener("message", (e) => {
        const msg = JSON.parse(e.data) as Client.LocalSocketMessage;

        if (msg.type == "closing") {
          // window.electron.quit();
        } else if (msg.type == "update") {
          onSocketUpdate(e);
        } else if (msg.type == "diffs") {
          const newState = R.clone(coreStateRef.current!);
          applyPatch(newState, msg.diffs);
          setCoreState(newState);
        } else {
          console.log(
            "Received unknown socket message for core proc: ",
            e.data
          );
        }
      });

      fetchCoreState();
    }, [navigator.userAgent]);

    useLayoutEffect(() => {
      forceRenderStyles();
    }, []);

    useEffect(() => {
      if (
        uiStateRef.current.accountId &&
        uiStateRef.current.accountId != uiStateRef.current.loadedAccountId
      ) {
        fetchCoreState();
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
        console.log("Root - upgrade progress", { progress });
        console.log("Root - clientUpgrade progress", { clientUpgradeProgress });
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
        console.log("Root - upgrade available", availableUpgrade);
        setAvailableClientUpgrade(availableUpgrade);
      });

      // this is only called if there was no desktop upgrade
      // (just CLI or envkey-source), otherwise the app will
      // restart with the latest version
      window.electron.registerUpgradeCompleteHandler(() => {
        console.log("Root - upgrade complete");

        setTimeout(() => {
          setClientUpgradeProgress({});
          setAvailableClientUpgrade({});
          alert("Upgrade complete.");
        }, 2000);
      });

      window.electron.registerUpgradeErrorHandler(() => {
        console.log("Root - upgrade error");
        alert("There was a problem downloading the upgrade.");
        setClientUpgradeProgress({});
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
