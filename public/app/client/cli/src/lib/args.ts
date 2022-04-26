import os from "os";
import { exit } from "./process";
import {
  authz,
  getAppBlocksByComposite,
  getAppRoleForUserOrInvitee,
  getAppUserGrantsByComposite,
  getEnvironmentName,
  getSubEnvironmentsByParentEnvironmentId,
  graphTypes,
} from "@core/lib/graph";
import chalk from "chalk";
import * as R from "ramda";
import { Graph } from "@core/types/client/graph";
import { Client, Model, Rbac } from "@core/types";
import Table from "cli-table3";
import { findEnvironment } from "./envs";
import { getDeletableSubEnvironmentsForEnvParent } from "@core/lib/graph/authz";
import { getChangesetCommitNumber } from "@core/lib/client";
import { getPrompt } from "./console_io";
import {
  argIsEnvironment,
  tryApplyDetectedAppOverride,
} from "../app_detection";
import { initCore } from "./core";
import { BaseArgs } from "../types";

// enquirer doesn't export choice interface

interface EnquirerChoice {
  name: string;
  message: string;
}

export const findUser = (
  graph: Graph.UserGraph,
  userEmailOrId: string,
  deletedGraph?: Graph.UserGraph
): Model.OrgUser | Model.CliUser | undefined => {
  let maybeDevice = graph[userEmailOrId] as Model.OrgUserDevice | undefined;

  if (!maybeDevice && deletedGraph) {
    maybeDevice = deletedGraph[userEmailOrId] as
      | Model.OrgUserDevice
      | undefined;
  }

  if (maybeDevice?.type === "orgUserDevice") {
    const orgUser = graph[maybeDevice.userId] as Model.OrgUser | undefined;
    if (orgUser) {
      return orgUser;
    } else if (deletedGraph) {
      return deletedGraph[maybeDevice.userId] as Model.OrgUser;
    }
  }

  const { orgUsers, cliUsers } = graphTypes(graph);

  const findFn = (u: Model.OrgUser | Model.CliUser) =>
    [u.type === "orgUser" ? u.email : u.name, u.id].includes(userEmailOrId);

  let res = orgUsers.find(findFn) ?? cliUsers.find(findFn);

  if (!res && deletedGraph) {
    const { orgUsers: deletedOrgUsers, cliUsers: deletedCliUsers } =
      graphTypes(deletedGraph);

    res = deletedOrgUsers.find(findFn) ?? deletedCliUsers.find(findFn);
  }

  return res;
};

export const findCliUser = (
  graph: Graph.UserGraph,
  nameOrId: string
): Model.CliUser | undefined =>
  graphTypes(graph)
    .cliUsers.filter((u) => !u.deactivatedAt)
    .find((u) => [u.name, u.id].includes(nameOrId));

export const findApp = (
  graph: Graph.UserGraph,
  nameOrId: string
): Model.App | undefined => {
  const maybeApp = graph[nameOrId];
  if (maybeApp?.type == "app") {
    return maybeApp;
  }
  return graphTypes(graph).apps.find(
    (a) => a.name.toLowerCase() == nameOrId.toLowerCase()
  );
};

export const findKeyableParent = (
  graph: Graph.UserGraph,
  appId: string,
  nameOrId: string
): Model.LocalKey | Model.Server | undefined =>
  graphTypes(graph).localKeys.find(
    (lk) =>
      lk.appId === appId &&
      [lk.name.toLowerCase(), lk.id.toLowerCase()].includes(
        nameOrId.toLowerCase()
      )
  );

export const findBlock = (
  graph: Graph.UserGraph,
  blockName: string
): Model.Block | undefined =>
  graphTypes(graph).blocks.find((b) =>
    [b.name.toLowerCase(), b.id.toLowerCase()].includes(blockName.toLowerCase())
  );

export const findServer = (
  graph: Graph.UserGraph,
  appId: string,
  serverName: string
): Model.Server | undefined =>
  graphTypes(graph).servers.find(
    (s) =>
      s.appId === appId &&
      [s.name.toLowerCase(), s.id.toLowerCase()].includes(
        serverName.toLowerCase()
      )
  );

export const appsConnectBlockMustValidate = (
  graph: Graph.UserGraph,
  appName: string,
  blockName: string
): {
  app: Model.App;
  block: Model.Block;
  existingAppBlock?: Model.AppBlock;
} => {
  // support block/app name or ID
  const app = findApp(graph, appName);
  const block = findBlock(graph, blockName);

  // validations, and check for incorrect args
  if (!app) {
    let message = chalk.red.bold(
      `The app ${appName} does not exist, or you don't have access.`
    );
    const blockNamedApp = graphTypes(graph).blocks.find(
      R.propEq("name", appName)
    );
    if (blockNamedApp) {
      message += "\n" + chalk.bold(`Hint: there is a block named ${appName}`);
    }
    return exit(1, message);
  }
  if (!block) {
    let message = chalk.red.bold(
      `The block ${blockName} does not exist, or you don't have access.`
    );
    const appNamedBlock = graphTypes(graph).apps.find(
      R.propEq("name", blockName)
    );
    if (appNamedBlock) {
      message += "\n" + chalk.bold(`Hint: there is an app named ${blockName}`);
    }
    return exit(1, message);
  }

  const composite = [app.id, block.id].join("|");
  const existingAppBlock = getAppBlocksByComposite(graph)[composite];
  return { app, block, existingAppBlock };
};

export const getAppChoices = (graph: Graph.UserGraph): EnquirerChoice[] => {
  return R.sortBy(
    R.prop("name"),
    graphTypes(graph).apps.map((a) => ({
      name: a.name,
      message: chalk.bold(a.name),
    }))
  );
};

export const getAppAndBlockChoices = (
  graph: Graph.UserGraph
): EnquirerChoice[] => {
  return R.sortBy(R.prop("message"), [
    ...graphTypes(graph).apps.map((a) => ({
      name: a.name,
      message: `App: ${chalk.bold(a.name)}`,
    })),
    ...graphTypes(graph).blocks.map((a) => ({
      name: a.id,
      message: `Block: ${chalk.bold(a.name)}`,
    })),
  ]);
};

export const getAppRoleInviteChoices = (
  graph: Graph.UserGraph,
  appId: string,
  fromUserId: string,
  toUserId: string
): EnquirerChoice[] => {
  return R.sortBy(
    R.prop("name"),
    authz
      .getAccessGrantableAppRolesForUser(graph, fromUserId, appId, toUserId)
      .map((ar) => ({
        name: ar.id,
        message: `${ar.name} - ${ar.description}`,
      }))
  );
};

export const getEnvironmentChoices = (
  graph: Graph.UserGraph,
  currentUserId: string,
  envParentId: string,
  limitByType?: "server" | "localKey",
  environmentIds?: string[]
): EnquirerChoice[] => {
  const allEnvironments = authz.getEnvsReadableForParentId(
    graph,
    currentUserId,
    envParentId
  );
  let subsetEnvironments = allEnvironments;
  if (limitByType) {
    const comparatorProp =
      limitByType === "server" ? "hasServers" : "hasLocalKeys";
    subsetEnvironments = allEnvironments.filter((environment) => {
      const envRole = graph[
        environment.environmentRoleId
      ] as Rbac.EnvironmentRole;
      return envRole[comparatorProp];
    });
  }

  const parentsOnly = subsetEnvironments.filter((e) => !e.isSub);
  const choices = [] as EnquirerChoice[];

  parentsOnly.forEach((parentEnv) => {
    const parentLabel = chalk.bold(getEnvironmentName(graph, parentEnv.id));
    if (!environmentIds || environmentIds.includes(parentEnv.id)) {
      choices.push({
        name: parentEnv.id,
        message: parentLabel,
      });
    }

    const childEnvs =
      getSubEnvironmentsByParentEnvironmentId(graph)[parentEnv.id] ?? [];
    childEnvs.forEach((childEnv) => {
      if (!environmentIds || environmentIds.includes(childEnv.id)) {
        choices.push({
          name: childEnv.id,
          // indented
          message: `${
            !environmentIds || environmentIds.includes(childEnv.envParentId)
              ? "├──"
              : parentLabel + " >"
          } ${chalk.bold(getEnvironmentName(graph, childEnv.id))}`,
        });
      }
    });
  });

  return choices;
};

export const displayFullEnvName = (
  graph: Graph.UserGraph,
  environmentId: string
): string => {
  const env = graph[environmentId] as Model.Environment;
  const parent = env.isSub
    ? (graph[env.parentEnvironmentId] as Model.Environment)
    : null;
  let parentName = parent ? getEnvironmentName(graph, parent.id) + " - " : "";
  return parentName + getEnvironmentName(graph, environmentId);
};

const formatKeyableChoices = (
  graph: Graph.UserGraph,
  list: Model.KeyableParent[],
  appId: string
): EnquirerChoice[] => {
  const filtered = list.filter(R.propEq("appId", appId));
  const choices = filtered.map((s) => ({
    name: s.id,
    message: `${displayFullEnvName(graph, s.environmentId)} - ${chalk.bold(
      s.name
    )}`,
  }));
  return R.sortBy(R.prop("message"), choices);
};

export const getServerChoices = (
  graph: Graph.UserGraph,
  appId: string
): EnquirerChoice[] => {
  return formatKeyableChoices(graph, graphTypes(graph).servers, appId);
};

export const getLocalKeyChoices = (
  graph: Graph.UserGraph,
  appId: string
): EnquirerChoice[] => {
  return formatKeyableChoices(graph, graphTypes(graph).localKeys, appId);
};

export const logAndExitIfActionFailed = async (
  res: Client.DispatchResult,
  failureMessage: string
) => {
  if (!res.success) {
    const resAny = res as any;
    const err =
      resAny.resultAction?.payload?.errorReason ??
      resAny.errorReason ??
      (typeof resAny.resultAction?.payload?.error === "string"
        ? resAny.resultAction?.payload?.error
        : undefined) ??
      resAny.resultAction?.payload?.error?.message ??
      resAny.resultAction?.payload?.status ??
      resAny.status;
    if (err) {
      return await exit(
        1,
        chalk.red(failureMessage) + "\n" + chalk.red.bold(err)
      );
    }
    if (resAny.status === 401) {
      // if payload does not have 401, core proc blocked us, possibly
      return await exit(
        1,
        chalk.red(failureMessage) +
          "\n" +
          chalk.red.bold("Access denied to the envkey core process")
      );
    }
    await exit(1, chalk.red(failureMessage));
  }
};

// Given an array of objects `array`, will sort according to the `desiredOrder` list of `forProp`s.
export const sortByPredefinedOrder = <T extends Record<string, any>>(
  desiredOrder: string[],
  array: T[],
  forProp: keyof T
): T[] => {
  const reordered = [...array];
  reordered.sort((a, b) => {
    return desiredOrder.indexOf(a[forProp]) - desiredOrder.indexOf(b[forProp]);
  });
  return reordered;
};

export const requireUserAppRoleAndGrant = (
  graph: Graph.UserGraph,
  appId: string,
  userId: string
): Model.AppUserGrant => {
  const app = graph[appId] as Model.App;
  const user = graph[userId] as Model.OrgUser;
  const existingAppRole = getAppRoleForUserOrInvitee(graph, appId, userId);
  if (!existingAppRole) {
    return exit(
      1,
      chalk.red(
        `${chalk.bold(user.email)} does not have access to the app ${app.name}.`
      )
    );
  }
  const existingAppUserGrant =
    getAppUserGrantsByComposite(graph)[[userId, appId].join("|")];
  if (!existingAppUserGrant) {
    console.log(
      `${chalk.bold(user.email)} has access to ${
        app.name
      } implied via their org role.`
    );
    return exit();
  }
  return existingAppUserGrant;
};

export const normalizeFilePath = (filePath: string): string => {
  // home dir will be expanded automatically from CLI arg, but not prompted input.
  // fix tilde resolution:
  if (filePath[0] === "~") {
    filePath = os.homedir() + filePath.substring(1);
  }
  return filePath;
};

export const writeEnvKeyTable = (
  graph: Graph.UserGraph,
  keyableParents: Model.Server[] | Model.LocalKey[] | Model.KeyableParent[],
  envParentId: string
) => {
  // group servers by environment

  const table = new Table({
    head: ["Environment", "Key Name", "Key"],
    colWidths: [25, 40, 15],
    style: {
      head: [], //disable colors in header cells
    },
  });

  const environments = graphTypes(graph).environments.filter(
    R.propEq("envParentId", envParentId)
  );

  const groupedByIdOrParent = R.groupBy(
    (env) => (env.isSub ? env.parentEnvironmentId : env.id),
    environments
  );

  R.forEachObjIndexed((envs: Model.Environment[], parentOrSelfId) => {
    for (let env of R.sortBy((a) => (a.isSub ? 1 : -1), envs)) {
      let envName = chalk.bold(getEnvironmentName(graph, env.id));
      if (env.isSub) {
        envName =
          getEnvironmentName(graph, env.parentEnvironmentId) +
          "\n ├──" +
          chalk.bold(envName);
      }
      const envServers = R.sort(
        R.ascend(R.prop("name")),
        keyableParents.filter(R.propEq("environmentId", env.id))
      );

      if (!envServers.length) {
        continue;
      }

      for (let s of envServers) {
        const k = graphTypes(graph).generatedEnvkeys.find(
          (k) => k.keyableParentId === s.id
        );
        const row = [
          envName,
          chalk.bold(s.name),
          k ? `${k.envkeyShort}****` : "<revoked>",
        ];

        table.push(row);
      }
    }
  }, groupedByIdOrParent);

  console.log(table.toString());
};

export const mustSelectSubEnvironmentForDeletion = async (
  graph: Graph.UserGraph,
  currentUserId: string,
  envParentId: string,
  initialSubName?: string,
  parentEnvNameOrId?: string
): Promise<Model.Environment> => {
  const prompt = getPrompt();
  const envParent = graph[envParentId] as Model.EnvParent;
  const allEnvs = getDeletableSubEnvironmentsForEnvParent(
    graph,
    currentUserId,
    envParentId
  );
  let allSubEnvs: Model.Environment[];
  if (parentEnvNameOrId) {
    const p = findEnvironment(graph, envParentId, parentEnvNameOrId);
    if (!p || p.isSub) {
      return exit(1, chalk.red("Parent environment is not valid."));
    }
    allSubEnvs = allEnvs.filter(
      (e) =>
        e.isSub &&
        (e.parentEnvironmentId === parentEnvNameOrId ||
          getEnvironmentName(graph, e.parentEnvironmentId).toLowerCase() ===
            parentEnvNameOrId)
    );
  } else {
    allSubEnvs = allEnvs.filter((e) => e.isSub);
  }

  if (!allSubEnvs.length) {
    return exit(
      1,
      chalk.red.bold(
        `No branches exist for the ${envParent.type}${
          parentEnvNameOrId ? " and parent" : ""
        }!`
      )
    );
  }

  const promptEnvironment = () =>
    prompt<{ environment: string }>({
      type: "autocomplete",
      name: "environment",
      message: "Select branch:",
      initial: 0,
      required: true,
      choices: R.sortBy(
        R.prop("message"),
        allSubEnvs.map((env) => ({
          name: env.id,
          message:
            // isSub makes the compiler happer
            (env.isSub
              ? getEnvironmentName(graph, env.parentEnvironmentId)
              : "") +
            " - " +
            chalk.bold(getEnvironmentName(graph, env.id)),
        }))
      ),
    }).then(R.prop("environment"));

  const subEnvNameOrId = initialSubName ?? (await promptEnvironment());

  // sub env names can repeat under other parents
  const subEnvsChosen = allSubEnvs.filter(
    (env) =>
      env.isSub &&
      // the lookup
      (env.id === subEnvNameOrId ||
        env.subName.toLowerCase() === subEnvNameOrId.toLowerCase())
  ) as Model.Environment[];

  if (!subEnvsChosen.length) {
    return exit(
      1,
      chalk.red(
        `Branch ${chalk.bold(subEnvNameOrId)} does not exist${
          parentEnvNameOrId
            ? " for parent " + chalk.bold(parentEnvNameOrId)
            : ""
        }, or you don't have access.`
      )
    );
  }
  let subEnv: Model.Environment | undefined = subEnvsChosen[0];
  // perhaps they want a sub-env which is duplicated under other parent envs
  if (subEnvsChosen.length > 1) {
    console.log("There is more than one environment with that name.");
    subEnv = graph[await promptEnvironment()] as Model.Environment;
  }

  if (!subEnv) {
    return exit(1, chalk.red(`Branch not found!`));
  }

  return subEnv;
};

export const findEnvironmentWithSubIfDefinedOrError = (
  graph: Graph.UserGraph,
  envParentId: string,
  envParentOrEnvName: string,
  subEnvName: string | undefined
): string | undefined => {
  let environmentId: string | undefined;
  if (subEnvName) {
    const parentEnv = findEnvironment(graph, envParentId, envParentOrEnvName);
    if (!parentEnv) {
      return exit(1, chalk.red("Environment not found"));
    }
    const children =
      getSubEnvironmentsByParentEnvironmentId(graph)[parentEnv.id] ??
      ([] as Model.Environment[]);
    const subEnv = children.find(
      (sub) =>
        sub.id === subEnvName ||
        getEnvironmentName(graph, sub.id).toLowerCase() === subEnvName
    );
    if (!subEnv) {
      return exit(1, chalk.red("Branch not found"));
    }
    environmentId = subEnv.id;
  } else {
    const env = findEnvironment(graph, envParentId, envParentOrEnvName);
    if (!env) {
      return exit(1, chalk.red("Environment not found"));
    }
    environmentId = env.id;
  }

  return environmentId;
};

/**
 * selectPrereqsForVersionCommands requires the command implementing it to
 * have the first two positionals with maybe a third one `command [app-or-block] [environment] [argvThirdPositional?]`
 */
export const selectPrereqsForVersionCommands = async (
  state: Client.State,
  auth: Client.ClientUserAuth | Client.ClientCliAuth,
  argv: BaseArgs & {
    "app-or-block"?: string; // positional 0
    environment?: string; // positional 1
    argvThirdPositional?: number; // positional 2
    branch?: string; // option
    "local-override"?: boolean; // option
    "override-user"?: string; // option
  },
  envTest: (
    graph: Graph.UserGraph,
    currentUserId: string,
    environmentId: string
  ) => boolean,
  envParentArg: Model.EnvParent | undefined
): Promise<
  {
    state: Client.State;
    auth: Client.ClientUserAuth | Client.ClientCliAuth;
    envParent: Model.EnvParent;
    shiftedPositional?: number;
  } & ({ appEnv: Model.Environment } | { localOverrideEnvironmentId: string })
> => {
  const prompt = getPrompt();
  let envParent = envParentArg;
  let appEnv: Model.Environment | undefined;
  let localOverrideEnvironmentId: string | undefined;
  let envParentNameArg = argv["app-or-block"];
  let environmentArg = argv["environment"];
  let shiftedPositional = argv["argvThirdPositional"];

  if (!envParent) {
    ({ auth, state } = await initCore(argv, true));
    // retry normal detection
    if (envParentNameArg) {
      envParent =
        findApp(state.graph, envParentNameArg) ??
        findBlock(state.graph, envParentNameArg);
    }

    if (!envParent) {
      const appId = argv["detectedApp"]?.appId?.toLowerCase();
      if (appId) {
        // ENVKEY=asdf envkey versions inspect 4 --local-overrides
        const firstArgVersion =
          argv["app-or-block"] &&
          !isNaN(parseInt(argv["app-or-block"], 10)) &&
          (argv["local-override"] || argv["override-user"]);
        // ENVKEY=asdf envkey versions ls development
        // ENVKEY=asdf envkey versions inspect development 3
        const envFirst = argIsEnvironment(state.graph, appId, envParentNameArg);
        const otherArgsValid =
          !argv["app-or-block"] || firstArgVersion || envFirst;
        if (otherArgsValid) {
          envParent = state.graph[appId] as Model.App | undefined;
          if (envParent) {
            console.log("Detected app", chalk.bold(envParent.name), "\n");

            if (firstArgVersion) {
              shiftedPositional = parseInt(argv["app-or-block"] as string, 10);
            } else if (envFirst) {
              if (environmentArg) {
                shiftedPositional = parseInt(environmentArg, 10);
              }
              environmentArg = envParentNameArg;
            }
          }
        }
      }
    }
  }

  if (!envParent) {
    const envParentChoices = R.sortBy(
      R.prop("message"),
      authz
        .getEnvParentsPassingEnvTest(state.graph, auth.userId, envTest)
        .map((envParent) => ({
          name: envParent.id,
          message: `${envParent.type}: ${envParent.name}`,
        }))
    );
    if (!envParentChoices.length) {
      console.log(
        `You don't have access to any apps or blocks for this action.`
      );
      return exit();
    }
    const envParentName = (
      await prompt<{ envParentName: string }>({
        type: "autocomplete",
        name: "envParentName" + "",
        message: "App/Block:",
        choices: envParentChoices,
      })
    ).envParentName as string;
    envParent =
      findApp(state.graph, envParentName) ||
      findBlock(state.graph, envParentName);
  }

  if (!envParent) {
    return exit(1, chalk.red.bold("App or block not found."));
  }

  if (argv["local-override"]) {
    localOverrideEnvironmentId = [envParent.id, auth.userId].join("|");
    return {
      auth,
      state,
      shiftedPositional,
      envParent,
      localOverrideEnvironmentId,
    };
  }

  if (argv["override-user"]) {
    const otherUser =
      findUser(state.graph, argv["override-user"]) ||
      findCliUser(state.graph, argv["override-user"]);
    if (!otherUser) {
      return exit(1, chalk.red.bold("User not found for override."));
    }
    if (
      !authz.canReadLocals(
        state.graph,
        auth.userId,
        envParent.id!,
        otherUser.id!
      )
    ) {
      return exit(
        1,
        chalk.red.bold("You don't have override permissions for that user.")
      );
    }
    localOverrideEnvironmentId = [envParent.id, otherUser.id].join("|");
    return {
      state,
      auth,
      shiftedPositional: 0,
      envParent,
      localOverrideEnvironmentId,
    };
  }

  // regular environment or sub
  const environmentChoices = getEnvironmentChoices(
    state.graph,
    auth.userId,
    envParent.id
  );
  if (!environmentChoices) {
    return exit(
      1,
      chalk.red(
        `You don't have access to perform this action for the environments under ${chalk.bold(
          envParent.name
        )}.`
      )
    );
  }

  if (environmentArg && argv["branch"]) {
    appEnv = graphTypes(state.graph)
      // find branch
      .environments.filter((e) => e.envParentId === envParent!.id && e.isSub)
      .find((e) => {
        const matchedParent = findEnvironment(
          state.graph,
          e.envParentId,
          environmentArg!
        );
        return (
          matchedParent &&
          e.isSub &&
          e.parentEnvironmentId === matchedParent.id &&
          findEnvironment(state.graph, e.envParentId, argv["branch"]!)
        );
      });
    if (!appEnv) {
      return exit(
        1,
        chalk.red(
          `The branch does not exist, or it did not match the parent environment for the ${chalk.bold(
            envParent.type
          )}.`
        )
      );
    }
  } else {
    const environmentName = (environmentArg ??
      (
        await prompt<{ environment: string }>({
          type: "autocomplete",
          name: "environment",
          message: "Select app environment:",
          initial: 0,
          choices: environmentChoices,
        })
      ).environment) as string;

    appEnv = findEnvironment(state.graph, envParent.id, environmentName);
  }
  if (!appEnv) {
    return exit(1, chalk.red("Invalid environment"));
  }
  if (!envTest(state.graph, auth.userId, appEnv.id)) {
    return exit(
      1,
      chalk.red(
        "You lack permission to perform the action for that environment."
      )
    );
  }

  return {
    state,
    auth,
    shiftedPositional,
    envParent,
    appEnv,
  };
};

export const printChangesetSummary = (
  state: Client.State,
  params: Client.Env.ListVersionsParams,
  changeset: Client.Env.Changeset
): string => {
  const user = findUser(state.graph, changeset.createdById, state.deletedGraph);
  let userInfo = "unknown user";
  if (user) {
    userInfo =
      `Commit: #${getChangesetCommitNumber(state, params, changeset)}\n` +
      "Author: " +
      (user.type === "orgUser"
        ? `${user.firstName} ${user.lastName} <${user.email}>`
        : `CLI Key - ${user.name}`);
  }
  return `${userInfo}\nDate:   ${new Date(changeset.createdAt).toISOString()} ${
    changeset.message ? "\n\n" + changeset.message : ""
  }`;
};
