import { Argv } from "yargs";
import { addCommand } from "../cmd";
import { BaseArgs } from "../types";

import * as acceptInvite from "./accounts_cmd/accept_invite";
import * as list from "./accounts_cmd/list";
import * as lock from "./accounts_cmd/lock";
import * as unlock from "./accounts_cmd/unlock";
import * as signIn from "./accounts_cmd/sign_in";
import * as signOut from "./accounts_cmd/sign_out";
import * as deviceSettings from "./accounts_cmd/device_settings";
import * as setDefault from "./accounts_cmd/set_default";
import * as forget from "./accounts_cmd/forget";
import * as setLockout from "./accounts_cmd/set_lockout";
import * as setPassphrase from "./accounts_cmd/set_passphrase";
import * as setDefaultDeviceName from "./accounts_cmd/set_default_device_name";

addCommand((yargs: Argv<BaseArgs>) =>
  yargs.command(
    ["accounts <command>", "account <command>"],
    "Commands to manage EnvKey accounts on this device.",
    (yargs) =>
      yargs
        .command(list)
        .command(acceptInvite)
        .command(lock)
        .command(unlock)
        .command(signIn)
        .command(signOut)
        .command(deviceSettings)
        .command(setDefault)
        .command(forget)
        .command(setLockout)
        .command(setPassphrase)
        .command(setDefaultDeviceName)
        .demandCommand() // invalid sub-commands will hang without this
  )
);
