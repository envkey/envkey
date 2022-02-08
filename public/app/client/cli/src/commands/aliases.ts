import { addCommand } from "../cmd";

// Commands added below will be displayed in the same order in the --help command

import * as setCmd from "./envs_cmd/set";
addCommand((yargs) =>
  yargs.command(setCmd.command, setCmd.desc, setCmd.builder, setCmd.handler)
);

import * as show from "./envs_cmd/show";
addCommand((yargs) =>
  yargs.command(show.command, show.desc, show.builder, show.handler)
);

import * as pending from "./envs_cmd/pending";
addCommand((yargs) =>
  yargs.command(pending.command, pending.desc, pending.builder, pending.handler)
);

import * as reset from "./envs_cmd/reset";
addCommand((yargs) =>
  yargs.command(reset.command, reset.desc, reset.builder, reset.handler)
);

import * as commit from "./envs_cmd/commit";
addCommand((yargs) =>
  yargs.command(commit.command, commit.desc, commit.builder, commit.handler)
);

import * as importCmd from "./envs_cmd/import";
addCommand((yargs) =>
  yargs.command(
    importCmd.command,
    importCmd.desc,
    importCmd.builder,
    importCmd.handler
  )
);

import * as exportCmd from "./envs_cmd/export";
addCommand((yargs) =>
  yargs.command(
    exportCmd.command,
    exportCmd.desc,
    exportCmd.builder,
    exportCmd.handler
  )
);

import * as checkoutCmd from "./branch_cmd/checkout";
addCommand((yargs) =>
  yargs.command(
    checkoutCmd.command,
    checkoutCmd.desc,
    checkoutCmd.builder,
    checkoutCmd.handler
  )
);

import * as inviteUser from "./users_cmd/invite";
addCommand((yargs) =>
  yargs.command(
    inviteUser.command,
    inviteUser.desc,
    inviteUser.builder,
    inviteUser.handler
  )
);

import * as grantDevice from "./devices_cmd/grant";
addCommand((yargs) =>
  yargs.command(
    grantDevice.command.replace("authorize", "authorize-device"),
    grantDevice.desc,
    grantDevice.builder,
    grantDevice.handler
  )
);

import * as acceptInvite from "./accounts_cmd/accept_invite";
addCommand((yargs) =>
  yargs.command(
    acceptInvite.command,
    acceptInvite.desc,
    acceptInvite.builder,
    acceptInvite.handler
  )
);
