import { Argv } from "yargs";
import { addCommand } from "../cmd";
import { BaseArgs } from "../types";

import * as appRoles from "./rbac_cmd/app_roles";
import * as envRoles from "./rbac_cmd/environment_roles";
import * as orgRoles from "./rbac_cmd/org_roles";

addCommand((yargs: Argv<BaseArgs>) =>
  yargs.command(
    ["rbac <command>"],
    "Commands to manage role-based access control.",
    (yargs) =>
      yargs
        .command(orgRoles)
        .command(appRoles)
        .command(envRoles)
        .demandCommand() // invalid sub-commands will hang without this
  )
);
