import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import { authz, graphTypes } from "@core/lib/graph";
import { getChangesets } from "@core/lib/client";
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
import { autoModeOut } from "../../lib/console_io";
import * as R from "ramda";

export const command = ["list [app-or-block] [environment]", "$0"];
export const desc = "List environment versions.";
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
      describe: "List versions for a specific variable or set of variables",
    })
    .array("vars");
export const handler = async (
  argv: BaseArgs & {
    "app-or-block"?: string;
    environment?: string;
    branch?: string;
    "local-override"?: boolean;
    "override-user"?: string;
    vars?: string[];
  }
): Promise<void> => {
  let { state, auth } = await initCore(argv, true);

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
    argv,
    authz.canReadEnv,
    envParent
  );
  ({ state, auth, envParent } = result);

  const envParentId = envParent.id;
  const environmentId =
    "appEnv" in result ? result.appEnv.id : result.localOverrideEnvironmentId;
  const envDescription =
    "appEnv" in result
      ? `- ${chalk.bold(displayFullEnvName(state.graph, result.appEnv.id))}`
      : result.localOverrideEnvironmentId.includes(auth.userId)
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
    console.log(
      `There are no versions for ${chalk.bold(
        envParent.name
      )} ${envDescription}`
    );
    return exit(0);
  }

  const table = new Table({
    head: ["Changeset", "Version Num", "Keys Affected"],
    style: {
      head: [], //disable colors in header cells
    },
  });
  let actionVersionCounter = 0;
  changesets.forEach((c) => {
    c.actions.forEach((a, actionIndex) => {
      actionVersionCounter++;
      const changeTypeDisplayName =
        a.type.split("/")[a.type.split("/").length - 1];

      const row = [
        `v${actionVersionCounter}`,
        a.meta.entryKeys.join(" "),
      ] as Table.HorizontalTableRow;

      // show changeset for first item and span for all changeset rows
      if (actionIndex === 0) {
        row.unshift({
          content: printChangesetSummary(state, changesetParams, c),
          rowSpan: c.actions.length,
        });
      }

      table.push(row);
    });
  });

  console.log(
    `Viewing versions for ${chalk.bold(envParent.name)} ${envDescription}`,
    changesetParams.entryKeys
      ? `filtered by config keys: ${changesetParams.entryKeys.join(", ")}`
      : ""
  );
  console.log(
    table.toString(),
    "\nUse",
    chalk.bold(
      `envkey versions inspect [app-or-block] [environment] [version]`
    ),
    "to view specific changes.\n"
  );

  autoModeOut({
    versions: changesets.map((c, ix) => ({
      version: ix + 1,
      entryKeys: R.uniq(R.flatten(c.actions.map((a) => a.meta.entryKeys))),
      message: c.message,
    })),
  });
  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};
