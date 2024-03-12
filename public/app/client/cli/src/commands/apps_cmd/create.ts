import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import { tryApplyDetectedAppOverride } from "../../app_detection";
import { createApp } from "../../lib/apps";
import { autoModeOut } from "../../lib/console_io";

export const command = "create [name]";
export const desc = "Create a new app.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs
    .positional("name", { type: "string", describe: "app name or id" })
    .option("dir", {
      type: "string",
      describe: "root directory of app (to create .envkey file)",
    });
export const handler = async (
  argv: BaseArgs & { name: string | undefined; dir?: string }
): Promise<void> => {
  let { state, auth } = await initCore(argv, true);
  // override account from ENVKEY
  if (tryApplyDetectedAppOverride(auth.userId, argv)) {
    return handler(argv);
  }

  const newApp = await createApp(auth, state, argv.name, argv.dir);

  autoModeOut({ name: newApp.name, id: newApp.id });

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};
