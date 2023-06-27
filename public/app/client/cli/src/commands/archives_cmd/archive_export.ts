import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { dispatch, initCore } from "../../lib/core";
import { logAndExitIfActionFailed } from "../../lib/args";
import { Model, Client } from "@core/types";
import { authz } from "@core/lib/graph";
import { BaseArgs } from "../../types";
import chalk from "chalk";
import path from "path";
import { autoModeOut } from "../../lib/console_io";
import { spinnerWithText, stopSpinner } from "../../lib/spinner";

export const command = ["export [dir]"];
export const desc = "Export an encrypted org archive.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs.positional("dir", {
    type: "string",
    describe: "directory to export to",
  });
export const handler = async (
  argv: BaseArgs & { dir?: string }
): Promise<void> => {
  const { auth, state } = await initCore(argv, true),
    org = state.graph[auth.orgId] as Model.Org;

  if (
    !authz.hasOrgPermission(
      state.graph,
      auth.userId,
      "org_archive_import_export"
    )
  ) {
    return exit(
      1,
      chalk.bold(
        `You don't have permission to export an archive for ${org.name}.`
      )
    );
  }

  spinnerWithText("Exporting org archive...");

  const fileName = `${org.name.split(" ").join("-").toLowerCase()}-${new Date()
    .toISOString()
    .slice(0, 10)}.envkey-archive`;

  const filePath = path.resolve(argv["dir"] || ".", fileName);

  const res = await dispatch({
    type: Client.ActionType.EXPORT_ORG,
    payload: { filePath },
  });

  stopSpinner();

  if (res.success) {
    const { encryptionKey } = (
      res.resultAction as { payload: { encryptionKey: string } }
    ).payload;

    console.log(chalk.bold("Org archive exported to:"));
    console.log(filePath);
    console.log(chalk.bold("Encryption Key:"));
    console.log(encryptionKey);

    autoModeOut({
      filePath,
      encryptionKey,
    });
  } else {
    await logAndExitIfActionFailed(
      res,
      "There was a problem exporting the org archive."
    );
  }

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};
