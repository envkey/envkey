import chalk from "chalk";
import * as R from "ramda";
import Table from "cli-table3";
import { getEnvironmentTree } from "./envs";
import { authz, graphTypes, getAppRoleForUserOrInvitee } from "@core/lib/graph";
import { exit } from "./process";
import { dispatch } from "./core";
import { Client, Model } from "@core/types";
import { logAndExitIfActionFailed } from "./args";
import { getPrompt } from "./console_io";

export const createApp = async (
  auth: Client.ClientUserAuth | Client.ClientCliAuth,
  state: Client.State,
  nameArg: string | undefined,
  dirArg: string | undefined,
  confirmName?: true,
  quiet?: true
): Promise<Model.App> => {
  const prompt = getPrompt();

  if (!authz.canCreateApp(state.graph, auth.userId)) {
    return exit(
      1,
      chalk.red.bold("You don't have permission to create an app.")
    );
  }
  const name =
    !nameArg || confirmName
      ? (
          await prompt<{ name: string }>({
            type: "input",
            name: "name",
            message: "App Name:",
            initial: nameArg,
          })
        ).name
      : nameArg;

  const path =
    dirArg ??
    (
      await prompt<{ dir: string }>({
        type: "input",
        name: "dir",
        message: "App Directory (absolute path, optional--enter to skip):",
      })
    ).dir;

  const res = await dispatch({
    type: Client.ActionType.CREATE_APP,
    payload: {
      name,
      settings: {
        autoCaps: undefined,
      },
      path: path || undefined,
    },
  });

  await logAndExitIfActionFailed(res, `Creating the app ${name} failed.`);

  if (!quiet) {
    console.log(chalk.bold("App created.\n"));
  }

  state = res.state;

  const newApp = R.last(
      R.sortBy(R.prop("createdAt"), graphTypes(state.graph).apps)
    )!,
    role = getAppRoleForUserOrInvitee(state.graph, newApp.id, auth.userId);

  if (!quiet) {
    const table = new Table({
      colWidths: [15, 40],
    });

    table.push(
      ["App Name", chalk.bold(newApp.name)],
      ["Your Role", chalk.bold(role!.name)],
      ["Environments", chalk.bold(getEnvironmentTree(state.graph, newApp.id))]
    );

    console.log(table.toString());
    console.log("");

    console.log(
      `Use ${chalk.bold("envkey set")} to set config values or ${chalk.bold(
        "envkey apps grant"
      )} to give users access.`
    );
  }

  return newApp;
};
