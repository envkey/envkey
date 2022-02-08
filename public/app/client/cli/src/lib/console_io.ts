import { PassThrough } from "stream";
import { prompt as originalPrompt } from "enquirer";
import stripAnsiColors from "strip-ansi";
import getPath from "lodash/get";
import util from "util";

const discardStream = new PassThrough();
discardStream.on("data", (data) => {
  // discarded
});

let _autoModeStatus = false;
let _autoModePretty = false;
let _filterOutput: string | undefined;
let _autoModeWrote = false;

export const isAutoMode = (): boolean => Boolean(_autoModeStatus);

export const autoModeHasWritten = (): boolean => Boolean(_autoModeWrote);

export const autoModeOut = (
  data: { error?: string } & Record<string, any>
): void => {
  if (!isAutoMode()) {
    return;
  }
  if (_autoModeWrote) {
    process.stdout.write(
      `ERROR: Auto-mode wrote more than once! ${util.inspect(data)}\n`
    );
    process.exit(1);
  }
  _autoModeWrote = true;

  let outputObject: any = { ok: !data.error, ...data };
  // only apply filtered property output when it's not an error
  if (outputObject.ok) {
    if (_filterOutput) {
      outputObject = getPath(outputObject, _filterOutput);
    }
  }

  if (typeof outputObject === "string") {
    process.stdout.write(outputObject + "\n");
    return;
  }
  process.stdout.write(
    JSON.stringify(outputObject, null, _autoModePretty ? 2 : 0) + "\n"
  );
};

export const alwaysWriteError = (errorMessage: string) => {
  if (isAutoMode()) {
    autoModeOut({ error: stripAnsiColors(errorMessage) });
  } else {
    console.log(errorMessage);
  }
};

let _prompt: typeof originalPrompt = originalPrompt;
// Wraps enquirer.prompt to let us disable prompts during auto mode
export const getPrompt = (forceOriginalPrompt?: boolean) => {
  if (forceOriginalPrompt && _prompt != originalPrompt) {
    throw new Error("This command does not support auto-mode.");
  }
  return _prompt;
};
const overridePrompt = (fn: typeof originalPrompt) => {
  _prompt = fn;
};

export const resetPrompt = () => {
  _prompt = originalPrompt;
};

// Auto-Mode disables the normal CLI key-friendly console output, both stdout and stderr. It also
// throws an error when a prompt is required.
export const setAutoMode = (
  enabled: boolean,
  filterPath?: string,
  prettyPrint?: boolean
): void => {
  const statusChanged = _autoModeStatus !== enabled;
  _autoModeStatus = enabled;
  _autoModePretty = Boolean(prettyPrint);
  _filterOutput = filterPath || undefined;

  if (!statusChanged) {
    return;
  }

  if (_autoModeStatus) {
    // changed to enabled
    disableConsole();
    overridePrompt(disablePromptsFunc);
  } else {
    enableConsole();
    resetPrompt();
  }
};

const disableConsole = () => {
  // @ts-ignore
  console._stdout = discardStream;
  // @ts-ignore
  console._sterr = discardStream;
};

const enableConsole = () => {
  // @ts-ignore
  console._stdout = process.stdout;
  // @ts-ignore
  console._stderr = process.stderr;
};

const disablePromptsFunc = () => {
  // consider doing nothing
  throw new Error("Missing required arguments or flags");
};
