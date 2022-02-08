import { clientAction } from "../handler";
import { Client } from "@core/types";
import { rawEnvToTxt } from "@core/lib/parse";
import { getRawEnvWithAncestors, getRawEnv } from "@core/lib/client";
import fs from "fs";

clientAction<Client.Action.ClientActions["ExportEnvironment"]>({
  type: "clientAction",
  actionType: Client.ActionType.EXPORT_ENVIRONMENT,
  handler: async (
    state,
    {
      payload: {
        envParentId,
        environmentId,
        format,
        includeAncestors,
        pending,
        filePath,
      },
    }
  ) => {
    const rawEnvFn = includeAncestors ? getRawEnvWithAncestors : getRawEnv,
      rawEnv = rawEnvFn(state, { envParentId, environmentId }, pending),
      txt = rawEnvToTxt(rawEnv, format);

    // write the file
    return new Promise<void>((resolve, reject) =>
      fs.writeFile(filePath, txt, (err) => {
        if (err) {
          return reject(err);
        }
        resolve();
      })
    );
  },
});
