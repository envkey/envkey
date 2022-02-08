import * as R from "ramda";
import path from "path";
import fs from "fs";
import { Client } from "@core/types";
import { dispatch, getState } from "./test_helper";

export const testExport = async (
  accountId: string,
  params: {
    envParentId: string;
    environmentId: string;
    includeAncestors?: true;
    pending?: true;
  },
  shouldEq: Client.Env.RawEnv
) => {
  let state = getState(accountId);
  if (!state.envsFetchedAt[params.environmentId]) {
    await dispatch(
      {
        type: Client.ActionType.FETCH_ENVS,
        payload: {
          byEnvParentId: {
            [params.envParentId]: { envs: true },
          },
        },
      },
      accountId
    );
  }

  const filePath = path.join(
    process.cwd(),
    `${params.environmentId}-export.json`
  );

  await dispatch(
    {
      type: Client.ActionType.EXPORT_ENVIRONMENT,
      payload: { ...params, format: "json", filePath },
    },
    accountId
  );

  let data: Client.Env.RawEnv;
  try {
    data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    fs.unlinkSync(filePath); // delete file
    throw err;
  }

  fs.unlinkSync(filePath); // delete file

  expect(data).toEqual(shouldEq);
};
