import { Worker } from "cluster";
import { Client } from "@core/types";
import cluster from "cluster";
import { log } from "@core/lib/utils/logger";

let worker: Worker | undefined;

export const setWorker = (w: Worker) => {
  if (!cluster.isMaster) {
    throw new Error("procStatusWorker.setWorker not called from master");
  }
  log("procStatusWorker.setWorker", { w: !!w });
  worker = w;
};

export const waitForStart = async () => {
  log("procStatusWorker.waitForStart");
  if (!cluster.isMaster) {
    throw new Error("procStatusWorker.waitForStart not called from master");
  }

  return new Promise<void>((resolve) => {
    const onWorkerStart = (message: Client.WorkerToMainProcessMessage) => {
      log("procStatusWorker.waitForStart - onWorkerStart", { message });
      if (message.type == "workerStarted") {
        log("Status worker started", { isConnected: worker?.isConnected() });
        worker!.off("message", onWorkerStart);

        resolve();
      }
    };
    worker!.on("message", onWorkerStart);
  });
};

export const handleWorkerToMainMessage = (
  handler: (message: Client.WorkerToMainProcessMessage) => Promise<void>
) => {
  if (!worker) {
    throw new Error("procStatusWorker not initialized");
  }

  if (!cluster.isMaster) {
    throw new Error(
      "procStatusWorker.handleWorkerToMainMessage not called from master"
    );
  }

  worker.on("message", handler);
};

export const sendMainToWorkerMessage = (
  message: Client.MainToWorkerProcessMessage
) => {
  if (process.env.NODE_ENV == "test") {
    return;
  }

  if (!worker) {
    throw new Error("procStatusWorker not initialized");
  }

  if (!cluster.isMaster) {
    throw new Error(
      "procStatusWorker.sendMainToWorkerMessage not called from master"
    );
  }

  // log("procStatusWorker.sendMainToWorkerMessage", {
  //   type: message.type,
  // });

  worker.send(message);
};

export const kill = (signal = "SIGTERM") => {
  if (!worker) {
    throw new Error("procStatusWorker not initialized");
  }
  if (!cluster.isMaster) {
    throw new Error("procStatusWorker.kill not called from master");
  }

  log("procStatusWorker.kill", { signal });

  try {
    worker.kill(signal);
  } catch (err) {
    log("procStatusWorker.kill error", { err });
  }
};

export const sendWorkerToMainMessage = (
  message: Client.WorkerToMainProcessMessage
) => {
  if (!cluster.isWorker) {
    throw new Error(
      "procStatusWorker.sendWorkerToMainMessage not called from worker"
    );
  }

  if (!process.send) {
    throw new Error(
      "procStatusWorker.sendWorkerToMainMessage process.send not defined"
    );
  }

  // log("procStatusWorker.sendWorkerToMainMessage", {
  //   message,
  //   trace: new Error().stack,
  // });

  process.send!(message);
};
