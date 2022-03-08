import path from "path";
import { Client } from "@core/types";
import { hostUrl } from "./test_helper";
import { execFileSync } from "child_process";

export const envkeyFetch = async (
  envkeyIdPart: string,
  encryptionKey: string
) => {
  const envkey = [envkeyIdPart, encryptionKey, hostUrl].join("-");

  const res = execFileSync(
    path.join(process.cwd(), "envkey-source"),
    ["--json"],
    { env: { ENVKEY: envkey } }
  ).toString();
  expect(res).toBeString();
  const vars = JSON.parse(res.trim()) as Client.Env.RawEnv;
  expect(vars).toBeObject();
  return vars;
};
