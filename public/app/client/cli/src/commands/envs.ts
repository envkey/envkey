import { Argv } from "yargs";
import { addCommand } from "../cmd";
import { BaseArgs } from "../types";

import * as setCmd from "./envs_cmd/set";
import * as show from "./envs_cmd/show";
import * as pending from "./envs_cmd/pending";
import * as reset from "./envs_cmd/reset";
import * as commit from "./envs_cmd/commit";
import * as importCmd from "./envs_cmd/import";
import * as exportCmd from "./envs_cmd/export";
import * as list from "./envs_cmd/envs_list";

addCommand((yargs: Argv<BaseArgs>) =>
  yargs.command(
    ["envs <command>", "environments <command>"],
    "Commands to manage environment variables.",
    (yargs) =>
      yargs
        .command(list)
        .command(setCmd)
        .command(show)
        .command(pending)
        .command(reset)
        .command(commit)
        .command(importCmd)
        .command(exportCmd)
        .demandCommand() // invalid sub-commands will hang without this
  )
);
