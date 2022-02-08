import { Argv } from "yargs";
import { addCommand } from "../cmd";
import { BaseArgs } from "../types";

import * as list from "./serverkeys_cmd/list";
import * as create from "./serverkeys_cmd/create";
import * as del from "./serverkeys_cmd/delete";
import * as renew from "./serverkeys_cmd/renew";

addCommand((yargs: Argv<BaseArgs>) =>
  yargs.command(
    ["servers <command>", "server <command>"],
    "Commands to manage server ENVKEYs.",
    (yargs) =>
      yargs
        .command(list)
        .command(create)
        .command(del)
        .command(renew)
        .demandCommand() // invalid sub-commands will hang without this
  )
);
