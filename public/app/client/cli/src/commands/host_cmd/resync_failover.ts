import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { initCore, dispatch } from "../../lib/core";
import { logAndExitIfActionFailed } from "../../lib/args";
import { BaseArgs } from "../../types";
import { autoModeOut } from "../../lib/console_io";
import { Api } from "@core/types";

export const command = "resync-failover";
export const desc =
  "Resync failover S3 buckets after a database backup restore.";
export const builder = (yargs: Argv<BaseArgs>) => yargs;
export const handler = async (
  argv: BaseArgs & { name: string | undefined; dir?: string }
): Promise<void> => {
  let { state, auth } = await initCore(argv, true, true);

  if (!(auth.hostType == "self-hosted" && auth.deploymentTag)) {
    console.error(
      "This action is only available on EnvKey Enterprise Self-Hosted hosts."
    );
    return exit(1);
  }

  console.log("Resyncing failover...");

  const res = await dispatch({
    type: Api.ActionType.SELF_HOSTED_RESYNC_FAILOVER,
    payload: {},
  });

  await logAndExitIfActionFailed(res, `Resync failed.`);

  if (res.success) {
    console.log("Done.");
    autoModeOut({});
  } else {
  }

  // need to manually exit process since yargs doesn't properly wait for async handlers
  return exit();
};
