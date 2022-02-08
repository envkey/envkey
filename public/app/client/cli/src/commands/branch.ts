import { Argv } from "yargs";
import { addCommand } from "../cmd";
import { BaseArgs } from "../types";

import * as list from "./branch_cmd/list";
import * as create from "./branch_cmd/create";
import * as del from "./branch_cmd/delete";
import * as checkout from "./branch_cmd/checkout";

addCommand((yargs: Argv<BaseArgs>) =>
  yargs.command(
    ["branch <command>", "branches <command>"],
    "Commands to manage environment branches.",
    (yargs) =>
      yargs
        .command(list)
        .command(create)
        .command(del)
        .command(checkout)
        .demandCommand() // invalid sub-commands will hang without this
  )
);
