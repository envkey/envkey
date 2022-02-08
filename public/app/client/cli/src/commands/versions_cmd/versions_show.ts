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
  getEnvWithMetaCellDisplay,
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
import { fetchChangesetsIfNeeded } from "../../lib/envs";
import { autoModeOut, getPrompt } from "../../lib/console_io";
import * as R from "ramda";

export const command = ["show [app-or-block] [environment] [version-num]"];
export const desc = "Show an environment at a specific version.";
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
      describe: "Show version for a specific variable or set of variables",
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

  const versionEnv = getEnvWithMetaForVersion(state, {
    ...changesetParams,
    version,
  });

  const currentVersion = getLatestVersionNumber(state, changesetParams);

  console.log(
    `Viewing environment at ${chalk.bold("v" + version)}${
      version === currentVersion ? " (current)" : ""
    } for ${chalk.bold(envParent.name)} ${envDescription}`,
    changesetParams.entryKeys
      ? `filtered by vars: ${changesetParams.entryKeys.join(", ")}`
      : "",
    "\n"
  );
  console.log(printChangesetSummary(state, changesetParams, versionChangeset));

  const table = new Table();

  if (!versionEnv) {
    return exit(1, "Cannot display version " + version);
  }
  // heading
  table.push([
    "",
    {
      content: chalk.bold.blueBright("v" + version),
      hAlign: "center",
    },
  ]);
  for (let k of Object.keys(versionEnv.variables)) {
    table.push([
      k,
      {
        content: getEnvWithMetaCellDisplay(
          state.graph,
          versionEnv.variables[k]
        ),
        hAlign: "center",
      },
    ]);
  }
  console.log(table.toString());
  autoModeOut({ env: versionEnv });
  return exit();
};
