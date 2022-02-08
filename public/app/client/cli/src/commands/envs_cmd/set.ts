import * as R from "ramda";
import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { BaseArgs } from "../../types";
import {
  authz,
  graphTypes,
  getEnvironmentsByEnvParentId,
  getEnvironmentName,
  getSubEnvironmentsByParentEnvironmentId,
} from "@core/lib/graph";
import { initCore, dispatch, getState } from "../../lib/core";
import {
  parseKeyValuePairs,
  getShowEnvs,
  fetchEnvsIfNeeded,
  findEnvironment,
} from "../../lib/envs";
import { confirmPendingConflicts } from "../../lib/conflicts";
import { parseMultiFormat } from "@core/lib/parse";
import { Model, Client } from "@core/types";
import { hasPendingConflicts } from "@core/lib/client";
import { getPending } from "../../lib/envs";
import chalk from "chalk";
import { spinnerWithText, stopSpinner } from "../../lib/spinner";
import {
  findCliUser,
  findUser,
  getEnvironmentChoices,
  logAndExitIfActionFailed,
} from "../../lib/args";
import { autoModeOut, getPrompt, isAutoMode } from "../../lib/console_io";
import {
  argIsEnvironment,
  tryApplyDetectedAppOverride,
} from "../../app_detection";

export const command = "set [app-or-block] [environment] [kv-pairs...]";
export const desc = "Add, edit, or delete environment variables.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs
    .positional("app-or-block", { type: "string" })
    .positional("environment", { type: "string" })
    .positional("kv-pairs", {
      type: "string",
      describe: 'Accepts KEY=val or json (\'{"KEY": "val"}\')',
    })
    .array("kv-pairs")
    .option("empty", {
      type: "string",
      describe: "Set a variable to empty",
    })
    .option("remove", {
      type: "string",
      describe: "Delete a variable from the environment",
    })
    .option("branch", {
      type: "string",
      alias: "b",
      coerce: R.toLower,
    })
    .option("local-override", {
      type: "boolean",
      alias: ["l", "local-overrides"],
      describe: "Set this key as a local override for the current user",
    })
    .option("override-user", {
      type: "string",
      alias: ["u", "override-for-user", "overrides-for-user"],
      describe:
        "Set this key as a local override for another user by email or id",
      conflicts: ["local-override"],
      coerce: (value) => {
        if (!value) {
          throw new Error("Missing user override");
        }
        return value;
      },
    })
    .option("commit", {
      type: "boolean",
      alias: "c",
      describe: "Commit this change immediately",
    })
    .option("message", {
      type: "string",
      alias: "m",
      implies: "commit",
      describe: "Add a commit message",
    });
export const handler = async (
  argv: BaseArgs & {
    "app-or-block"?: string;
    environment?: string;
    branch?: string;
    "kv-pairs"?: string[];
    empty?: string;
    remove?: string;
    "local-override"?: boolean;
    "override-user"?: string;
    commit?: boolean;
    message?: string;
  }
): Promise<void> => {
  const prompt = getPrompt();
  let { state, auth } = await initCore(argv, true);

  let envParent: Model.EnvParent | undefined,
    environment: Model.Environment | undefined,
    environmentChoiceIds: string[] | undefined,
    envIdOrUserOverride: string,
    arg1Type: "envParent" | "environment" | undefined,
    arg2Type: "environment" | undefined,
    localOverrideForUserId: string | undefined;

  const { apps, blocks } = graphTypes(state.graph),
    envParents = [...apps, ...blocks],
    envParentsByName = R.indexBy(R.pipe(R.prop("name"), R.toLower), envParents),
    envParentsById = R.indexBy(R.pipe(R.prop("id"), R.toLower), envParents);

  if (!envParents.length) {
    return exit(
      1,
      chalk.red.bold("Create an app before setting config values.")
    );
  }

  if (argv["app-or-block"]) {
    envParent =
      envParentsByName[argv["app-or-block"].toLowerCase()] ??
      envParentsById[argv["app-or-block"].toLowerCase()];
    if (envParent) {
      arg1Type = "envParent";
    }
  }

  if (!envParent) {
    if (tryApplyDetectedAppOverride(auth.userId, argv)) {
      return handler(argv);
    }
    const appId = argv["detectedApp"]?.appId?.toLowerCase();
    if (appId) {
      const otherArgsValid =
        !argv["app-or-block"] ||
        argv["app-or-block"].includes("=") ||
        argIsEnvironment(state.graph, appId, argv["app-or-block"]);
      if (otherArgsValid) {
        envParent = envParentsByName[appId] ?? envParentsById[appId];
        if (envParent) {
          console.log("Detected app", chalk.bold(envParent.name), "\n");
        }
      }
    }
  }

  if (!envParent) {
    // determine if there's a default app
    // if app not found via arg or default, prompt for it

    const { name } = await prompt<{ name: string }>({
      type: "autocomplete",
      name: "name",
      message:
        "Choose an " +
        chalk.bold("app") +
        " or " +
        chalk.bold("block") +
        " (type to search):",
      initial: 0,
      choices: envParents.map((envParent) => ({
        name: envParent.name,
        message: chalk.bold(envParent.name),
      })),
    });

    envParent = envParentsByName[name.toLowerCase()];
  }

  const environmentsByName = R.groupBy(
    (e) => getEnvironmentName(state.graph, e.id).toLowerCase(),
    getEnvironmentsByEnvParentId(state.graph)[envParent.id] ?? []
  );

  if (argv["environment"]) {
    const name = argv["environment"];
    const environments = environmentsByName[name.toLowerCase()] ?? [];
    if (environments.length == 1) {
      environment = environments[0];
    } else if (environments.length > 1) {
      environmentChoiceIds = environments.map(R.prop("id"));
    }
    if (environment) {
      arg2Type = "environment";
    }
  }

  if (!environment && argv["app-or-block"] && !arg1Type) {
    const name = argv["app-or-block"];
    const environments = environmentsByName[name.toLowerCase()] ?? [];
    if (environments.length == 1) {
      environment = environments[0];
    } else if (environments.length > 1) {
      environmentChoiceIds = environments.map(R.prop("id"));
    }
    if (environment) {
      arg1Type = "environment";
    }
  }

  if (argv["branch"]) {
    const name = argv["branch"];
    if (environment) {
      const subEnvironmentsByName = R.indexBy(
        (sub) => (sub.isSub ? sub.subName.toLowerCase() : ""),
        getSubEnvironmentsByParentEnvironmentId(state.graph)[environment.id] ??
          []
      );
      environment = subEnvironmentsByName[name.toLowerCase()];
    } else {
      const environments = environmentsByName[name.toLowerCase()] ?? [];
      if (environments.length == 1) {
        environment = environments[0];
      } else if (environments.length > 1) {
        environmentChoiceIds = environments.map(R.prop("id"));
      }
    }
  }

  if (argv["local-override"]) {
    localOverrideForUserId = auth.userId;
  } else if (argv["override-user"]) {
    const otherUser =
      findUser(state.graph, argv["override-user"]) ||
      findCliUser(state.graph, argv["override-user"]);
    if (!otherUser) {
      return exit(1, chalk.red.bold("User not found for override."));
    }
    localOverrideForUserId = otherUser.id;
    if (
      !authz.canUpdateLocals(
        state.graph,
        auth.userId,
        envParent.id,
        localOverrideForUserId!
      )
    ) {
      return exit(
        1,
        chalk.red.bold(
          "You don't have permission to change the environment for that user."
        )
      );
    }
  } else {
    // traditional environment
    if (!environment) {
      if (argv["detectedApp"]) {
        environment = findEnvironment(
          state.graph,
          envParent.id,
          argv["detectedApp"].environmentId ?? "development"
        );
      }
    }

    if (!environment) {
      const { name } = await prompt<{ name: string }>({
        type: "autocomplete",
        name: "name",
        message:
          "Choose an " + chalk.bold("environment") + " (type to search):",
        initial: 0,
        choices: getEnvironmentChoices(
          state.graph,
          auth.userId,
          envParent.id,
          undefined,
          environmentChoiceIds
        ),
      });

      environment = findEnvironment(state.graph, envParent.id, name);
    }
    if (!environment) {
      return exit(
        1,
        chalk.red("Environment is not found, or you don't have access.")
      );
    }
  }

  let kvArgs: string[] = [];

  if (argv["kv-pairs"]) {
    kvArgs = kvArgs.concat(argv["kv-pairs"]);
  }

  if (argv["app-or-block"] && !arg1Type) {
    kvArgs.push(argv["app-or-block"]);
  }

  if (argv["environment"] && !arg2Type) {
    kvArgs.push(argv["environment"]);
  }

  if (kvArgs.length == 0 && !(argv["empty"] || argv["remove"])) {
    const { kvString } = await prompt<{ kvString: string }>({
      type: "input",
      name: "kvString",
      message: "Set variables in " + chalk.bold("KEY=val") + " format",
      validate: (s: string) =>
        s && s.trim() && parseMultiFormat(s, ["env"]) ? true : "Invalid input",
    });
    kvArgs.push(kvString);
  }

  const kv = parseKeyValuePairs(kvArgs);

  if (argv["empty"]) {
    kv[argv["empty"]] = "";
  }
  if (argv["remove"]) {
    // Special case of setting key to undefined - better than modifying the type of RawEnv and losing safety elsewhere
    // @ts-ignore
    kv[argv["remove"]] = undefined;
  }

  state = await fetchEnvsIfNeeded(state, [envParent.id]);

  envIdOrUserOverride = localOverrideForUserId
    ? [envParent.id, localOverrideForUserId].join("|")
    : environment!.id; // wont be undefined when localOverrideForUserId is set

  if (
    !authz.canUpdateLocals(
      state.graph,
      auth.userId,
      envParent.id,
      envIdOrUserOverride
    )
  ) {
    return exit(
      1,
      chalk.red.bold(
        `You don't have permission to modify the environment ${chalk.bold(
          envIdOrUserOverride
        )}.`
      )
    );
  }

  for (let k of Object.keys(kv)) {
    let val: string | undefined = kv[k];

    let inheritsEnvironmentId: string | undefined;
    if (val?.toLowerCase().startsWith("inherits:")) {
      const inheritsName = val?.split("inherits:")[1];
      if (inheritsName in environmentsByName) {
        const [inheritsEnvironment] =
          environmentsByName[inheritsName.toLowerCase()];
        if (inheritsEnvironment && !inheritsEnvironment.isSub) {
          inheritsEnvironmentId = inheritsEnvironment.id;
          val = undefined;
        }
      }
    }

    await dispatch({
      type: Client.ActionType.UPDATE_ENTRY_VAL,
      payload: {
        envParentId: envParent.id,
        environmentId: envIdOrUserOverride,
        entryKey: k,
        update: {
          val,
          inheritsEnvironmentId,
          isEmpty: val === "" ? true : undefined,
          isUndefined:
            typeof val === "undefined" && !inheritsEnvironmentId
              ? true
              : undefined,
        } as any,
      },
    });
  }

  if (environment?.id) {
    console.log(
      "Environment:",
      getEnvironmentName(state.graph, environment.id)
    );
  }

  state = getState();

  if (argv.commit) {
    const [summary, pending] = getPending(state);

    if (pending) {
      console.log(summary);
      console.log("");
      console.log(pending);
      console.log("");

      if (!isAutoMode()) {
        if (hasPendingConflicts(state, [envParent.id], [envIdOrUserOverride])) {
          await confirmPendingConflicts(
            state,
            [envParent.id],
            [envIdOrUserOverride]
          );
        } else {
          const { confirm } = await prompt<{ confirm: boolean }>({
            type: "confirm",
            name: "confirm",
            message: chalk.bold(`Commit all changes?`),
          });

          if (!confirm) {
            return exit();
          }
        }
      }
    }

    spinnerWithText("Encrypting and syncing...");

    const res = await dispatch({
      type: Client.ActionType.COMMIT_ENVS,
      payload: { message: argv.message },
    });
    stopSpinner();
    await logAndExitIfActionFailed(res, "Your changes failed to commit.");
    state = res.state;

    console.log(chalk.green("The changes have been committed."));

    const [output] = getShowEnvs(
      state,
      envParent.id,
      [envIdOrUserOverride],
      new Set(Object.keys(kv))
    );
    console.log(output, "\n");
  } else {
    const [filteredSummary, filteredPending] = getPending(state, {
        envParentIds: new Set([envParent.id]),
        environmentIds: new Set([envIdOrUserOverride]),
        entryKeys: new Set(Object.keys(kv)),
      }),
      [allSummary, allPending] = getPending(state);

    if (filteredPending) {
      console.log(
        chalk.green.bold("Your changes are pending:"),
        "\n" + filteredSummary,
        "\n" + filteredPending
      );
    } else {
      console.log(chalk.bold("No values were updated."), "\n" + allSummary);
    }

    if (filteredPending != allPending) {
      console.log(
        chalk.bold.cyan("\nAdditional changes are pending."),
        "Use",
        chalk.bold("envkey pending"),
        "to see them all, and",
        chalk.bold("envkey commit"),
        "or",
        chalk.bold("envkey reset"),
        "to selectively commit or cancel.\n"
      );
    } else {
      console.log(
        "\nUse",
        chalk.bold("envkey commit"),
        "or",
        chalk.bold("envkey reset"),
        "to selectively commit or cancel.\n"
      );
    }
  }

  const [, , diffsByEnvironmentId] = getPending(state);
  autoModeOut({
    envParentId: envParent.id,
    pendingEnvs: Object.keys(diffsByEnvironmentId).length
      ? diffsByEnvironmentId
      : null,
  });

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};
