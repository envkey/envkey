import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import { authz, graphTypes } from "@core/lib/graph";
import {
  getChangesetForVersion,
  getChangesets,
  getEnvWithMetaForVersion,
  getLatestVersionNumber,
  getDiffsByKey,
} from "@core/lib/client";
import { Client, Model } from "@core/types";
import chalk from "chalk";
import {
  displayFullEnvName,
  printChangesetSummary,
  selectPrereqsForVersionCommands,
} from "../../lib/args";
import { tryApplyDetectedAppOverride } from "../../app_detection";
import Table from "cli-table3";
import { fetchChangesetsIfNeeded, pushDiffRows } from "../../lib/envs";
import { autoModeOut, getPrompt } from "../../lib/console_io";
import * as R from "ramda";

export const command = ["diffs [app-or-block] [environment] [version-num]"];
export const desc = "See the diffs for a specific version.";
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
      describe: "version number to display",
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
      describe: "View diffs for a specific variable or set of variables only",
    })
    .array("vars");
export const handler = async (
  argv: BaseArgs & {
    "app-or-block"?: string;
    environment?: string;
    branch?: string;
    "local-override"?: boolean;
    "override-user"?: string;
    "version-num"?: number;
    all?: boolean;
    vars?: string[];
  }
): Promise<void> => {
  const prompt = getPrompt();
  let { state, auth } = await initCore(argv, true);
  let shiftedPositional: number | undefined;
  let version: number = argv["version-num"] ?? -1;
  let envParent: Model.EnvParent | undefined;

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
    {
      ...argv,
      argvThirdPositional: version > -1 ? version : undefined,
    },
    authz.canReadEnv,
    envParent
  );

  ({ state, auth, shiftedPositional, envParent } = result);

  if (!isNaN(shiftedPositional as number)) {
    version = shiftedPositional as number;
  }
  if (isNaN(version as number) || version < 1) {
    version = parseInt(
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
  if (isNaN(version as number) || version < 1) {
    return exit(1, chalk.red.bold(`Invalid version number: ${version}`));
  }

  const envParentId = envParent.id;
  const environmentId =
    "appEnv" in result ? result.appEnv.id : result.localOverrideEnvironmentId;
  const envDescription =
    "appEnv" in result
      ? `- ${chalk.bold(displayFullEnvName(state.graph, result.appEnv.id))}`
      : result.localOverrideEnvironmentId!.includes(auth.userId)
      ? "local overrides"
      : "user overrides";

  state = await fetchChangesetsIfNeeded(state, [envParentId]);

  const changesetParams = {
    envParentId,
    environmentId,
  } as Client.Env.ListVersionsParams;
  if (argv["vars"]) {
    changesetParams.entryKeys = argv["vars"] as string[];
  }
  const entryKeysSet = changesetParams.entryKeys
    ? new Set(changesetParams.entryKeys)
    : undefined;
  const changesets = getChangesets(state, changesetParams);
  if (changesets.length === 0) {
    return exit(
      1,
      `There are no versions for ${chalk.bold(
        envParent.name
      )} ${envDescription}`
    );
  }

  const versionChangeset = getChangesetForVersion(state, {
    ...changesetParams,
    version,
  });
  if (!versionChangeset) {
    return exit(
      1,
      chalk.red.bold("Cannot find version with specified parameters.")
    );
  }

  const prevVersion = version - 1;
  const prevParams = {
    ...changesetParams,
    version: prevVersion,
  };
  const prevVersionEnv =
    prevVersion > 0 ? getEnvWithMetaForVersion(state, prevParams) : undefined;

  const versionEnv = getEnvWithMetaForVersion(state, {
    ...changesetParams,
    version,
  });

  const currentVersion = getLatestVersionNumber(state, changesetParams);
  const currentParams = {
    ...changesetParams,
    version: currentVersion,
  };
  const currentVersionEnv =
    version !== currentVersion
      ? getEnvWithMetaForVersion(state, currentParams)
      : undefined;

  console.log(
    `Viewing changes in ${chalk.bold("v" + version)}${
      version === currentVersion ? " (current)" : ""
    } for ${chalk.bold(envParent.name)} ${envDescription}`,
    changesetParams.entryKeys
      ? `for variable${
          changesetParams.entryKeys.length == 1 ? "" : "s"
        }: ${changesetParams.entryKeys.join(", ")}`
      : "",
    "\n"
  );
  console.log(printChangesetSummary(state, changesetParams, versionChangeset));

  const table = new Table();

  let previousVersionDiffs: Client.Env.DiffsByKey = {};
  let currentVersionDiffs: Client.Env.DiffsByKey = {};

  if (prevVersionEnv) {
    table.push(
      [{ content: chalk.bold("Compared to previous version"), colSpan: 3 }],
      [
        "",
        chalk.bold(`v${prevVersion}`) + " (previous)",
        chalk.bold(`v${version}`),
      ]
    );
    const diffs = getDiffsByKey(
      prevVersionEnv.variables,
      versionEnv.variables,
      entryKeysSet
    );
    if (Object.keys(diffs).length === 0) {
      table.push([{ content: "No changes", colSpan: 3 }]);
    } else {
      pushDiffRows(state, table, diffs);
    }

    previousVersionDiffs = diffs;
  }

  if (prevVersionEnv && currentVersionEnv) {
    const separator = [{ content: "", colSpan: 3 }];
    table.push(separator);
  }

  if (currentVersionEnv) {
    table.push(
      [{ content: chalk.bold("Compared to current version"), colSpan: 3 }],
      [
        "",
        chalk.bold(`v${version}`),
        chalk.bold(`v${currentVersion}`) + " (current)",
      ]
    );
    const diffs = getDiffsByKey(
      versionEnv.variables,
      currentVersionEnv.variables,
      entryKeysSet
    );
    if (Object.keys(diffs).length === 0) {
      table.push([{ content: "No changes", colSpan: 3 }]);
    } else {
      pushDiffRows(state, table, diffs);
    }

    currentVersionDiffs = diffs;
  }

  console.log(table.toString());
  autoModeOut({
    previousVersionDiffs,
    currentVersionDiffs,
  });
  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};
