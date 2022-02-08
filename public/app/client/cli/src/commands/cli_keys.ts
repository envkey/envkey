import { Argv } from "yargs";
import { addCommand } from "../cmd";
import { BaseArgs } from "../types";

import * as list from "./clikeys_cmd/list";
import * as create from "./clikeys_cmd/create";
import * as del from "./clikeys_cmd/delete";
import * as rename from "./clikeys_cmd/rename";

addCommand((yargs: Argv<BaseArgs>) =>
  yargs.command(
    ["cli-keys <command>", "cli-key <command>"],
    "Commands to manage CLI keys for automation.",
    (yargs) =>
      yargs
        .command(list)
        .command(create)
        .command(del)
        .command(rename)
        .demandCommand() // invalid sub-commands will hang without this
  )
);
