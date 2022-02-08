import { Argv } from "yargs";
import { addCommand } from "../cmd";
import { BaseArgs } from "../types";

import * as list from "./versions_cmd/versions_list";
import * as revert from "./versions_cmd/versions_revert";
import * as diffs from "./versions_cmd/versions_diffs";
import * as show from "./versions_cmd/versions_show";
import * as commitDiffs from "./versions_cmd/versions_diffs_commit";

addCommand((yargs: Argv<BaseArgs>) =>
  yargs.command(
    // singular `version` unavailable because it conflicts with `--version` and `version` of the whole CLI
    ["versions <command>"],
    "Commands to view or revert to previous versions.",
    (yargs) =>
      yargs
        .command(list)
        .command(diffs)
        .command(commitDiffs)
        .command(show)
        .command(revert)
        .demandCommand() // invalid sub-commands will hang without this
  )
);
