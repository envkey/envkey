import { log, logStderr } from "@core/lib/utils/logger";
import { ensureEnv, env } from "../../../shared/src/env";
import express from "express";
import initRoutes from "./routes";
import bodyParser from "body-parser";
import { runMigrationsIfNeeded } from "./migrate";
import { resolveMaxPacketSize } from "../../../shared/src/db";

process.on("uncaughtException", (err) => {
  logStderr("uncaughtException", { err });
  // flush that log buffer before suicide
  setTimeout(() => {
    process.exit(1);
  }, 200);
});

process.on("unhandledRejection", (reason, promise) => {
  logStderr("Unhandled Rejection at:", { promise, reason });
});

ensureEnv();

require("../../../shared/src/api_handlers");
require("../../../shared/src/fetch_handlers");

const app = express();
const port = env.EXPRESS_PORT ? parseInt(env.EXPRESS_PORT) : 3000;

app.use(bodyParser.json({ limit: "200mb" }));

export default (
  injectHandlers: (app: express.Application) => void,
  afterDbCallback?: (port: number) => Promise<void>
) => {
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
