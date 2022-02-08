import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import { authz, graphTypes } from "@core/lib/graph";
import {
  getChangesetCommitNumber,
  getChangesetForVersion,
  getChangesets,
  getEnvWithMetaForVersion,
  getDiffsByKey,
  getLatestVersionNumber,
  getVersionForChangeset,
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

export const command =
  "commit-diffs [app-or-block] [environment] [commit-number]";
export const desc = "See the diffs for a specific commit.";
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
    .positional("commit-number", {
      type: "number",
      describe: "commit number to display",
    })
    .option("branch", {
      type: "string",
      alias: "b",
      describe: "branch when environment is a parent",
    })
    .option("local-override", {
      type: "boolean",
      alias: ["l", "local-overrides"],
      describe: "View changes for the current user local overrides",
    })
    .option("override-user", {
      type: "string",
      alias: ["u", "override-for-user", "overrides-for-user"],
      describe:
        "View changes for the local overrides of another user (email or id)",
      conflicts: ["local-override"],
      coerce: (value) => {
        if (!value) {
          throw new Error("Missing user override");
        }
        return value;
      },
    });
export const handler = async (
  argv: BaseArgs & {
    "app-or-block"?: string;
    environment?: string;
    branch?: string;
    "local-override"?: boolean;
    "override-user"?: string;
    "commit-number"?: number;
    vars?: string[];
  }
): Promise<void> => {
  const prompt = getPrompt();
  let { state, auth } = await initCore(argv, true);
  let envParent: Model.EnvParent | undefined;
  let shiftedPositional: number | undefined;
  let commit = argv["commit-number"];

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
      argvThirdPositional: commit,
    },
    authz.canReadEnv,
    envParent
  );

  ({ state, auth, shiftedPositional, envParent } = result);

  if (!isNaN(shiftedPositional as number)) {
    commit = shiftedPositional as number;
  }

  if (typeof shiftedPositional !== "undefined") {
    commit = parseInt(shiftedPositional as any, 10);
  }

  if (typeof commit == "undefined" || isNaN(commit as number)) {
    commit = parseInt(
      (
        await prompt<{ commit: string }>({
          type: "input",
          name: "commit",
          required: true,
          message: "Enter a commit number:",
        })
      ).commit,
      10
    );
  }

  if (typeof commit == "undefined" || isNaN(commit)) {
    return exit(1, chalk.red.bold(`Invalid commit number: ${commit}`));
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
  const changesets = getChangesets(state, changesetParams);
  if (changesets.length === 0) {
    console.log(
      `There are no changesets for ${chalk.bold(
        envParent.name
      )} ${envDescription}`
    );
    return exit(0);
  }

  const changeset = changesets[commit - 1];
  if (!changeset) {
    return exit(
      1,
      chalk.red.bold("Cannot find commit changeset with specified parameters.")
    );
  }

  const prevCommitNum = commit - 1;
  const prevVersion =
    prevCommitNum > 0
      ? getVersionForChangeset(state, changesetParams, prevCommitNum)
      : 0;
  const prevParams = {
    ...changesetParams,
    version: prevVersion,
  };
  const prevVersionEnv =
    prevVersion > 0 ? getEnvWithMetaForVersion(state, prevParams) : undefined;

  const version = getVersionForChangeset(state, changesetParams, commit);
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
  const currentChangeset = getChangesetForVersion(state, currentParams);
  const currentCommitNum = currentChangeset
    ? getChangesetCommitNumber(state, currentParams, currentChangeset)
    : undefined;

  console.log(
    `Viewing changes in changeset commit #${commit}${
      version === currentVersion ? " (current)" : ""
    } for ${chalk.bold(envParent.name)} ${envDescription}`,
    "\n"
  );
  console.log(printChangesetSummary(state, changesetParams, changeset));

  const table = new Table();

  let previousVersionDiffs: Client.Env.DiffsByKey = {};
  let currentVersionDiffs: Client.Env.DiffsByKey = {};

  if (prevVersionEnv) {
    table.push(
      [{ content: chalk.bold("Compared to previous commit"), colSpan: 3 }],
      [
        "",
        chalk.bold(`commit #${prevCommitNum}`) + " (previous)",
        chalk.bold(`commit #${commit}`),
      ]
    );
    const diffs = getDiffsByKey(prevVersionEnv.variables, versionEnv.variables);
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

  let diffs: Client.Env.DiffsByKey = {};
  if (currentVersionEnv) {
    table.push(
      [{ content: chalk.bold("Compared to current commit"), colSpan: 3 }],
      [
        "",
        chalk.bold(`commit #${commit}`),
        chalk.bold(`commit #${currentCommitNum}`) + " (current)",
      ]
    );
    const diffs = getDiffsByKey(
      versionEnv.variables,
      currentVersionEnv.variables
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
