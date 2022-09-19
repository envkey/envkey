import { log, logStderr } from "@core/lib/utils/logger";
import { ensureEnv, env } from "../../../shared/src/env";
import express from "express";
import initRoutes from "./routes";
import { runMigrationsIfNeeded } from "./migrate";
import { resolveMaxPacketSize } from "../../../shared/src/db";

ensureEnv();

require("../../../shared/src/api_handlers");
require("../../../shared/src/fetch_handlers");

const app = express();
const port = env.EXPRESS_PORT ? parseInt(env.EXPRESS_PORT) : 3000;

app.use(
  express.json({
    limit: "200mb",
    verify: (req, res, buf) => {
      (req as any).rawBody = buf;
    },
  })
);

export default (
  injectHandlers: (app: express.Application) => void,
  afterDbCallback?: (port: number) => Promise<void>,
  exitHandlerArg?: () => Promise<void>
) => {
  if (exitHandlerArg) {
    addExitHandler(exitHandlerArg);
  }

  // init routes after the caller of startup(app) so they can attach any routes before
  // we initRoutes(app) and add the 404 and final error handler
  injectHandlers(app);
  initRoutes(app);

  return runMigrationsIfNeeded()
    .then(() => resolveMaxPacketSize())
    .then(async () => {
      if (afterDbCallback) {
        await afterDbCallback(port);
      }

      const server = app.listen(port, () => {
        log(`EnvKey Api running via express runtime on port ${port}!`);
      });

      return {
        server,
      };
    });
};

let exitHandler: (() => Promise<void>) | undefined;
const addExitHandler = (fn: () => Promise<void>) => {
  exitHandler = fn;
};

const doExit = () => {
  if (exitHandler) {
    exitHandler()
      .then(() => process.exit(0))
      .catch((err) => {
        log("Exit handler error", { err });
        // allows log buffer to flush
        setTimeout(() => {
          process.exit(1);
        }, 200);
      });
  } else {
    // allows log buffer to flush
    setTimeout(() => {
      process.exit(0);
    }, 200);
  }
};

for (let exitSignal of ["SIGINT", "SIGUSR1", "SIGUSR2", "SIGTERM", "SIGHUP"]) {
  process.on(exitSignal, () => {
    log(`caught exit signal ${exitSignal}`);
    doExit();
  });
}

process.on("uncaughtException", (err) => {
  logStderr("uncaughtException", { err });
  doExit();
});

process.on("unhandledRejection", (reason, promise) => {
  logStderr("Unhandled Rejection at:", { promise, reason });
});
