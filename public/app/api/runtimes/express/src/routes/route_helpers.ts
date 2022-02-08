import * as express from "express";
import {Api} from "@core/types";

export const okResult: Api.Net.OkResult = { type: "success" };

export const plainHtmlPage = (body: string): string => `<html lang="en"><body>
    <style type="text/css">html,body{margin:0;padding: 34px;font-family: "Arial Narrow",sans-serif;background-color:#4C4C4C;color:white;text-align:center;}</style>
    ${body}
    </body></html>`;

export const extractIpHost = (
  req: express.Request
): { ip: string; host: string } => {
  const ip = (req.headers["x-forwarded-for"] as string) || req.ip;

  // `Host:` header is required by HTTP 1.1, and may include port.
  // Extreme edge case: multiple host headers.
  // express 4.x `req.host` strips port (a bug fixed in express 5.x)
  // We use the host encoded in some tokens.
  // In most cases, the value will be a normal host like: api-v2.envkey.com or subdomain.example.com.
  // In the event of an nonstandard port, it would be like: localhost:3000 or localdev.envkey.com.
  let cleanHost = (Array.isArray(req.get("host"))
    ? req.get("host")![0]
    : req.get("host")) as string;
  const hostMaybeTwoParts = cleanHost.split(":");
  const port = hostMaybeTwoParts[1];
  if (port && ["80", "443"].includes(port)) {
    cleanHost = hostMaybeTwoParts[0]; // no port needed for standard production ports
  }

  return { ip, host: cleanHost };
};

// extracts token from header `Authorization: Bearer <token>`
export const extractBearerToken = (
  req: express.Request
): string | undefined => {
  const authHeader = req.get("authorization");
  if (!authHeader) {
    return undefined;
  }
  const afterBearer = (authHeader.split(/bearer/i)[1] || "").trim();
  return afterBearer ?? authHeader;
};
