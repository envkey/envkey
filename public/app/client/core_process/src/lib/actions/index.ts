import { getDefaultApiHostUrl } from "../../../../shared/src/env";
import got from "got";
import { Api, Client } from "@core/types";
import { log } from "@core/lib/utils/logger";
import { wait } from "@core/lib/utils/wait";

// very unaggressive timeouts
// we want to tolerate slow/weird network conditions, but also not hang too long if server is hopelessly unreachable
const TIMEOUTS = {
  lookup: 1500,
  connect: 5000,
  secureConnect: 5000,
  request: 120 * 1000,
};

export const postApiAction = async <
  ActionType extends
    | Api.Action.RequestAction
    | Api.Action.BulkGraphAction = Api.Action.RequestAction,
  ResponseType extends Api.Net.ApiResult = Api.Net.ApiResult
>(
  action: ActionType,
  // hostname sans protocol
  hostUrlArg?: string,
  ipOverride?: string, // for testing firewall
  numRetry = 0
): Promise<ResponseType> => {
  const start = Date.now();

  const hostUrl = "https://" + (hostUrlArg ?? getDefaultApiHostUrl());
  const actionUrl = hostUrl + "/action";

  if (process.env.LOG_REQUESTS) {
    log(
      `POST action ${action.type} to host: ` +
        hostUrl +
        (numRetry > 0 ? ` | retry ${numRetry}` : ``) +
        ` | ${Buffer.byteLength(JSON.stringify(action))} bytes`
    );
  }

  if (numRetry > 0) {
    const retryBackoff = 2 ** (numRetry - 1);
    if (retryBackoff > 0) {
      await wait(retryBackoff);
    }
  }

  return got
    .post(actionUrl, {
      json: action,
      timeout: TIMEOUTS,
      throwHttpErrors: false,
      ...(ipOverride
        ? {
            headers: {
              "x-forwarded-for": ipOverride,
            },
          }
        : {}),
    })
    .then(async (res) => {
      if (process.env.LOG_REQUESTS) {
        log(
          `RESPONSE to ${action.type} (${hostUrl}): status ${
            res.statusCode
          }, ${Buffer.byteLength(res.rawBody)} bytes, elapsed: ${
            Date.now() - start
          }ms`
        );
      }

      if (res.statusCode >= 400) {
        let fetchErr: Client.FetchError;

        if (
          (res.statusCode == 502 ||
            res.statusCode == 503 ||
            res.statusCode == 504) &&
          numRetry < 6
        ) {
          if (process.env.LOG_REQUESTS) {
            log(
              `ERROR: ${action.type} (${hostUrl}) | ${res.statusCode} error | retrying`
            );

            await wait((numRetry + 1) * 5000);

            return postApiAction(action, hostUrlArg, ipOverride, numRetry + 1);
          }
        }

        try {
          const json = JSON.parse(res.body);
          if (process.env.LOG_REQUESTS) {
            log(`ERROR: ${action.type} (${hostUrl}) | json error`, json);
          }
          fetchErr = json as Client.FetchError;
        } catch (err) {
          if (process.env.LOG_REQUESTS) {
            log(`ERROR: ${action.type} (${hostUrl}) | text error` + res.body);
          }
          fetchErr = {
            type: "error",
            error: {
              message: res.body,
              stack: err.stack,
              code: res.statusCode,
            },
          };
        }
        throw fetchErr;
      }

      if (res.statusCode == 304) {
        return {
          type: "notModified",
          status: 304,
        } as ResponseType;
      }

      return JSON.parse(res.body) as ResponseType;
    });
};
