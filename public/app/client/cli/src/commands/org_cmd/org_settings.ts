import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { initCore } from "../../lib/core";
import { printOrgSettings } from "../../lib/settings";
import { Model } from "@core/types";
import { authz } from "@core/lib/graph";
import { BaseArgs } from "../../types";
import chalk from "chalk";

export const command = ["settings"];
export const desc = "View this organization's settings.";
export const builder = (yargs: Argv<BaseArgs>) => yargs;
export const handler = async (argv: BaseArgs): Promise<void> => {
  const { auth, state } = await initCore(argv, true),
    org = state.graph[auth.orgId] as Model.Org;

  if (!authz.canUpdateOrgSettings(state.graph, auth.userId)) {
    return exit(
      1,
      chalk.bold(
        `You don't have permission to view or modify settings for ${org.name}.`
      )
    );
  }

  printOrgSettings(org);

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};
