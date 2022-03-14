import { addCommand } from "../cmd";
import { exit } from "../lib/process";
import { Argv } from "yargs";
import { dispatch, initCore } from "../lib/core";
import { BaseArgs } from "../types";
import {
  authz,
  getEnvironmentsByEnvParentId,
  graphTypes,
} from "@core/lib/graph";
import chalk from "chalk";
import Table from "cli-table3";
import { Api, Client, Logs, Model } from "@core/types";
import { findEnvironment } from "../lib/envs";
import {
  findApp,
  findBlock,
  findCliUser,
  findUser,
  logAndExitIfActionFailed,
} from "../lib/args";
import { dateFromRelativeTime } from "@core/lib/utils/date";
import {
  autoModeOut,
  isAutoMode,
  getPrompt,
  alwaysWriteError,
} from "../lib/console_io";
import moment from "moment";
import "moment-timezone";

const TZ_NAME = moment.tz.guess();
const TZ_ABBREV = moment.tz(TZ_NAME).zoneAbbr();

addCommand((yargs: Argv<BaseArgs>) =>
  yargs.command(
    "logs",
    "View and filter audit logs.",
    (yargs) =>
      yargs
        .option("host", {
          type: "boolean",
          describe: "View all logs for all orgs on the host (self-hosted only)",
        })
        .option("errors", {
          type: "boolean",
          alias: ["error"],
          describe: "Filter by actions which resulted in errors",
          conflicts: ["no-errors"],
        })
        .option("no-errors", {
          type: "boolean",
          describe: "Filter by actions which did not result in errors",
        })
        .option("auth", {
          type: "boolean",
          describe:
            "Filter to actions related to authentication and authorization",
          conflicts: ["host"],
        })
        .option("updates", {
          type: "boolean",
          describe: "Filter to all organization changes",
          conflicts: ["host"],
        })
        .option("env-updates", {
          type: "boolean",
          describe: "Filter to environment config changes",
        })
        .option("access", {
          type: "boolean",
          describe: "Filter to actions related to any fetch actions",
          conflicts: ["host"],
        })
        .option("envkey-access", {
          type: "boolean",
          describe: "Filter to actions related to envkey fetches",
          conflicts: ["host", "client-access"],
        })
        .option("client-access", {
          type: "boolean",
          describe: "Filter to actions related to user fetches",
          conflicts: ["host", "envkey-access"],
        })
        .option("server-access", {
          type: "boolean",
          describe: "Filter to actions related to server envkey fetches",
          conflicts: [
            "host",
            "envkey-access",
            "auth",
            "updates",
            "access",
            "envkey-access",
            "client-access",
            "local-access",
          ],
        })
        .option("local-access", {
          type: "boolean",
          describe: "Filter to actions related to local key fetches",
          conflicts: [
            "host",
            "envkey-access",
            "auth",
            "updates",
            "access",
            "envkey-access",
            "client-access",
            "server-access",
          ],
        })
        .option("from", {
          type: "string",
          alias: ["start-time"],
          describe:
            "Show logs starting from this date-time, also supports time periods like 120s, 2m, 1h, 1d",
          coerce: coerceDate,
        })
        .option("until", {
          type: "string",
          alias: ["end-time"],
          describe:
            "Show logs up to this date-time, also supports time periods like 120s, 2m, 1h, 1d",
          coerce: coerceDate,
        })
        .option("person", {
          type: "string",
          alias: ["u"],
          describe:
            "Show actions done by, or done to, a specific person (email address)",
          conflicts: ["app", "block", "environment"],
        })
        .option("desc", {
          type: "boolean",
          alias: ["descending"],
          describe: "Show newest logs first (default)",
          conflicts: ["asc"],
        })
        .option("asc", {
          type: "boolean",
          alias: ["ascending"],
          describe: "Show oldest logs first",
          conflicts: ["desc"],
        })
        .option("app", {
          type: "string",
          describe: "Show logs for a specific app",
          conflicts: ["block"],
        })
        .option("block", {
          type: "string",
          describe: "Show logs for a specific block",
        })
        .option("environment", {
          type: "string",
          alias: ["e"],
          describe: "Show logs for a specific environment",
        })
        .option("local-overrides", {
          type: "string",
          alias: ["locals"],
          describe: "Show local override logs for a user (by email)",
        })
        .option("ips", {
          type: "string",
          alias: ["ip"],
          describe:
            "Show logs for a specific accessor IP address using a comma-separated list of IPs",
        })
        .option("envkey-short", {
          type: "string",
          describe:
            "Show logs for a generated envkey using its (by short key such as `6Lzi`)",
          conflicts: ["person", "local-overrides", "ips"],
        })
        .option("page", {
          type: "number",
          alias: "p",
          describe: "Page number",
        }),
    async (argv) => {
      const prompt = getPrompt();
      let { state, auth } = await initCore(argv, true);
      const exitWrapper = async (code: number = 0) => {
        await dispatch({ type: Client.ActionType.CLEAR_LOGS });
        return exit(code);
      };

      const payload = {
        pageNum: argv["page"] ? argv["page"] - 1 : 0,
        pageSize: isAutoMode() ? 100 : Math.floor(process.stdout.rows / 2 / 2),
        scope: "org",
        startsAt: argv.from,
        endsAt: argv.until ?? Date.now(),
        sortDesc: argv.desc || !argv.asc,
        error: argv["errors"] ? true : argv["no-errors"] ? false : undefined,
      } as Api.Net.ApiParamTypes["FetchLogs"];
      // payload params that are highly modified are better added later (TS)
      const loggableTypes: Api.Net.ApiParamTypes["FetchLogs"]["loggableTypes"] =
        [];
      const actionTypes: string[] = [];
      let targetIds: string[] = [];

      // processing flags

      if (argv.host) {
        payload.scope = "host";
      }
      // loggableTypes
      if (argv.auth) {
        loggableTypes.push("authAction");
      }
      if (argv.updates) {
        loggableTypes.push("orgAction");
      }
      if (argv.access) {
        loggableTypes.push("fetchMetaAction", "fetchEnvkeyAction");
      }
      if (argv["envkey-access"]) {
        loggableTypes.push("fetchEnvkeyAction");
      }
      if (argv["client-access"]) {
        loggableTypes.push("fetchMetaAction");
      }
      if (argv["server-access"]) {
        loggableTypes.push("fetchEnvkeyAction");
        targetIds.push(...graphTypes(state.graph).servers.map((s) => s.id));
      }
      if (argv["local-access"]) {
        loggableTypes.push("fetchEnvkeyAction");
        targetIds.push(...graphTypes(state.graph).localKeys.map((s) => s.id));
      }
      // actionTypes
      if (argv["env-updates"]) {
        actionTypes.push(Api.ActionType.UPDATE_ENVS);
      }

      if (argv["environment"]) {
        // pass all environmentIds matching any app or block
        const { apps, blocks } = graphTypes(state.graph);
        const envIds: string[] = [];
        [...apps.map((a) => a.id), ...blocks.map((b) => b.id)].forEach(
          (envParentId) => {
            const env = findEnvironment(
              state.graph,
              envParentId,
              argv["environment"]!
            );
            if (env) {
              envIds.push(env.id);
            }
          }
        );
        targetIds.push(...envIds);
      }
      if (argv["person"]) {
        const user =
          findUser(state.graph, argv["person"]) ||
          findCliUser(state.graph, argv["person"]);
        if (!user) {
          alwaysWriteError("person not found");
          await exitWrapper(1);
        }
        payload.userIds = [user!.id];
        targetIds.push(user!.id);
      }
      if (argv["app"]) {
        const appId = findApp(state.graph, argv["app"])?.id as string;
        if (!appId) {
          alwaysWriteError("app not found");
          await exitWrapper(1);
        }
        const envs = getEnvironmentsByEnvParentId(state.graph)[appId];
        if (envs) {
          targetIds.push(...envs.map((e) => e.id));
        }
      }
      if (argv["block"]) {
        const blockId = findBlock(state.graph, argv["block"])?.id as string;
        if (!blockId) {
          alwaysWriteError("block not found");
          await exitWrapper(1);
        }
        const envs = getEnvironmentsByEnvParentId(state.graph)[blockId];
        if (envs) {
          targetIds.push(...envs.map((e) => e.id));
        }
      }
      if (argv["local-overrides"]) {
        if (!targetIds.length) {
          // for some reason, yargs `check` did not work, but that would have been preferred
          alwaysWriteError(
            "local-overrides requires a valid app, block, or environment flag"
          );
          await exitWrapper(1);
        }
        const user =
          findUser(state.graph, argv["local-overrides"]) ||
          findCliUser(state.graph, argv["local-overrides"]);
        if (!user) {
          alwaysWriteError("local-overrides user not found");
          await exitWrapper(1);
        }
        targetIds = targetIds.map((targetId) => `${targetId}|${user!.id}`);
      }
      if (argv["ips"]) {
        payload.ips = argv["ips"].split(",");
      }
      if (argv["envkey-short"]) {
        const generatedKey = graphTypes(state.graph).generatedEnvkeys.find(
          (g) => g.envkeyShort === argv["envkey-short"]
        );
        if (!generatedKey) {
          alwaysWriteError("envkey-short not matched to generated envkey");
          await exitWrapper(1);
        }
        targetIds.push(generatedKey!.id);
      }

      // final defaults, if options weren't provided
      payload.loggableTypes = loggableTypes.length
        ? loggableTypes
        : Logs.ORG_LOGGABLE_TYPES;
      payload.actionTypes = actionTypes.length ? actionTypes : undefined;
      payload.targetIds = targetIds.length ? targetIds : undefined;

      if (!authz.canFetchLogs(state.graph, auth.userId, auth.orgId, payload)) {
        alwaysWriteError(
          chalk.red.bold("You don't have permission to fetch the logs.")
        );
        await exitWrapper(1);
      }
      let res: Client.DispatchResult;

      res = await dispatch({
        type: Api.ActionType.FETCH_LOGS,
        payload: { ...payload, pageNum: 0 },
      });
      state = res.state;

      let totalLogsShown = state.loggedActionsWithTransactionIds.length;
      let totalLogsAvailable = <number>state.logsTotalCount;
      let totalPagesAvailable = Math.ceil(
        totalLogsAvailable / <number>payload.pageSize
      );

      console.log(
        JSON.stringify({
          totalLogsShown,
          totalLogsAvailable,
          totalPagesAvailable,
        })
      );

      readloop: while (true) {
        res = await dispatch({
          type: Api.ActionType.FETCH_LOGS,
          payload,
        });

        await logAndExitIfActionFailed(res, "Error fetching logs.");
        state = res.state;

        if (payload.pageNum == 0) {
          totalLogsShown = state.loggedActionsWithTransactionIds.length;
          totalLogsAvailable = <number>state.logsTotalCount;
          totalPagesAvailable = Math.ceil(
            totalLogsAvailable / <number>payload.pageSize
          );
        }

        const directionText = payload.sortDesc
          ? "most recent first"
          : "oldest first";

        const summary = `Page ${chalk.bold(payload.pageNum + 1)}${
          isNaN(totalPagesAvailable) ? "" : " of " + totalPagesAvailable
        }, showing ${totalLogsShown} rows per page, ${directionText}.`;

        const choices: string[] = [];
        const instructions: string[] = [];

        if (payload.pageNum > 0 && totalLogsAvailable > 1) {
          choices.push("P");
          instructions.push(`${chalk.bold("p")}revious`);
        }
        if (payload.pageNum < totalPagesAvailable - 1) {
          choices.push("N");
          instructions.push(`${chalk.bold("n")}ext`);
        }

        if (choices.length > 0) {
          console.clear();
        }

        console.log("");
        writeLogTable(
          state.graph,
          state.deletedGraph || {},
          state.loggedActionsWithTransactionIds.flatMap(
            ([, loggedActions]) => loggedActions
          )
        );

        autoModeOut({
          pageNum: payload.pageNum,
          pageSize: payload.pageSize,
          totalCount: totalLogsAvailable,
          totalPages: totalPagesAvailable,
          logs:
            res.state.loggedActionsWithTransactionIds.flatMap(
              ([, loggedActions]) => loggedActions
            ) || [],
        });

        if (isAutoMode()) {
          break;
        }

        if (choices.length == 0) {
          console.log(summary);
          break;
        }

        choices.push("Q");
        instructions.push(`${chalk.bold("q")}uit`);

        // clear them to prevent building them up after paging
        await dispatch({ type: Client.ActionType.CLEAR_LOGS });

        const { doNext } = await prompt<{ doNext: string }>({
          type: "input",
          name: "doNext",
          required: true,
          // Here is the user display footer and instructions
          message: `${summary} ${chalk.blueBright(
            instructions.join(", ")
          )}, or page number:`,
          validate: (value) =>
            choices.includes(value.toUpperCase()) ||
            !isNaN(parseInt(value, 10)),
        });

        const next = doNext.toUpperCase();

        if (next == "P") {
          payload.pageNum = Math.max(0, payload.pageNum - 1);
        } else if (next == "N") {
          payload.pageNum = payload.pageNum + 1;
        } else if (next == "Q") {
          break readloop;
        } else {
          const possiblePageNumber = parseInt(doNext, 10);
          if (!isNaN(possiblePageNumber) && possiblePageNumber >= 0) {
            payload.pageNum = possiblePageNumber - 1; // zero based pagination
          }
          alwaysWriteError(chalk.blueBright(instructions));
        }
      }
      await exitWrapper(0);
    }
  )
);

const isValidDateTime = (time: Date | object | null | undefined) =>
  Boolean(time && time instanceof Date);

const coerceDate = (value: string | undefined) => {
  if (!value) return;
  const time = dateFromRelativeTime(value);
  if (!isValidDateTime(time)) return;
  return +time!;
};

const writeLogTable = (
  graph: Client.Graph.UserGraph,
  deletedGraph: Client.Graph.UserGraph,
  logs: Logs.LoggedAction[]
) => {
  const table = new Table();
  table.push(
    ...logs.map((l) => {
      let performedBy = "";
      if (l.actorId) {
        const actor = graph[l.actorId] || deletedGraph[l.actorId];
        if (!actor) {
          performedBy = "<unknown user>";
        } else if (actor.type === "cliUser") {
          performedBy = `CLI: ${actor.name}`;
        } else if (actor.type === "orgUser") {
          performedBy = actor.email;
        }
      }
      // if (l.deviceId) {
      //   const device = (graph[l.deviceId] ||
      //     deletedGraph[l.deviceId]) as Model.OrgUserDevice;
      //   if (device) {
      //     performedBy += ` - ${device.name}`;
      //   }
      // }
      if ("generatedEnvkeyId" in l && l.generatedEnvkeyId) {
        const key = (graph[l.generatedEnvkeyId] ||
          deletedGraph[l.generatedEnvkeyId]) as Model.GeneratedEnvkey;
        if (key) {
          const server = graph[key.keyableParentId] as Model.Server;
          performedBy = server ? server.name : "<unknown key>";
        }
      }

      const errorOrOkMessage = l.error
        ? // ? `Error: ${l.errorStatus} ${l.errorReason}`
          `Error: ${l.errorStatus}`
        : "OK";
      return [
        performedBy,
        moment(l.createdAt).format(`YYYY-MM-DD HH:mm:ss.SSS`) + ` ${TZ_ABBREV}`,
        l.ip,
        l.actionType.split("/")[l.actionType.split("/").length - 1],
        errorOrOkMessage,
      ];
    })
  );
  console.log(table.toString());
};
