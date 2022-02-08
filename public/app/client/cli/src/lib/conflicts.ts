import { applyPatch } from "rfc6902";
import { exit } from "./process";
import * as R from "ramda";
import { Client, Model } from "@core/types";
import { getEnvironmentName, getUserName } from "@core/lib/graph";
import chalk from "chalk";
import Table from "cli-table3";
import {
  getEnvWithMeta,
  getPendingEnvWithMeta,
  getAllPendingConflicts,
  hasPendingConflicts,
  getEnvWithMetaCellDisplay,
} from "@core/lib/client";
import { twitterShortTs } from "@core/lib/utils/date";
import { getPrompt } from "./console_io";

export const printPendingConflictsReport = (
  state: Client.State,
  envParentIdsArg?: string[],
  environmentIdsArg?: string[]
) => {
  const allConflicts = getAllPendingConflicts(
    state,
    envParentIdsArg,
    environmentIdsArg
  );

  for (let envParentId in allConflicts) {
    const envParent = state.graph[envParentId] as Model.EnvParent;

    for (let environmentId in allConflicts[envParentId]) {
      const conflicts = allConflicts[envParentId][environmentId];

      const environment = state.graph[environmentId] as
        | Model.Environment
        | undefined;

      const envWithMeta = getEnvWithMeta(state, {
          envParentId,
          environmentId,
        }),
        pendingEnvWithMeta = getPendingEnvWithMeta(state, {
          envParentId,
          environmentId,
        });

      for (let conflict of conflicts) {
        const table = new Table({
          colWidths: [12, 77],
        });
        let label = "⚠️   " + envParent.name + " > ";
        if (environment?.isSub) {
          const parentEnvironment = state.graph[
            environment.parentEnvironmentId
          ] as Model.Environment;
          label +=
            getEnvironmentName(
              state.graph,
              parentEnvironment.id
            ).toLowerCase() + " > ";
        }
        label += getEnvironmentName(state.graph, environmentId).toLowerCase();
        label += ` > ${chalk.bgRed(" " + conflict.entryKey + " ")}`;

        table.push(
          [
            {
              content: chalk.bold(label),
              colSpan: 2,
            },
          ],
          [
            "Set By",
            `${getUserName(
              state.graph,
              conflict.changeset.createdById
            )}, ${twitterShortTs(conflict.changeset.createdAt)}`,
          ]
        );

        if (conflict.changeset.message) {
          table.push(["Message", conflict.changeset.message]);
        }

        const envWithMetaPrevious = R.clone(envWithMeta);
        applyPatch(envWithMetaPrevious, conflict.action.payload.reverse);
        const previousDisplay = getEnvWithMetaCellDisplay(
          state.graph,
          envWithMetaPrevious.variables[conflict.entryKey]
        );
        table.push([chalk.red("Was"), chalk.red(chalk.bold(previousDisplay))]);

        const envWithMetaToUpdate = R.clone(envWithMeta);
        applyPatch(envWithMetaToUpdate, conflict.action.payload.diffs);
        const updatedDisplay = getEnvWithMetaCellDisplay(
          state.graph,
          envWithMetaToUpdate.variables[conflict.entryKey]
        );
        table.push([
          chalk.green("Now"),
          chalk.green(chalk.bold(updatedDisplay)),
        ]);

        const pendingDisplay = getEnvWithMetaCellDisplay(
          state.graph,
          pendingEnvWithMeta.variables[conflict.entryKey]
        );
        table.push([
          chalk.cyan("Pending"),
          chalk.cyan(chalk.bold(pendingDisplay)),
        ]);

        console.log(table.toString() + "\n\n");
      }
    }
  }
};

export const confirmPendingConflicts = async (
  state: Client.State,
  envParentIds?: string[],
  environmentIds?: string[]
) => {
  const prompt = getPrompt();
  if (!hasPendingConflicts(state, envParentIds, environmentIds)) {
    return;
  }

  console.log(
    "\n  ⚠️   Some variables with pending changes have been recently updated and may have conflicts.\n"
  );

  printPendingConflictsReport(state, envParentIds, environmentIds);

  console.log(
    `  ⚠️   Please make sure there are no conflicts before committing.\n  ⚠️   Use ${chalk.bold(
      "envkey reset"
    )} to discard some or all of your pending changes.\n`
  );

  const { confirm } = await prompt<{ confirm: boolean }>({
    type: "confirm",
    name: "confirm",
    message: chalk.bold("Are you sure you want to commit these changes?"),
  });

  if (!confirm) {
    console.log(chalk.bold("Commit aborted."));
    return exit();
  }
};
