import { Argv } from "yargs";
import { addCommand } from "../cmd";
import { BaseArgs } from "../types";

import * as destroy from "./host_cmd/host_destroy";
import * as resyncFailover from "./host_cmd/resync_failover";

addCommand((yargs: Argv<BaseArgs>) =>
  yargs.command(
    ["hosts <command>", "host <command>"],
    "Commands to manage self-hosted EnvKey installations.",
    (yargs) => yargs.command(destroy).command(resyncFailover).demandCommand() // invalid sub-commands will hang without this
  )
);
