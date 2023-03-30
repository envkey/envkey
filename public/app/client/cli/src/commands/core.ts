import { Argv } from "yargs";
import { addCommand } from "../cmd";
import { BaseArgs } from "../types";

import * as restart from "./core_cmd/restart";
import * as start from "./core_cmd/start";
import * as status from "./core_cmd/status";
import * as stop from "./core_cmd/stop";
import * as reportError from "./core_cmd/report_error";

addCommand((yargs: Argv<BaseArgs>) =>
  yargs.command(
    ["core <command>"],
    "Commands to manage EnvKey's core process daemon.",
    (yargs) =>
      yargs
        .command(status)
        .command(start)
        .command(stop)
        .command(restart)
        .command(reportError)
        .demandCommand() // invalid sub-commands will hang without this
  )
);
