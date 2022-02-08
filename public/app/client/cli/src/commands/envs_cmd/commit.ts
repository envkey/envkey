import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { BaseArgs } from "../../types";
import * as R from "ramda";
import {
  getPending,
  getShowEnvs,
  selectPendingEnvironments,
  fetchEnvsIfNeeded,
} from "../../lib/envs";
import { confirmPendingConflicts } from "../../lib/conflicts";
import chalk from "chalk";
import { spinnerWithText, stopSpinner } from "../../lib/spinner";
import { dispatch, initCore } from "../../lib/core";
import { Client, Model } from "@core/types";
import { logAndExitIfActionFailed, displayFullEnvName } from "../../lib/args";
import { authz, getEnvironmentName } from "@core/lib/graph";
import { hasPendingConflicts } from "@core/lib/client";
import { autoModeOut, getPrompt, isAutoMode } from "../../lib/console_io";

export const command = "commit [app-or-block] [environment]";
export const desc = "Commit pending environment changes.";
export const builder = (yargs: Argv<BaseArgs>) =>
  yargs
    .positional("app-or-block", { type: "string", coerce: R.toLower })
    .positional("environment", { type: "string", coerce: R.toLower })
    .option("local-override", {
      type: "boolean",
      alias: ["l", "local-overrides"],
      describe: "Commit local overrides for the current user",
    })
    .option("override-for-user", {
      type: "string",
      alias: ["u", "overrides-for-user"],
      describe: "Commit local overrides for another user",
      conflicts: ["local-override"],
      coerce: (value) => {
        if (!value) {
          throw new Error("Missing user override");
        }
        return value;
      },
    })
    .option("message", {
      type: "string",
      alias: "m",
      initial: "",
      describe: "Add a commit message",
    });

export const handler = async (
  argv: BaseArgs & {
    "app-or-block"?: string;
    environment?: string;
    "local-override"?: boolean;
    "override-for-user"?: string;
    message?: string;
    all?: boolean;
  }
): Promise<void> => {
  const prompt = getPrompt();
  let { state, auth } = await initCore(argv, true);

  const shouldCommitAll = !argv["app-or-block"];
  let envParent: Model.EnvParent | undefined;
  let environment: Model.Environment | undefined;
  let pendingOpts: object | undefined;
  let pendingEnvironmentIds: string[] | undefined;
  let overrideUser: Model.OrgUser | Model.CliUser | undefined;

  if (!shouldCommitAll) {
    ({
      state,
      auth,
      envParent,
      environment,
      user: overrideUser,
      pendingOpts,
      pendingEnvironmentIds,
    } = await selectPendingEnvironments({
      state,
      auth,
      argv,
      envParentArg: argv["app-or-block"],
      environmentArg: argv["environment"],
      overrideByUser:
        (argv["local-override"] && auth.userId) || argv["override-for-user"],
    }));
  }

  let envParentIds: string[] = [];
  if (envParent) {
    envParentIds = [envParent.id];
  } else if (shouldCommitAll) {
    envParentIds = R.uniq(
      state.pendingEnvUpdates.map(({ meta: { envParentId } }) => envParentId)
    );
  }
  state = await fetchEnvsIfNeeded(state, envParentIds);

  const [summary, pending] = getPending(state, pendingOpts);

  if (!pending) {
    console.log(chalk.bold("No pending changes for the parameters."));
    autoModeOut({ pending: null });
    return exit();
  }

  console.log(summary, "\n" + pending);

  if (!isAutoMode()) {
    let pendingEnvDescription: string | undefined;
    if (!shouldCommitAll) {
      if (overrideUser) {
        pendingEnvDescription =
          overrideUser.type === "cliUser"
            ? overrideUser.name
            : [overrideUser.firstName, overrideUser.lastName].join(" ");
      } else {
        pendingEnvDescription = [
          // handling pending local override...
          envParent!.name,
          getEnvironmentName(state.graph, environment!.id),
        ].join(" ");
      }
    }

    if (hasPendingConflicts(state)) {
      await confirmPendingConflicts(
        state,
        envParent ? [envParent.id] : undefined,
        environment ? [environment.id] : undefined
      );
    } else {
      const { confirm } = await prompt<{ confirm: boolean }>({
        type: "confirm",
        name: "confirm",
        message: chalk.bold(
          `Commit ${
            shouldCommitAll ? "all pending" : pendingEnvDescription
          } changes?`
        ),
      });

      if (!confirm) {
        return exit(1, chalk.bold("Commit aborted."));
      }
    }
  }

  if (pendingEnvironmentIds?.length) {
    for (let envId of pendingEnvironmentIds) {
      if (!authz.canUpdateEnv(state.graph, auth.userId, envId)) {
        console.error(
          chalk.red(
            `Cannot modify environment ${chalk.bold(
              displayFullEnvName(state.graph, envId)
            )}. You may need to revert changes on that environment before continuing.`
          )
        );
      }
    }
  }
  spinnerWithText("Encrypting and syncing...");

  const res = await dispatch({
    type: Client.ActionType.COMMIT_ENVS,
    payload: {
      message: argv.message,
      pendingEnvironmentIds,
    },
  });
  await logAndExitIfActionFailed(
    res,
    "Pending environment changes failed to commit."
  );
  stopSpinner();
  state = res.state;

  if (envParent && environment) {
    const [output] = getShowEnvs(state, envParent.id, [environment.id]);
    console.log(output, "\n");
  } else {
    console.log(
      `Changes committed. Use ${chalk.bold(
        "envkey show"
      )} to view the latest config.`
    );
  }

  const [, , diffsByEnvironmentId] = getPending(state);
  autoModeOut({
    pending: Object.keys(diffsByEnvironmentId).length
      ? diffsByEnvironmentId
      : null,
  });

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};
