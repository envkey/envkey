import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { dispatch, initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import * as g from "@core/lib/graph";
import { Api, Model, Rbac } from "@core/types";
import chalk from "chalk";
import * as R from "ramda";
import Table from "cli-table3";
import { autoModeOut, getPrompt } from "../../lib/console_io";
import { tryApplyDetectedAppOverride } from "../../app_detection";

export const command = "apps [team]";
export const desc = "List team apps.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs.positional("team", { type: "string", describe: "team name or id" });
export const handler = async (
  argv: BaseArgs & { team?: string }
): Promise<void> => {
  const prompt = getPrompt();
  let { state, auth } = await initCore(argv, true);

  if (tryApplyDetectedAppOverride(auth.userId, argv)) {
    return handler(argv);
  }

  if (!g.authz.canManageUserGroups(state.graph, auth.userId)) {
    return exit(1, chalk.red("You don't have permission to manage teams."));
  }

  // choose a team
  const teamChoices = R.sortBy(
    R.prop("name"),
    g
      .graphTypes(state.graph)
      .groups.filter((g) => g.objectType === "orgUser")
      .map((g) => ({
        name: g.name,
        message: chalk.bold(g.name),
      }))
  );

  if (!teamChoices.length) {
    return exit(1, chalk.red.bold("There are no teams you can list apps for."));
  }

  const teamNameOrId =
    argv.team ??
    ((
      await prompt<{ team: string }>({
        type: "autocomplete",
        name: "team",
        message: "Team:",
        choices: teamChoices,
      })
    ).team as string);

  const { groups } = g.graphTypes(state.graph);
  const team = groups.find(
    (g) =>
      g.objectType == "orgUser" &&
      (g.name === teamNameOrId || g.id === teamNameOrId)
  );

  if (!team) {
    return exit(1, chalk.red.bold("Team not found"));
  }

  const apps = R.sortBy(
    R.prop("name"),
    (g.getAppUserGroupsByGroupId(state.graph)[team.id] ?? []).map(
      ({ appId }) => state.graph[appId] as Model.App
    )
  );

  if (!apps.length) {
    console.log(chalk.bold("No apps"));
    return exit();
  }

  const appsByAppRoleId = R.groupBy(
    (app) =>
      g.getAppUserGroupsByComposite(state.graph)[app.id + "|" + team.id]!
        .appRoleId,
    apps
  );

  const table = new Table({
    head: ["Name", "Role"],
    style: {
      head: [], //disable colors in header cells
    },
  });

  for (let appRoleId in appsByAppRoleId) {
    const appRole = state.graph[appRoleId] as Rbac.AppRole;
    const apps = appsByAppRoleId[appRoleId];
    for (let app of apps) {
      table.push([app.name, appRole.name]);
    }
  }

  console.log(table.toString());

  autoModeOut({
    apps: apps.map((app) => ({
      id: app.id,
      name: app.name,
      appRole: R.pick(
        ["name", "id"],
        g.getAppUserGroupsByComposite(state.graph)[app.id + "|" + team.id]
      ),
    })),
  });

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};
