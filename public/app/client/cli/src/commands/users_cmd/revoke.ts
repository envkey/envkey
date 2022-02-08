import { exit } from "../../lib/process";
import { Argv } from "yargs";
import { dispatch, initCore } from "../../lib/core";
import { BaseArgs } from "../../types";
import { authz } from "@core/lib/graph";
import { Api, Model } from "@core/types";
import chalk from "chalk";
import { logAndExitIfActionFailed } from "../../lib/args";
import { getPrompt } from "../../lib/console_io";
import { tryApplyDetectedAppOverride } from "../../app_detection";

export const command = ["revoke-invite"];
export const desc = "Revoke a pending invite.";
export const builder = (yargs: Argv<BaseArgs>) => yargs;
export const handler = async (argv: BaseArgs): Promise<void> => {
  const prompt = getPrompt();
  const { state, auth } = await initCore(argv, true);
  // override account from ENVKEY
  if (tryApplyDetectedAppOverride(auth.userId, argv)) {
    return handler(argv);
  }

  const revokableInvites = authz
    .getRevokableInvites(state.graph, auth.userId, Date.now())
    .map((i) => {
      const user = state.graph[i.inviteeId]! as Model.OrgUser;
      return {
        name: i.id,
        message: `${chalk.bold(user.email)} - ${user.firstName} ${
          user.lastName
        }`,
      };
    });
  if (!revokableInvites.length) {
    return exit(1, "There are no revokable invites available.");
  }

  const { inviteId } = await prompt<{ inviteId: string }>({
    type: "autocomplete",
    name: "inviteId",
    message: "Select invited user:",
    choices: revokableInvites,
  });

  const res = await dispatch({
    type: Api.ActionType.REVOKE_INVITE,
    payload: {
      id: inviteId,
    },
  });
  await logAndExitIfActionFailed(res, "Failed revoking the invite.");

  console.log(chalk.bold("The invite was revoked."));

  return exit();
};
