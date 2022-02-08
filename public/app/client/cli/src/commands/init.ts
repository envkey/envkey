import fs from "fs";
import chalk from "chalk";
import path from "path";
import { exit } from "../lib/process";
import { Argv } from "yargs";
import { addCommand } from "../cmd";
import { BaseArgs } from "../types";
import { Model } from "@core/types";
import { initCore } from "../lib/core";
import { findApp } from "../lib/args";
import { getPrompt, autoModeOut } from "../lib/console_io";
import * as g from "@core/lib/graph";
import * as R from "ramda";
import { createApp } from "../lib/apps";

addCommand((yargs: Argv<BaseArgs> & { app?: string }) =>
  yargs.command(
    "init [app]",
    "Initialize the current directory to a new or existing EnvKey app.",
    (yargs) =>
      yargs.positional("app", { type: "string", describe: "app name" }),
    async (argv) => {
      const prompt = getPrompt();
      const { state, auth } = await initCore(argv, true, true);
      let app: Model.App | undefined;

      let initType: "existing" | "create" | undefined;

      if (argv["app"]) {
        app = findApp(state.graph, argv["app"]);
        initType = "existing";
      }

      // choose an app
      if (!app) {
        const apps = g.graphTypes(state.graph).apps;
        const canCreate = g.authz.canCreateApp(state.graph, auth.userId);

        if (!canCreate) {
          initType = "existing";
        } else if (apps.length > 0) {
          initType = (
            await prompt<{ initType: typeof initType }>({
              type: "select",
              name: "initType",
              message: "Do you want to:",
              choices: [
                { name: "existing", message: "Attach an existing EnvKey app" },
                {
                  name: "create",
                  message: "Create a new EnvKey app and attach it",
                },
              ],
            })
          ).initType;
        } else {
          initType = "create";
        }

        if (initType == "existing") {
          if (apps.length == 0) {
            console.log(chalk.bold("There are no apps to attach."));
            return exit();
          }

          const appChoices = R.sortBy(
            R.prop("name"),
            apps.map((a) => ({
              name: a.name,
              message: chalk.bold(a.name),
            }))
          );

          const appName = (
            await prompt<{ app: string }>({
              type: "autocomplete",
              name: "app",
              message: "App:",
              choices: appChoices,
            })
          ).app as string;
          app = findApp(state.graph, appName);
        } else if (initType == "create") {
          app = await createApp(auth, state, argv.app, process.cwd(), true);
        }
      }

      if (!app) {
        return exit(1, chalk.red.bold("No apps can be attached."));
      }

      if (initType == "existing") {
        try {
          await new Promise<void>((resolve, reject) =>
            fs.writeFile(
              path.join(process.cwd(), ".envkey"),
              JSON.stringify({ appId: app!.id, orgId: auth.orgId }),
              (err) => {
                if (err) {
                  return reject(err);
                }
                resolve();
              }
            )
          );
        } catch (err) {
          return exit(
            1,
            chalk.red.bold("Couldn't create new app .envkey config file")
          );
        }

        console.log("Wrote .envkey file to " + chalk.green.bold(process.cwd()));
        console.log(
          "It should be " +
            chalk.cyan.bold("checked in") +
            " to version control."
        );

        autoModeOut({});
      } else if (initType == "create") {
        autoModeOut({ name: app.name, id: app.id });
      }

      // need to manually exit process since yargs doesn't properly wait for async handlers
      return exit();
    }
  )
);
