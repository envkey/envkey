import workerpool from "workerpool";
import path from "path";
import os from "os";
import cluster from "cluster";
import { log } from "../lib/utils/logger";

declare var process: {
  resourcesPath: string;
  env: {
    IS_TEST?: string;
    WORKER_PATH_FROM_ELECTRON_RESOURCES?: string;
    WORKER_PATH?: string;
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
  // CLI
  workerPath = path.join(__dirname, process.env.WORKER_PATH);
} else {
  // development
  workerPath = path.resolve(__dirname, "../../build/worker.js");
}

const numCpus = os.cpus().length;
const numWorkers = cluster.isMaster ? numCpus : 1;
if (!process.env.IS_TEST) {
  log("starting background worker threads", {
    numCpus,
    numWorkers,
    isMaster: cluster.isMaster,
    isWorker: cluster.isWorker,
  });
}

let workerPool = workerpool.pool(workerPath, {
    workerType: "thread",
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
