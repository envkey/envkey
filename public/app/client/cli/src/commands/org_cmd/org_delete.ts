import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { BaseArgs } from "../../types";
import chalk from "chalk";
import { dispatch, initCore } from "../../lib/core";
import { authz } from "@core/lib/graph";
import { spinnerWithText } from "../../lib/spinner";
import { Api, Model } from "@core/types";
import { logAndExitIfActionFailed } from "../../lib/args";
import { getPrompt } from "../../lib/console_io";
import { tryApplyDetectedAppOverride } from "../../app_detection";

export const command = ["delete"];
export const desc = "Delete the current organization";
export const builder = (yargs: Argv<BaseArgs>) => yargs;
export const handler = async (argv: BaseArgs): Promise<void> => {
  const prompt = getPrompt();
  let { state, auth } = await initCore(argv, true, true);
  // override account from ENVKEY
  if (tryApplyDetectedAppOverride(auth.userId, argv)) {
    return handler(argv);
  }

  if (!authz.canDeleteOrg(state.graph, auth.userId)) {
    return exit(
      1,
      chalk.red.bold("You don't have permission to delete the organization.")
    );
  }

  const { name } = state.graph[auth.orgId] as Model.Org;
  const { confirm } = await prompt<{ confirm: string }>({
    type: "input",
    name: "confirm",
    message: chalk.blueBright(
      `This will delete ${chalk.bold(
        name
      )}, including all configuration, users, and keys. It cannot be undone!\nType the name of the organization to continue:`
    ),
  });

  if (confirm !== name) {
    console.log("Aborted.");
    return exit();
  }

  spinnerWithText(`Deleting entire organization ${chalk.bold(name)} now...`);

  const res = await dispatch(
    {
      type: Api.ActionType.DELETE_ORG,
      payload: {},
    },
    auth.userId
  );
  await logAndExitIfActionFailed(res, "Deleting the organization failed.");

  console.log(chalk.bold("\nThe organization was deleted.\n"));

  return exit();
};
