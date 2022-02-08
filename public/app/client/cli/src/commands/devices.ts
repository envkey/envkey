import { Argv } from "yargs";
import { addCommand } from "../cmd";
import { BaseArgs } from "../types";

import * as list from "./devices_cmd/list";
import * as grant from "./devices_cmd/grant";
import * as grantRevoke from "./devices_cmd/grant_revoke";
import * as grantList from "./devices_cmd/grants_list";
import * as revoke from "./devices_cmd/revoke";

addCommand((yargs: Argv<BaseArgs>) =>
  yargs.command(
    ["devices <command>", "device <command>"],
    "Commands to manage device access.",
    (yargs) =>
      yargs
        .command(list)
        .command(grant)
        .command(grantRevoke)
        .command(grantList)
        .command(revoke)
        .demandCommand() // invalid sub-commands will hang without this
  )
);
