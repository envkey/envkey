import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { dispatch, initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import chalk from "chalk";
import { Api } from "@core/types";
import { findCliUser, logAndExitIfActionFailed } from "../../lib/args";
import { authz, graphTypes } from "@core/lib/graph";
import * as R from "ramda";
import { autoModeOut, getPrompt } from "../../lib/console_io";
import { tryApplyDetectedAppOverride } from "../../app_detection";

export const command = ["rename [cli-key] [new-name]"];
export const desc = "Rename a CLI key.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs
    .positional("cli-key", {
      type: "string",
      describe: "CLI key name or id",
    })
    .positional("new-name", {
      type: "string",
      describe: "New name for the CLI key",
    });
export const handler = async (
  argv: BaseArgs & { "cli-key"?: string; "new-name"?: string }
): Promise<void> => {
  const prompt = getPrompt();
  const { state, auth } = await initCore(argv, true);
  // override account from ENVKEY
  if (tryApplyDetectedAppOverride(auth.userId, argv)) {
    return handler(argv);
  }

  const userName = (argv["cli-key"] ??
    (
      await prompt<{ user: string }>({
        type: "autocomplete",
        name: "user",
        message: "CLI key to rename:",
        initial: 0,
        choices: authz
          .getRenameableCliUsers(state.graph, auth.userId)
          .map((cliUser) => ({
            name: cliUser.id,
            message: `${chalk.bold(cliUser.name)}`,
          })),
      })
    ).user) as string;

  const cliUser = findCliUser(state.graph, userName);
  if (!cliUser) {
    return exit(1, chalk.red.bold("CLI key not found"));
  }

  const name =
    argv["new-name"] ??
    (
      await prompt<{ name: string }>({
        type: "input",
        name: "name",
        message: "New CLI key name:",
      })
    ).name;
  const alreadyExistsByName = graphTypes(state.graph)
    .cliUsers.filter((u) => !u.deactivatedAt)
    .find(R.propEq("name", name));
  if (alreadyExistsByName) {
    return exit(1, chalk.red.bold("A CLI Key already exists with that name."));
  }
  if (!authz.canRenameCliUser(state.graph, auth.userId, cliUser.id)) {
    return exit(
      1,
      chalk.red.bold("You don't have permission to delete the CLI key.")
    );
  }

  const res = await dispatch({
    type: Api.ActionType.RENAME_CLI_USER,
    payload: {
      id: cliUser.id,
      name,
    },
  });

  await logAndExitIfActionFailed(
    res,
    `Renaming the CLI key ${cliUser.name} failed`
  );

  console.log(chalk.bold(`The CLI key was renamed to ${chalk.bold(name)}.`));
  autoModeOut({ id: cliUser.id, name });

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};
