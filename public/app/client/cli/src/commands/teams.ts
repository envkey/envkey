import { Argv } from "yargs";
import { addCommand } from "../cmd";
import { BaseArgs } from "../types";

import * as list from "./teams_cmd/list";
import * as create from "./teams_cmd/create";
import * as del from "./teams_cmd/delete";
import * as listMembers from "./teams_cmd/list_members";
import * as addMember from "./teams_cmd/add_member";
import * as removeMember from "./teams_cmd/remove_member";
import * as listApps from "./teams_cmd/list_apps";

addCommand((yargs: Argv<BaseArgs>) =>
  yargs.command(
    ["teams <command>", "team <command>"],
    "Commands to manage teams and team access.",
    (yargs) =>
      yargs
        .command(list)
        .command(create)
        .command(del)
        .command(listMembers)
        .command(addMember)
        .command(removeMember)
        .command(listApps)
        .demandCommand() // invalid sub-commands will hang without this
  )
);
