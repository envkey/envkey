import { Api, Client, Graph, Model } from "@core/types";
import { BaseArgs, DetectedApp } from "./types";
import path from "path";
import fs from "fs";
import os from "os";
import dotenv from "dotenv";
import { sha256 } from "@core/lib/crypto/utils";
import { getCoreProcAuthToken } from "@core/lib/client_store/key_store";
import { alwaysWriteError } from "./lib/console_io";
import { fetchState } from "@core/lib/core_proc";
import {
  getEnvironmentName,
  getEnvironmentsByEnvParentId,
  graphTypes,
} from "@core/lib/graph";
import { dispatch } from "./lib/core";
import chalk from "chalk";

export const argIsEnvironment = (
  graph: Graph.Graph,
  appId: string,
  firstArg?: string
): boolean => {
  return Boolean(
    getEnvironmentsByEnvParentId(graph)?.[appId]?.find((env) =>
      [getEnvironmentName(graph, env.id).toLowerCase(), env.id].includes(
        firstArg?.toLowerCase() || ""
      )
    )
  );
};

// returns true if successfully performed override on account. You MUST re-exec (or at least re-auth).
export const tryApplyDetectedAppOverride = (
  userId: string,
  argv: BaseArgs
): boolean => {
  const hasNoAccountArgv =
    !argv["account"] && // important: infinite loop protection due to passing --account
    !argv["cli-envkey"] &&
    !argv["org"];
  const hasOverride = Boolean(
    argv["detectedApp"] && argv["detectedApp"].accountId !== userId
  );
  const canReExec = hasNoAccountArgv && hasOverride;
  if (canReExec) {
    argv["account"] = argv["detectedApp"]!.accountId;
    logDetectedAccount(argv["detectedApp"]!);
    return true;
  }
  return false;
};

// Precedence: look in environment vars, then local directory up for .env file,
// then a directory up, and so on
export const detectApp = async (
  state: Client.State,
  argv: BaseArgs,
  workingDir: string
): Promise<DetectedApp | undefined> => {
  if (process.env.ENVKEY) {
    return envkeyToDetectedApp(
      state,
      argv,
      process.env.ENVKEY,
      undefined,
      undefined
    );
  }
  return findEnvkeyOrConfigRecursive(state, argv, workingDir);
};

const findEnvkeyOrConfigRecursive = async (
  state: Client.State,
  argv: BaseArgs,
  presentDir: string
): Promise<DetectedApp | undefined> => {
  try {
    const detected = await dotEnvkeyFileToDetectedApp(state, argv, presentDir);

    if (detected) {
      return detected;
    }
  } catch (ignored) {
    logVerbose(argv, "detect app warning:", ignored.toString());
  }

  const dotenvFile = path.join(presentDir, ".env");
  try {
    logVerbose(argv, "detect app: checking for .env:", presentDir);
    const envBuf = await fs.promises.readFile(dotenvFile).catch((err) => {
      if (err.code === "ENOENT") {
        return undefined;
      }
    });
    if (envBuf) {
      logVerbose(argv, "detect app: found .env:", dotenvFile);
      const vars = dotenv.parse(envBuf);
      if (vars.ENVKEY) {
        logVerbose(
          argv,
          "detect app: found ENVKEY:",
          vars.ENVKEY.substring(0, 6) + "****"
        );
        return envkeyToDetectedApp(
          state,
          argv,
          vars.ENVKEY,
          dotenvFile,
          undefined
        );
      }
    }
  } catch (ignored) {
    logVerbose(argv, "detect app warning:", ignored.toString());
  }

  // bump one up
  const nextDir = path.resolve(presentDir, "../"); // up one
  // resolve won't recurse past "C:\\" or "/" and keep returning the same
  if (
    !nextDir ||
    // top of posix fs
    nextDir === "/" ||
    // top of win32 without mount letter
    nextDir.slice(1) === ":\\"
  ) {
    return;
  }
  return findEnvkeyOrConfigRecursive(state, argv, nextDir);
};

const dotEnvkeyFileToDetectedApp = async (
  state: Client.State,
  argv: BaseArgs,
  presentDir: string
): Promise<DetectedApp | undefined> => {
  const dotenvkeyFile = path.join(presentDir, ".envkey");

  let appId: string | undefined;
  let orgId: string | undefined;

  try {
    logVerbose(argv, "detect app: checking for .envkey:", dotenvkeyFile);
    const buf = await fs.promises.readFile(dotenvkeyFile).catch((err) => {
      if (err.code === "ENOENT") {
        return undefined;
      }
    });
    if (buf) {
      logVerbose(argv, "detect app: found .envkey:", dotenvkeyFile);
      ({ appId, orgId } = JSON.parse(buf.toString()) as {
        orgId: string;
        appId: string;
      });
      logVerbose(argv, "detect app: appId->", appId, " orgId->", orgId);
    }
  } catch (ignored) {
    logVerbose(argv, "detect app warning:", ignored.toString());
  }

  if (!(appId && orgId)) {
    return;
  }

  // see if an envkey has been generated for this app
  const envkeyFile = path.join(os.homedir(), ".envkey", "apps", appId + ".env");

  try {
    const envBuf = await fs.promises.readFile(envkeyFile);
    if (envBuf) {
      const vars = dotenv.parse(envBuf);
      if (vars.ENVKEY) {
        return envkeyToDetectedApp(
          state,
          argv,
          vars.ENVKEY,
          undefined,
          dotenvkeyFile,
          appId,
          orgId
        );
      }
    }
  } catch (ignored) {
    logVerbose(argv, "detect app warning:", ignored.toString());
  }

  const account = Object.values(state.orgUserAccounts).find(
    (acct) => acct && acct.orgId == orgId
  );

  if (!account) {
    logVerbose(argv, "account not found for orgId->", orgId);
    return undefined;
  }

  const encryptedAuthToken = await getCoreProcAuthToken();
  let updatedState = await fetchState(account.userId, encryptedAuthToken);
  if (account.token) {
    if (!updatedState.graphUpdatedAt) {
      const res = await dispatch({
        type: Client.ActionType.REFRESH_SESSION,
      });

      if (!res.success) {
        logVerbose(
          argv,
          "account found for orgId->",
          orgId,
          "but couldn't load graph"
        );
        return undefined;
      }

      updatedState = res.state;
    }
  }

  return {
    appId,
    appName: (updatedState.graph[appId] as Model.App)?.name ?? "",
    orgName: account.orgName,
    accountId: account.userId,
    dotenvFile: undefined,
    dotenvkeyFile: dotenvkeyFile,
    environmentId: undefined,
    localKeyId: undefined,
    foundEnvkey: undefined,
    envkeyFromEnvironment: false,
  };
};

const envkeyToDetectedApp = async (
  state: Client.State,
  argv: BaseArgs,
  foundEnvkey: string,
  dotenvFile: string | undefined,
  dotenvkeyFile: string | undefined,
  appIdArg?: string,
  orgIdArg?: string
): Promise<DetectedApp | undefined> => {
  let appId = appIdArg;
  let orgId = orgIdArg;

  // lookup the envkey locally
  const envkeyParts = foundEnvkey.split("-");
  const envkeyIdPart = envkeyParts[0];
  const possibleEnvkeyHost = envkeyParts.slice(2).join("-");
  const envkeyIdPartHash = sha256(envkeyIdPart);
  const accountIds = Object.keys(state.orgUserAccounts);
  const encryptedAuthToken = await getCoreProcAuthToken();
  let updatedState: Client.State;
  let matchedEnvkey: Model.GeneratedEnvkey | undefined;

  logVerbose(argv, "detect app: searching for id part hash", envkeyIdPartHash);

  for (let accountId of accountIds) {
    const account = state.orgUserAccounts[accountId]!;
    if (!account.token) {
      continue;
    }

    updatedState = await fetchState(accountId, encryptedAuthToken);
    if (!updatedState.graphUpdatedAt) {
      const res = await dispatch({
        type: Client.ActionType.REFRESH_SESSION,
      });
      if (!res.success) {
        logVerbose(
          argv,
          "account found for orgId->",
          orgId,
          "but couldn't load graph"
        );
        continue;
      }
      updatedState = res.state;
    }

    matchedEnvkey = graphTypes(updatedState.graph).generatedEnvkeys.find(
      (key) => {
        logVerbose(
          argv,
          "detect app: checking key id hash",
          key.envkeyIdPartHash
        );
        return key.envkeyIdPartHash === envkeyIdPartHash;
      }
    );
    if (!matchedEnvkey) {
      logVerbose(argv, "detect app: not in accountId", accountId);
      continue;
    }

    appId = matchedEnvkey.appId;
    orgId = account.orgId;

    const out: DetectedApp = {
      appId: matchedEnvkey.appId!,
      appName:
        (updatedState.graph[matchedEnvkey.appId] as Model.App)?.name ?? "",
      orgName: account.orgName,
      accountId,
      dotenvFile,
      dotenvkeyFile,
      environmentId: matchedEnvkey.environmentId,
      localKeyId: matchedEnvkey.keyableParentId,
      foundEnvkey,
      envkeyFromEnvironment: !dotenvFile && !dotenvkeyFile,
    };
    logVerbose(argv, "detect app: matched", out);
    return out;
  }

  logVerbose(
    argv,
    "detect app: did not find account, now looking up external",
    possibleEnvkeyHost
  );

  if (!(appId && orgId)) {
    try {
      const res = await dispatch(
        {
          type: Api.ActionType.CHECK_ENVKEY,
          payload: {
            envkeyIdPart,
          },
        },
        undefined,
        possibleEnvkeyHost
      );
      if (!res.success) {
        logVerbose(
          argv,
          "detect app: failed external lookup",
          res.resultAction ?? res
        );
        return;
      }
      ({ appId, orgId } = (res.resultAction as any)?.payload ?? {});

      if (appId && orgId) {
        logVerbose(argv, "detect app: fetch envkey attrs", {
          appId,
          orgId,
        });
      }
    } catch (err) {
      logVerbose(argv, "detect app: fetch crash", err);
      return;
    }
  }

  if (!appId || !orgId) {
    return;
  }

  const account = Object.values(state.orgUserAccounts).find(
    (a) => a?.orgId === orgId
  ) as Client.ClientUserAuth | undefined;

  if (!account?.userId) {
    console.log(
      `Detected ENVKEY ${foundEnvkey.substring(0, 4)}***** from ${
        dotenvFile || "environment"
      }, but there is no corresponding local account.`
    );
    return;
  }

  if (!account.token) {
    return {
      accountId: account.userId,
      appId,
      appName: "",
      orgName: account!.orgName,
      dotenvFile,
      foundEnvkey,
      envkeyFromEnvironment: !dotenvFile && !dotenvkeyFile,
      dotenvkeyFile,
      environmentId: undefined,
      localKeyId: undefined,
    };
  }

  updatedState = await fetchState(account.userId, encryptedAuthToken);
  if (!updatedState.graphUpdatedAt) {
    const res = await dispatch({
      type: Client.ActionType.REFRESH_SESSION,
    });
    if (!res.success) {
      logVerbose(
        argv,
        "account found for orgId->",
        orgId,
        "but couldn't load graph"
      );
      return undefined;
    }
    updatedState = res.state;
  }

  matchedEnvkey = graphTypes(updatedState.graph).generatedEnvkeys.find(
    (key) => {
      logVerbose(
        argv,
        "detect app: checking key id hash",
        key.envkeyIdPartHash
      );
      return key.envkeyIdPartHash === envkeyIdPartHash;
    }
  );

  if (!matchedEnvkey) {
    return;
  }

  const out: DetectedApp = {
    accountId: account.userId,
    appId,
    appName: (updatedState.graph[appId] as Model.App)?.name ?? "",
    orgName: account!.orgName,
    dotenvFile,
    foundEnvkey,
    envkeyFromEnvironment: !dotenvFile && !dotenvkeyFile,
    dotenvkeyFile,
    environmentId: matchedEnvkey.environmentId,
    localKeyId: matchedEnvkey.keyableParentId,
  };
  logVerbose(argv, "detect app: matched externally", out);
  return out;
};

const logDetectedAccount = (detected: DetectedApp): void => {
  if (detected.dotenvkeyFile) {
    console.log(
      `Detected account ${chalk.bold(
        detected.orgName
      )} from .envkey file at ${chalk.bold(detected.dotenvFile)}`
    );
  } else {
    console.log(
      `Detected account ${chalk.bold(
        detected.orgName
      )} from ENVKEY ${chalk.bold(
        detected.foundEnvkey!.substring(0, 6)
      )}****** set in ${
        detected.envkeyFromEnvironment
          ? "environment"
          : ".env file at " + chalk.bold(detected.dotenvFile)
      }`
    );
  }
};

const logVerbose = (argv: BaseArgs, ...args: any) => {
  if (argv["verbose"]) {
    console.error(...args);
  }
};
