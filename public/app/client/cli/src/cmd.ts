import yargs from "yargs";
import { setAutoMode, isAutoMode } from "./lib/console_io";
import { version } from "../package.json";

export type Command = (y: yargs.Argv) => yargs.Argv;

const commands: {
  cmd: Command;
  completion?: { name: string; fn: yargs.PromiseCompletionFunction };
}[] = [];
const completionsByName: Record<string, yargs.PromiseCompletionFunction> = {};

export const addCommand = (
  cmd: Command,
  completion?: { name: string; fn: yargs.PromiseCompletionFunction }
) => commands.push({ cmd, completion });

export const init = () => {
  yargs
    // built-in --version this does NOT work from inside webpack. it is handled in index.ts
    .option("account", {
      type: "string",
      coerce: (s: string) => s.toLowerCase().trim(),
      describe: "Your EnvKey account's email",
    })
    .option("org", {
      type: "string",
      coerce: (s: string) => s.toLowerCase().trim(),
      describe:
        "Name of organization (if you belong to more than one with the same email)",
    })
    .option("cli-envkey", {
      type: "string",
      conflicts: ["account", "org"],
      describe:
        "Access key for automating the CLI (can also use CLI_ENVKEY environment variable)",
    })
    .option("json", {
      type: "boolean",
      describe: "Output JSON data on success and disable interactive prompts",
    })
    .option("json-pretty", {
      type: "boolean",
      describe: "Same as --json but formatted for readability",
    })
    .option("json-path", {
      type: "string",
      describe: "Filter --json output with a path; example: 'apps[0].name'",
    })
    .middleware((argv) => {
      if (
        argv["cli-envkey"] ||
        process.env.CLI_ENVKEY ||
        argv.json ||
        argv["json-pretty"]
      ) {
        setAutoMode(true, argv["json-path"], argv["json-pretty"]);
      }
      return argv;
    })
    .version("version", "Show the EnvKey CLI version", version)
    .option("verbose", {
      type: "boolean",
      describe: "Some commands show additional output",
    });

  for (let { cmd, completion } of commands) {
    cmd(yargs);
    if (completion) {
      completionsByName[completion.name] = completion.fn;
    }
  }

  const failFn = (msg?: string, err?: Error) => {
    if (isAutoMode()) {
      if (msg || err) {
        console.log(JSON.stringify({ ok: false, message: msg || undefined }));
      } else {
        console.log(
          JSON.stringify({
            ok: false,
            message: "Missing required arguments in auto mode",
          })
        );
      }
    } else {
      yargs.showHelp();
      if (msg) {
        console.error(msg);
      }
      if (err) {
        console.error(err);
      }
    }

    process.exit(1);
  };

  yargs
    .help()
    .alias({
      help: "h",
    })
    .demandCommand()
    .recommendCommands()
    .wrap(Math.min(yargs.terminalWidth(), 110))
    // prevents perpetual hang when partial commands like `accounts:notreal` are given,
    // instead will print "Unknown argument"
    .strict()
    .fail(failFn)
    .parse();
};
