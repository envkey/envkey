import { env } from "../../../shared/src/env";
import { Api, Auth } from "@core/types";
import { handleAction } from "../../../shared/src/handler";
import * as express from "express";
import { errorFallbackMiddleware, getErrorHandler } from "./errors";
import { extractIpHost, okResult } from "./routes/route_helpers";

import { bindFetchRoutes } from "./routes/fetch_routes";
import { log } from "@core/lib/utils/logger";

export const health: express.RequestHandler<{}, Api.Net.OkResult> = (
  req,
  res
) => {
  res.status(200);
  res.send(okResult);
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
      res
        .status(
          "error" in result && result.error
            ? (result as { errorStatus?: number }).errorStatus ?? 500
            : 200
        )
        .send(result);
    })
    .catch(getErrorHandler(res));
};

// export const oauthCallback =
//   (
//     provider: Auth.OauthProviderType
//   ): express.RequestHandler<
//     {},
//     Api.Net.ApiResultTypes["OauthCallback"],
//     Api.Net.OauthCallbackQueryParams
//   > =>
//   (req, res) => {
//     const { ip, host } = extractIpHost(req);
//     handleAction(
//       {
//         type: Api.ActionType.OAUTH_CALLBACK,
//         meta: {
//           loggableType: "hostAction",
//         },
//         payload: {
//           ...(req.query as Api.Net.OauthCallbackQueryParams),
//           provider,
//         },
//       },
//       {
//         ip,
//         host,
//         method: <const>"get",
//       }
//     )
//       .then((result) => {
//         res.status(200).send(result as Api.Net.ApiResultTypes["OauthCallback"]);
//       })
//       .catch(getErrorHandler(res));
//   };

export default (app: express.Application) => {
  app.disable("x-powered-by");

  app.get("/health", health);
  app.get("/", (req, res) => res.end("API OK"));

  app.use((req, res, next) => {
    log("REQUEST: " + req.path);
    next();
  });

  app.post("/action", action);

  bindFetchRoutes(app);

  app.use(errorFallbackMiddleware);
};
