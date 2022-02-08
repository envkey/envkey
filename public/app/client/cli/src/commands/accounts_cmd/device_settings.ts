import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { initCore } from "../../lib/core";
import { printDeviceSettings } from "../../lib/auth";
import { BaseArgs } from "../../types";

export const command = "device-settings";
export const desc =
  "View your device's settings (passphrase, lockouts, default name, etc.).";
export const builder = (yargs: Argv<BaseArgs>) => yargs;
export const handler = async (argv: BaseArgs): Promise<void> => {
  const { state } = await initCore(argv, false);

  printDeviceSettings(state);

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};
