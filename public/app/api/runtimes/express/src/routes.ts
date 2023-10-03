import { Api } from "@core/types";
import { handleAction } from "../../../shared/src/handler";
import * as express from "express";
import { errorFallbackMiddleware, getErrorHandler } from "./errors";
import { extractIpHost, okResult } from "./routes/route_helpers";
import { bindFetchRoutes } from "./routes/fetch_routes";
import { log } from "@core/lib/utils/logger";
import { getNewTransactionConn, getDb } from "../../../shared/src/db";

export const health: express.RequestHandler<
  {},
  Api.Net.OkResult | Api.Net.ErrorResult
> = async (req, res) => {
  res.status(200);
  res.send(okResult);
};

const DB_TIMEOUT = 3000;
export const dbHealth: express.RequestHandler<
  {},
  Api.Net.OkResult | Api.Net.ErrorResult
> = async (req, res) => {
  try {
    const txn = await getNewTransactionConn();
    try {
      await Promise.race([
        getDb(
          { pkey: "test", skey: "test" },
          {
            transactionConn: txn,
          }
        ),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Database operation timed out")),
            DB_TIMEOUT
          )
        ),
      ]);

      res.status(200);
      res.send(okResult);
    } catch (err) {
      if (err.message === "Database operation timed out") {
        res.status(408); // 408 Request Timeout status code
      } else {
        res.status(500);
      }
      res.send({
        type: "error",
        error: true,
        errorStatus: res.statusCode,
        errorReason: "dbError",
      });
    } finally {
      await txn.release();
    }
  } catch (err) {
    res.status(500);
    res.send({
      type: "error",
      error: true,
      errorStatus: 500,
      errorReason: "dbError",
    });
  }
};

export const action: express.RequestHandler<
  any,
  Api.Net.ApiResult,
  Api.Action.RequestAction | Api.Action.BulkGraphAction
> = (req, res) => {
  const { ip, host } = extractIpHost(req);

  handleAction(req.body, {
    ip,
    host,
    method: <const>"post",
  })
    .then((result) => {
      let status: number;

      if ("error" in result && result.error) {
        status = (result as { errorStatus?: number }).errorStatus ?? 500;
      } else if (result.type == "notModified") {
        status = 304;
      } else {
        status = 200;
      }

      res.status(status).send(result);
    })
    .catch(getErrorHandler(res));
};

export default (app: express.Application) => {
  app.disable("x-powered-by");

  app.get("/health", health);
  app.get("/db-health", dbHealth);
  app.get("/", (req, res) => res.end("API OK"));

  app.use((req, res, next) => {
    log("REQUEST: " + req.path);
    next();
  });

  app.post("/action", action);

  bindFetchRoutes(app);

  app.use(errorFallbackMiddleware);
};
