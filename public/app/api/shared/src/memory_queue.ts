import { log, logStderr } from "@core/lib/utils/logger";
import { wait } from "@core/lib/utils/wait";

type QueueTask = () => Promise<void>;
type QueueItem = { runCounter: number; task: QueueTask };

export const newMemoryQueue = (
  name: string,
  queuePauseOnFailure: number,
  queuePauseBetweenBatches = 0,
  batchSize = 1,
  maxRetries = 5
) => {
  process.on("exit", () => {
    if (queue.length || currentlyRunning.length) {
      for (const item of queue.concat(currentlyRunning)) {
        logStderr(`${name} queue may lose items on process exit!`, {
          item,
        });
      }
    }
  });

  let looping = false;

  const queue = [] as QueueItem[];
  // tasks that are taken out of the queue to be processed are tracked, in case the server
  // dies before they are done, they will be logged
  let currentlyRunning = [] as QueueItem[];

  const enqueue = (task: QueueTask) => {
    const item = { runCounter: 0, task };
    queue.push(item);

    maybeLoopQueue();
  };

  const reenqueue = (item: QueueItem) => {
    if (item.runCounter > maxRetries) {
      logStderr(
        `memory queue ${name} has a task which failed ${item.runCounter} times and will not be retried.`,
        { item }
      );
      return;
    }

    maybeLoopQueue();
  };

  const maybeLoopQueue = async () => {
    if (looping) {
      return;
    }

    looping = true;

    while (queue.length) {
      currentlyRunning = queue.splice(0, batchSize);
      // queue will block waiting for all tasks, including failure backoff
      await Promise.all(
        currentlyRunning.map((item) => {
          item.runCounter++;

          return item.task().catch(async (err) => {
            log(`queue ${name} task failed, will retry`, {
              err,
              queuePauseOnFailure,
              item: item.toString()?.substring(0, 50),
            });

            reenqueue(item);

            if (queuePauseOnFailure) {
              await wait(queuePauseOnFailure);
            }
          });
        })
      );

      // all tasks completed or were re-enqueued
      currentlyRunning = [];

      if (queuePauseBetweenBatches) {
        await wait(queuePauseBetweenBatches);
      }
    }
    looping = false;
  };

  return {
    enqueue,
  };
};
