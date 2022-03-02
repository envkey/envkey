import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { dispatch, initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import { authz, graphTypes } from "@core/lib/graph";
import { getChangesets, getVersionForChangeset } from "@core/lib/client";
import { Client, Model } from "@core/types";
import chalk from "chalk";
import {
  displayFullEnvName,
  logAndExitIfActionFailed,
  selectPrereqsForVersionCommands,
} from "../../lib/args";
import { fetchChangesetsIfNeeded, getPending } from "../../lib/envs";
import { autoModeOut, getPrompt } from "../../lib/console_io";
import { tryApplyDetectedAppOverride } from "../../app_detection";
import * as R from "ramda";

export const command = ["revert [app-or-block] [environment] [version-num]"];
export const desc =
  "Revert an environment, and optionally specific variables, to a previous commit or version number.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs
    .positional("app-or-block", {
      type: "string",
      describe: "app or block name",
    })
    .positional("environment", {
      type: "string",
      describe: "environment name",
      conflicts: ["local-override", "override-user"],
    })
    .positional("version-num", {
      type: "number",
      describe: "version number to revert the environment to",
    })
    .option("commit", {
      type: "number",
      describe: "commit number to revert the environment to",
      conflicts: ["version-num"],
    })
    .option("branch", {
      type: "string",
      alias: "b",
      describe: "branch when environment is a parent",
    })
    .option("local-override", {
      type: "boolean",
      alias: ["l", "local-overrides"],
      describe: "View versions for the current user local overrides",
    })
    .option("override-user", {
      type: "string",
      alias: ["u", "override-for-user", "overrides-for-user"],
      describe:
        "View versions for the local overrides of another user (email or id)",
      conflicts: ["local-override"],
      coerce: (value) => {
        if (!value) {
          throw new Error("Missing user override");
        }
        return value;
      },
    })
    .option("vars", {
      type: "string",
      alias: ["keys", "k"],
      describe:
        "Revert a specific variable or set of variables only (other variables aren't modified)",
    })
    .array("vars")
    .option("ignore-pending", { type: "boolean" });
export const handler = async (
  argv: BaseArgs & {
    "app-or-block"?: string;
    environment?: string;
    branch?: string;
    "local-override"?: boolean;
    "override-user"?: string;
    "version-num"?: number;
    commit?: number;
    "ignore-pending"?: boolean;
    vars?: string[];
  }
): Promise<void> => {
  const prompt = getPrompt();
  let { state, auth } = await initCore(argv, true);
  let shiftedPositional: number | undefined;
  let versionArg = argv["version-num"];
  let envParent: Model.EnvParent | undefined;

  const [pendingSummary, initialPending] = getPending(state);
  if (initialPending && !argv["ignore-pending"]) {
    return exit(
      1,
      chalk.red(
        "There are already pending changes, so `envkey revert` is disabled.\nEither reset pending changes, or use flag --ignore-pending to continue. Use `envkey pending` to see the pending changes."
      )
    );
  }

  const { apps, blocks } = graphTypes(state.graph),
    envParents = [...apps, ...blocks],
    envParentsByName = R.indexBy(R.pipe(R.prop("name"), R.toLower), envParents),
    envParentsById = R.indexBy(R.pipe(R.prop("id"), R.toLower), envParents);

  if (argv["app-or-block"]) {
    envParent =
      envParentsByName[argv["app-or-block"]] ??
      envParentsById[argv["app-or-block"]];
  }

  if (!envParent && tryApplyDetectedAppOverride(auth.userId, argv)) {
    return handler(argv);
  }

  const result = await selectPrereqsForVersionCommands(
    state,
    auth,
    argv,
    authz.canReadEnv,
    envParent
  );
  ({ state, auth, shiftedPositional, envParent } = result);

  if (!argv["commit"]) {
    if (!isNaN(shiftedPositional as number)) {
      versionArg = shiftedPositional as number;
    }
    if (isNaN(versionArg as number)) {
      versionArg = parseInt(
        (
          await prompt<{ version: string }>({
            type: "input",
            name: "version",
            required: true,
            message: "Enter a version number:",
          })
        ).version,
        10
      ) as number;
    }
    if (isNaN(versionArg as number)) {
      return exit(1, chalk.red.bold(`Invalid version number: ${versionArg}`));
    }
  }

  if (!versionArg && !argv["commit"]) {
    return exit(1, "Either --version-num or --commit is required");
  }

  const envParentId = envParent.id;
  const environmentId = (
    "appEnv" in result ? result.appEnv.id : result.localOverrideEnvironmentId
  ) as string;
  const envDescription =
    "appEnv" in result
      ? `- ${chalk.bold(displayFullEnvName(state.graph, result.appEnv.id))}`
      : result.localOverrideEnvironmentId!.includes(auth.userId)
      ? "local overrides"
      : "user overrides";

  const changesetParams = {
    envParentId,
    environmentId,
  } as Client.Env.ListVersionsParams;
  if (argv["vars"]) {
    changesetParams.entryKeys = argv["vars"] as string[];
  }

  state = await fetchChangesetsIfNeeded(state, [envParentId]);

  const versionFromCommit = argv["commit"]
    ? getVersionForChangeset(state, changesetParams, argv["commit"])
    : undefined;

  const version = (versionFromCommit ??
    versionArg ??
    parseInt(
      (
        await prompt<{ version: string }>({
          type: "input",
          name: "version",
          required: true,
          message: "Enter a version number:",
        })
      ).version,
      10
    )) as number;
  if (isNaN(version) || version < 1) {
    return exit(1, chalk.red.bold(`Invalid version number: ${version}`));
  }

  const changesets = getChangesets(state, changesetParams);
  if (changesets.length === 0) {
    return exit(
      1,
      `There are no versions for ${chalk.bold(
        envParent.name
      )} ${envDescription}`
    );
  }

  const res = await dispatch({
    type: Client.ActionType.REVERT_ENVIRONMENT,
    payload: {
      ...changesetParams,
      version,
    },
  });
  await logAndExitIfActionFailed(res, "Revert failed.");

  if (argv["commit"]) {
    console.log(
      chalk.green.bold(`Revert to commit #${argv["commit"]} is pending.`)
    );
  } else {
    console.log(chalk.green.bold(`Revert to v${version} is pending.`));
  }

  state = res.state;

  const [summary, pending, diffsByEnvironmentId] = getPending(state);
  console.log(summary);
  console.log("");
  console.log(pending);
  console.log(
    `Use ${chalk.bold("envkey commit")} to finalize the revert, or ${chalk.bold(
      "envkey reset"
    )} to undo.`
  );

  autoModeOut({
    pending: Object.keys(diffsByEnvironmentId).length
      ? diffsByEnvironmentId
      : null,
  });

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};
