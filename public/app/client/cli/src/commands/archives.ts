import { Argv } from "yargs";
import { addCommand } from "../cmd";
import { BaseArgs } from "../types";
import * as exportCmd from "./archives_cmd/archive_export";

addCommand((yargs: Argv<BaseArgs>) =>
  yargs.command(
    ["archives <command>", "archive <command>"],
    "Commands to manage org archives.",
    (yargs) => yargs.command(exportCmd).demandCommand() // invalid sub-commands will hang without this
  )
);
