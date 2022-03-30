import * as express from "express";
import { Api, Client, Fetch } from "@core/types";
import { extractIpHost } from "./route_helpers";
import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import { env } from "../../../../shared/src/env";
import { handleAction } from "../../../../shared/src/handler";
import { getErrorHandler } from "../errors";
import { pick } from "@core/lib/utils/object";

export const bindFetchRoutes = (app: express.Application): void => {
  app.get("/fetch", fetchRoute);
  app.head("/fetch", fetchRoute);
};

const fetchRoute: express.RequestHandler<
  {},
  Fetch.Result,
  Api.Net.ApiParamTypes["FetchEnvkey"]
> = (req, res) => {
  const query = req.query as Api.Net.ApiParamTypes["FetchEnvkey"] & {
      fetchServiceVersion: string;
      signedSourceIp?: string;
    } & Client.ClientParams,
    method = req.method.toLowerCase() as "head" | "get";

  // quick 404 for plainly invalid envkeyIdPart
  if (
    !query.envkeyIdPart ||
    !query.envkeyIdPart.startsWith("ek") ||
    query.envkeyIdPart.includes("-")
  ) {
    if (method == "head") {
      res.status(404).end();
    } else {
      ((<any>res) as express.Response).status(404).send({
        type: "error",
        error: {
          name: "Not found",
          message: "Not found",
          code: 404,
        },
      });
    }
    return;
  }

  let { ip, host } = extractIpHost(req);

  if (method == "head" && !query.signedSourceIp) {
    res.status(400).send({
      message: "Bad request",
    } as any);
    return;
  }

  if (query.signedSourceIp) {
    if (!env.FAILOVER_SIGNING_PUBKEY) {
      res.status(500).send({
        message: "Server misconfigured or unsupported for failover",
      } as any);
    }
    const verified = nacl.sign.open(
      naclUtil.decodeBase64(query.signedSourceIp),
      naclUtil.decodeBase64(env.FAILOVER_SIGNING_PUBKEY!)
    );

    if (!verified) {
      res.status(400).send({
        message: "Bad request",
      } as any);
      return;
    }

    ip = naclUtil.encodeUTF8(verified);
  }

  handleAction(
    {
      type: Api.ActionType.FETCH_ENVKEY,
      payload: pick(["envkeyIdPart"], query),
      meta: {
        loggableType: "fetchEnvkeyAction",
        client: pick(
          ["clientName", "clientVersion", "clientOs", "clientArch"],
          query
        ),
        fetchServiceVersion: query.fetchServiceVersion,
      },
    },
    {
      ip,
      host,
      method,
    }
  )
    .then((result) => {
      if (method == "head") {
        res.status(200).end();
      } else {
        res.status(200).send(result as Fetch.Result);
      }
    })
    .catch(getErrorHandler(res));
};
