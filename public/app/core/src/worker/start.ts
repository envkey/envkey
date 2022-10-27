import workerpool from "workerpool";
import path from "path";
import os from "os";
import { log } from "../lib/utils/logger";

declare var process: {
  resourcesPath: string;
  env: {
    IS_TEST?: string;
    WORKER_PATH_FROM_ELECTRON_RESOURCES?: string;
    WORKER_PATH?: string;
    IS_ELECTRON?: string;
  };
};

let workerPath: string;

if (
  process.env["WORKER_PATH_FROM_ELECTRON_RESOURCES"] &&
  process.resourcesPath
) {
  // Electron in production
  workerPath = path.resolve(
    process.resourcesPath,
    process.env["WORKER_PATH_FROM_ELECTRON_RESOURCES"]
  );
} else if (process.env["WORKER_PATH"]) {
  if (process.env.IS_ELECTRON) {
    // Electron in development
    workerPath = process.env.WORKER_PATH;
  } else {
    // CLI
    workerPath = path.join(__dirname, process.env.WORKER_PATH);
  }
} else {
  // development
  workerPath = path.resolve(__dirname, "../../build/worker.js");
}

const numCpus = os.cpus().length;
const numWorkers = numCpus;
// const numWorkers = Math.max(1, numCpus - 1);
if (!process.env.IS_TEST) {
  log("starting workers", { numCpus, numWorkers });
}

let workerPool = workerpool.pool(workerPath, {
    workerType: process.env.IS_ELECTRON ? "process" : "thread",
    maxWorkers: numWorkers,
    minWorkers: "max",
  }),
  proxyPromise = (<any>workerPool.proxy()) as Promise<any>;

export const getProxy = async <T = any>() => {
  const res = await proxyPromise;
  return res as T;
};

export const terminateWorkerPool = async () => {
  if (workerPool) {
    await workerPool.terminate(true, 200);
  }

  (workerPool as any) = null;
  (proxyPromise as any) = null;
};
