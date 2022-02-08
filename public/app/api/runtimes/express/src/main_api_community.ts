import {
  registerEmailTransporter,
  getCommunityTransporter,
} from "./../../../shared/src/email";
import { getCommunityLicense } from "../../../community/src/community_license";
if (process.env.NODE_ENV !== "production") {
  const path = require("path");
  const dotenv = require("dotenv");
  dotenv.config();
  dotenv.config({ path: path.resolve(process.cwd(), ".community.env") });
}

import { log } from "@core/lib/utils/logger";
import { registerVerifyLicenseFn } from "../../../shared/src/auth";
import startup from "./startup";
import { registerSocketServer } from "../../../shared/src/handler";
import socketServer from "./socket";
import { ensureEnv } from "./../../../shared/src/env";

ensureEnv("COMMUNITY_AUTH_HASH", "SMTP_TRANSPORT_JSON");

log("EnvKey API Community Edition is starting...");

const injectHandlers = () => {
  require("../../../community/src/api_handlers");
};

startup(injectHandlers, async (port: number) => {
  registerVerifyLicenseFn(getCommunityLicense);
  registerEmailTransporter(getCommunityTransporter());
  socketServer.start();
  registerSocketServer(socketServer);
})
  .then(() => {
    log("EnvKey API Community Edition has started!");
  })
  .catch((err) => {
    log("Initialization error:", { err });
    throw err;
  });
