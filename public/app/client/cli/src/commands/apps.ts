import { Argv } from "yargs";
import { addCommand } from "../cmd";
import { BaseArgs } from "../types";

import * as list from "./apps_cmd/list";
import * as create from "./apps_cmd/create";
import * as del from "./apps_cmd/delete";
import * as grant from "./apps_cmd/access_grant";
import * as revoke from "./apps_cmd/access_revoke";
import * as listCollaborators from "./apps_cmd/list_collaborators";
import * as listCliKeys from "./apps_cmd/list_cli_keys";
import * as accessUpdate from "./apps_cmd/access_update";
import * as current from "./apps_cmd/current";
import * as duplicate from "./apps_cmd/duplicate";

addCommand((yargs: Argv<BaseArgs>) =>
  yargs.command(
    ["apps <command>", "app <command>"],
    "Commands to manage apps and app access.",
    (yargs) =>
      yargs
        .command(list)
        .command(create)
        .command(del)
        .command(grant)
        .command(revoke)
        .command(listCollaborators)
        .command(listCliKeys)
        .command(accessUpdate)
        .command(current)
        .command(duplicate)
        .demandCommand() // invalid sub-commands will hang without this
  )
);
