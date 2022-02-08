import { Argv } from "yargs";
import { addCommand } from "../cmd";
import { BaseArgs } from "../types";

import * as list from "./blocks_cmd/list";
import * as create from "./blocks_cmd/create";
import * as del from "./blocks_cmd/delete";
import * as connect from "./blocks_cmd/connect";
import * as disconnect from "./blocks_cmd/disconnect";

addCommand((yargs: Argv<BaseArgs>) =>
  yargs.command(
    ["blocks <command>", "block <command>"],
    "Commands to manage reusable config blocks.",
    (yargs) =>
      yargs
        .command(list)
        .command(create)
        .command(connect)
        .command(disconnect)
        .command(del)
        .demandCommand() // invalid sub-commands will hang without this
  )
);
