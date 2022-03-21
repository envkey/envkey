// Production logger is all on one line, and omits date, which suits cloudwatch better.
// Cloudwatch already logs the date, and has a tree collapse feature.

import path from "path";
import os from "os";
import fs from "fs";
import mkdirp from "mkdirp";
import { serializeError } from "serialize-error";

const noop = (...args: any): any => {};

const logdir = path.resolve(os.homedir(), `.envkey/logs`);

// log files are initialized on startup, once

const createAndOpenLogFile = (logName: string) => {
  mkdirp.sync(logdir);
  const today = new Date().toISOString().split("T")[0];
  // keeps only 10 log files
  const oldLogFiles: string[] = fs
    .readdirSync(logdir)
    .filter((fileName) => fileName.startsWith(logName));

  if (oldLogFiles.length > 10) {
    Promise.all(
      oldLogFiles
        .sort()
        .reverse()
        .slice(10)
        .map((filename) => fs.promises.unlink(`${logdir}/${filename}`))
    ).catch((err) => console.error(err));
  }

  const logFileLoc = path.resolve(logdir, `${logName}-${today}.log`);

  console.error("will write to log file at ", logFileLoc);

  try {
    const fd = fs.createWriteStream(logFileLoc, { flags: "a" });
    return fd;
  } catch (err) {
    console.error("Failed creating core_process log file!", logFileLoc, err);
    throw err;
  }
};

let outstream: fs.WriteStream | undefined;
process.on("exit", () => {
  if (!outstream) {
    return;
  }
  try {
    outstream.close();
    outstream = undefined; // prevent "write after close" as logger will only write to std
  } catch (err) {
    console.error("failed closing logger outstream on shutdown", err);
  }
});

const logWithLogger = (
  stdioName: "stdout" | "stderr",
  spaces: number,
  msg: string,
  data?: object
) => {
  // cannot save process.stdout.write directly, lest it will crash
  const write = (s: string) => {
    if (outstream) {
      outstream.write(s);
    }
    process[stdioName].write(s);
  };

  const ts = new Date().toISOString();

  if (process.env.NODE_ENV !== "production") {
    write(ts + " -- ");
  }

  const frontPropsLogged: { msg?: string; alert?: boolean } | any = {
    msg, // for easier reading in prod, put msg key first
  };
  if (stdioName === "stderr") {
    frontPropsLogged.alert = true;
  }
  const logObj = { ts, ...frontPropsLogged, ...data };
  // dev logger, multiline with ms diff
  if (spaces) {
    delete logObj.msg;
    write(msg);
    if (data) {
      const json = JSON.stringify(logObj, getCircularReplacer(), spaces);
      write(" " + json);
    }
    write("\n");
    return;
  }

  // prod logger, all on one line
  write(JSON.stringify(logObj, getCircularReplacer()) + "\n");
};

const spaces = process.env.NODE_ENV === "production" ? 0 : 2;

export type Logger = (msg: string, data?: object) => void;

export const log: Logger = (msg: string, data?: object) =>
  logWithLogger("stdout", spaces, msg, data);

export const logStderr: Logger = (msg: string, data?: object) =>
  logWithLogger("stderr", spaces, msg, data);

export const logDevOnly: Logger = (msg: string, data?: object) =>
  process.env.NODE_ENV === "production"
    ? noop
    : logWithLogger("stdout", spaces, "<dev only> " + msg, data);

export const initFileLogger = (name: string) => {
  if (!outstream) {
    outstream = createAndOpenLogFile(name);
    log(`logger initialized with name ${name}`);
    return;
  }
  console.error(
    "Cannot initFileLogger with name as already initialized",
    name,
    outstream.path
  );
};

export const logWithElapsed = (lbl: string, now: number, obj: {} = {}) =>
  log(lbl, { ...obj, elapsed: (Date.now() - now).toString() + "ms" });

// Prevents: `TypeError: cyclic object value`
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Cyclic_object_value
export const getCircularReplacer = () => {
  const seen = new WeakSet();
  return (key: any, value: any): any => {
    const t = typeof value;
    if (t === "object" && value !== null) {
      if (seen.has(value)) {
        return `[object ${key}]`;
      }
      seen.add(value);
    }
    // functions are normally omitted by JSON.stringify
    if (t === "function" && value !== null) {
      const funcString = value.toString();
      return funcString;
    }
    if (value instanceof Error) {
      return serializeError(value);
    }
    return value;
  };
};
