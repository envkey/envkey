import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { dispatch, initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import chalk from "chalk";
import { Api } from "@core/types";
import { findUser, logAndExitIfActionFailed } from "../../lib/args";
import { authz, graphTypes } from "@core/lib/graph";
import * as R from "ramda";
import { getPrompt, isAutoMode } from "../../lib/console_io";
import { tryApplyDetectedAppOverride } from "../../app_detection";

export const command = ["delete [person]"];
export const desc = "Remove a person from the org.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs.positional("person", {
    type: "string",
    describe: "email address",
  });
export const handler = async (
  argv: BaseArgs & { person?: string }
): Promise<void> => {
  const prompt = getPrompt();
  const { state, auth } = await initCore(argv, true);
  // override account from ENVKEY
  if (tryApplyDetectedAppOverride(auth.userId, argv)) {
    return handler(argv);
  }

  const userChoices = R.sortBy(
    R.prop("message"),
    graphTypes(state.graph)
      .orgUsers.filter((u) =>
        authz.canRemoveFromOrg(state.graph, auth.userId, u.id)
      )
      .map((u) => ({
        name: u.id,
        message: `${u.email} - ${u.firstName} ${u.lastName}`,
      }))
  );
  if (!userChoices.length) {
    return exit(
      1,
      chalk.red("There are no users for which you have permission to delete.")
    );
  }

  const userName = (argv.person ??
    (
      await prompt<{ user: string }>({
        type: "autocomplete",
        name: "user",
        message: "User to remove:",
        initial: 0,
        required: true,
        choices: userChoices,
      })
    ).user) as string;

  const user = findUser(state.graph, userName);
  if (!user) {
    return exit(1, chalk.red.bold("User not found"));
  }
  if (user.type === "cliUser") {
    return exit(1, chalk.red.bold("Cannot delete CLI key with this command"));
  }
  if (!authz.canRemoveFromOrg(state.graph, auth.userId, user.id)) {
    return exit(1, chalk.red("You don't have permission to delete the user."));
  }

  if (!isAutoMode()) {
    const { confirm } = await prompt<{ confirm: boolean }>({
      type: "confirm",
      name: "confirm",
      message: chalk.bold(
        `Delete ${user.email}? This action cannot be reversed.`
      ),
    });

    if (!confirm) {
      console.log(chalk.bold("User deletion aborted."));
      return exit();
    }
  }

  const res = await dispatch({
    type: Api.ActionType.REMOVE_FROM_ORG,
    payload: {
      id: user.id,
    },
  });

  await logAndExitIfActionFailed(res, "Deleting the user failed");

  console.log(chalk.bold("Deleting the user was successful."));

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};
