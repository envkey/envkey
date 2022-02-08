import { Argv } from "yargs";
import { addCommand } from "../cmd";
import { BaseArgs } from "../types";

import * as list from "./localkeys_cmd/list";
import * as create from "./localkeys_cmd/create";
import * as del from "./localkeys_cmd/delete";
import * as renew from "./localkeys_cmd/renew";

addCommand((yargs: Argv<BaseArgs>) =>
  yargs.command(
    ["local-keys <command>", "local-key <command>"],
    "Commands to manage local development ENVKEYs.",
    (yargs) =>
      yargs
        .command(list)
        .command(create)
        .command(del)
        .command(renew)
        .demandCommand() // invalid sub-commands will hang without this
  )
);
