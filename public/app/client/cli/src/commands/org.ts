import { Argv } from "yargs";
import { addCommand } from "../cmd";
import { BaseArgs } from "../types";

import * as settings from "./org_cmd/org_settings";
import * as del from "./org_cmd/org_delete";
import * as requireLockout from "./org_cmd/org_settings_require_lockout";
import * as requirePass from "./org_cmd/org_settings_require_passphrase";

addCommand((yargs: Argv<BaseArgs>) =>
  yargs.command(
    ["org <command>"],
    "Commands to manage organization settings.",
    (yargs) =>
      yargs
        .command(settings)
        .command(requireLockout)
        .command(requirePass)
        .command(del)
        .demandCommand() // invalid sub-commands will hang without this
  )
);
