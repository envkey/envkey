import { BaseArgs } from "../types";
import chalk from "chalk";
import { spinnerWithText, stopSpinner } from "./spinner";
import { Client, Model } from "@core/types";
import { spawn } from "child_process";
import { isAlive, stop, dispatchCore, fetchState } from "@core/lib/core_proc";
import { getCoreProcAuthToken } from "@core/lib/client_store/key_store";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import { authenticate } from "./auth";
import { resolveUpgrades } from "./upgrades";
import { unlock, enforceDeviceSecuritySettings } from "./crypto";
import { exit } from "./process";
import { forceApplyPatch } from "@core/lib/utils/patch";
import * as semver from "semver";
import { version as cliVersion } from "../../package.json";
import { isAutoMode } from "./console_io";

const clientParams: Client.ClientParams<"cli"> = {
  clientName: "cli",
  clientVersion: cliVersion,
};

let state: Client.State,
  accountIdOrCliKey: string | undefined,
  encryptedAuthToken: string | undefined,
  auth: Client.ClientUserAuth | Client.ClientCliAuth | undefined;

const isLocalDev = process.env.NODE_ENV !== "production";

export const getState = () => state,
  refreshState = async (overrideAccountIdOrCliKey?: string) => {
    if (!encryptedAuthToken) {
      encryptedAuthToken = await getCoreProcAuthToken();
    }

    state = await fetchState(
      overrideAccountIdOrCliKey ?? accountIdOrCliKey,
      encryptedAuthToken
    );
    if (
      overrideAccountIdOrCliKey &&
      overrideAccountIdOrCliKey !== accountIdOrCliKey
    ) {
      accountIdOrCliKey = overrideAccountIdOrCliKey;
    }

    return state;
  },
  stopCore = async () => {
    if (!(await isAlive())) {
      return false;
    } else {
      spinnerWithText("Stopping EnvKey core process...");
      await stop();
      stopSpinner();
      console.error("Core process stopped.\n");
      return true;
    }
  },
  restartCore = () => stopCore().then((res) => res && startCore()),
  startCore = async (inline = false) => {
    const alive = await isAlive();

    if (typeof alive == "string") {
      if (semver.valid(alive) && semver.gt(cliVersion, alive)) {
        const res = await stop();
        if (!res) {
          return exit(
            1,
            chalk.bold.red(
              "Couldn't stop EnvKey core process that is running an outdated version."
            )
          );
        }
      } else {
        return false;
      }
    }

    process.env.WORKER_PATH =
      "/snapshot/v2/private/ci_cd/cli-builder/build/workspace/worker.js";

    if (inline) {
      // @ts-ignore
      __non_webpack_require__(
        "/snapshot/v2/private/ci_cd/cli-builder/build/workspace/envkey-core.js"
      );
    } else {
      const executableName =
        process.env.NODE_ENV === "production" ? process.execPath : "npm";

      const spawnArgs = isLocalDev
        ? ["run", "core-process"]
        : [process.argv[1], "core", "start", "--inline"];

      console.log(`Starting EnvKey core process...`);

      const child = spawn(executableName, spawnArgs, {
        detached: true,
        shell: false,
        // running core inline will do its own log file
        stdio: "ignore",
      });

      child.on("error", (err) => console.log(err));
      child.unref();

      while (!(await isAlive())) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    return true;
  },
  /**
   * Sets global `state`, session/auth, and org graph.
   *
   * Has side effects - Will force application exit if failing
   * to fetch state from core_process or remote server.
   */

  initCore = async <
    RequireAuthType extends boolean,
    AuthType extends RequireAuthType extends true
      ? Client.ClientUserAuth | Client.ClientCliAuth
      : undefined = RequireAuthType extends true
      ? Client.ClientUserAuth | Client.ClientCliAuth
      : undefined
  >(
    argv: BaseArgs,
    requireAuth: RequireAuthType,
    forceChooseAccount?: true,
    lockOrUnlock?: true,
    maybeTargetObjectId?: string
  ): Promise<{ auth: AuthType; state: Client.State }> => {
    await startCore();
    encryptedAuthToken = await getCoreProcAuthToken();
    state = await fetchState(undefined, encryptedAuthToken);

    if (lockOrUnlock) {
      return { state, auth: undefined as AuthType };
    } else if (state.locked) {
      if (isAutoMode()) {
        return exit(
          1,
          "EnvKey is locked. Please run `envkey unlock` then try again."
        );
      }
      state = await unlock();
    }

    if (requireAuth) {
      ({ auth, accountIdOrCliKey } = await authenticate(
        state,
        argv,
        forceChooseAccount,
        maybeTargetObjectId
      ));

      state = await fetchState(accountIdOrCliKey, encryptedAuthToken);
    }

    let fetchedSession = false;
    if (auth && auth.privkey && !state.graphUpdatedAt) {
      if (auth.type == "clientUserAuth") {
        const res = await dispatch({
          type: Client.ActionType.REFRESH_SESSION,
        });

        if (!res.success) {
          return exit(
            1,
            chalk.bold.red("EnvKey CLI initialization error: ") +
              JSON.stringify(res.state.fetchSessionError)
          );
        }

        state = res.state;
        fetchedSession = true;
      } else if (auth.type == "clientCliAuth") {
        const res = await dispatch({
          type: Client.ActionType.AUTHENTICATE_CLI_KEY,
          payload: { cliKey: accountIdOrCliKey! },
        });

        if (!res.success) {
          return exit(
            1,
            chalk.bold.red("EnvKey CLI initialization error: ") +
              JSON.stringify((res.resultAction as any).payload)
          );
        }

        state = res.state;
      }
    }

    if (auth && state.graph && state.graph[auth.orgId]) {
      await enforceDeviceSecuritySettings(
        state,
        state.graph[auth.orgId] as Model.Org
      );
    }

    state = await resolveUpgrades(
      state,
      auth,
      accountIdOrCliKey,
      fetchedSession
    );

    return { state, auth: auth as AuthType };
  },
  dispatch = async <T extends Client.Action.EnvkeyAction>(
    action: Client.Action.DispatchAction<T>,
    accountIdOrCliKeyFallback?: string,
    hostUrlOverride?: string
  ) => {
    const encryptedAuthToken = await getCoreProcAuthToken();
    if (!state) {
      state = await fetchState(
        accountIdOrCliKey ?? accountIdOrCliKeyFallback,
        encryptedAuthToken
      );
    }

    const res = await dispatchCore(
      action,
      clientParams,
      accountIdOrCliKey ?? accountIdOrCliKeyFallback,
      hostUrlOverride,
      encryptedAuthToken
    );

    const newState = R.clone(state);

    if (res.diffs && res.diffs.length > 0) {
      forceApplyPatch(newState, res.diffs);
    }

    state = newState;

    if (state.throttleError) {
      const [canManageBilling, org] =
        (accountIdOrCliKey ?? accountIdOrCliKeyFallback) &&
        state.graphUpdatedAt &&
        g.authz.hasOrgPermission(
          state.graph,
          (accountIdOrCliKey ?? accountIdOrCliKeyFallback)!,
          "org_manage_billing"
        )
          ? [true, g.getOrg(state.graph)]
          : [false];

      await dispatch(
        {
          type: Client.ActionType.CLEAR_THROTTLE_ERROR,
        },
        accountIdOrCliKeyFallback,
        hostUrlOverride
      );

      return exit(
        1,
        chalk.red.bold(
          `\nYour request has been throttled.\n\nThrottle error: ${
            state.throttleError.error.message ?? "usage limits exceeded"
          }.\n\n${
            canManageBilling
              ? `Upgrade your org's license to increase your limits. To manage billing: open the EnvKey UI, ensure you're signed in to '${
                  org!.name
                }', click the settings menu dropdown at the top of the sidebar, then click 'Billing'.`
              : "Contact an org owner about upgrading your license and increasing your limits."
          }`
        )
      );
    }

    return {
      ...res,
      state,
    } as Client.DispatchResult;
  },
  disconnect = () => dispatch({ type: Client.ActionType.DISCONNECT_CLIENT });
