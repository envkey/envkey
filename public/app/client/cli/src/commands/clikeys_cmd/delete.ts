import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { dispatch, initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import chalk from "chalk";
import { Api } from "@core/types";
import { findCliUser, logAndExitIfActionFailed } from "../../lib/args";
import { authz } from "@core/lib/graph";
import { getPrompt, isAutoMode, autoModeOut } from "../../lib/console_io";
import { tryApplyDetectedAppOverride } from "../../app_detection";

export const command = ["delete [cli-key]"];
export const desc = "Remove a CLI key.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs.positional("cli-key", {
    type: "string",
    describe: "CLI key name or id",
  });
export const handler = async (
  argv: BaseArgs & { "cli-key"?: string }
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
        message: "CLI key to remove:",
        initial: 0,
        choices: authz
          .getDeletableCliUsers(state.graph, auth.userId)
          .map((cliUser) => ({
            name: cliUser.id,
            message: `${chalk.bold(cliUser.name)}`,
          })),
      })
    ).user) as string;

  const cliUser = findCliUser(state.graph, userName);
  if (!cliUser) {
    return exit(1, chalk.red.bold("CLI key not found."));
  }
  if (!authz.canDeleteCliUser(state.graph, auth.userId, cliUser.id)) {
    return exit(
      1,
      chalk.red.bold("You don't have permission to delete the CLI key.")
    );
  }
  if (!isAutoMode()) {
    const { confirm } = await prompt<{ confirm: boolean }>({
      type: "confirm",
      name: "confirm",
      message: chalk.bold(
        `Delete CLI key ${cliUser.name}? This action cannot be reversed.`
      ),
    });

    if (!confirm) {
      console.log(chalk.bold("CLI key deletion aborted."));
      return exit();
    }
  }

  const res = await dispatch({
    type: Api.ActionType.DELETE_CLI_USER,
    payload: {
      id: cliUser.id,
    },
  });

  await logAndExitIfActionFailed(
    res,
    `Deleting the CLI key ${cliUser.name} failed.`
  );

  console.log(
    chalk.bold(`Deleting the CLI key ${cliUser.name} was successful.`)
  );

  autoModeOut({});

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};
