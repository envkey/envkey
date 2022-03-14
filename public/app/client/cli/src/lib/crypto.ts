import chalk from "chalk";
import { validatePassphrase } from "@core/lib/crypto/utils";
import { dispatch } from "./core";
import { Client, Model } from "@core/types";
import { logAndExitIfActionFailed } from "./args";
import { exit } from "./process";
import { getPrompt } from "./console_io";

export const OPTIONAL_PASSPHRASE_MSG = `Set a device passphrase (${chalk.bold(
    "optional"
  )}--min 10 characters, enter to skip):`,
  promptPassphrase = async <IsRequired extends boolean>(
    promptMessage: string,
    required?: IsRequired,
    isNewPassphrase?: true
  ) => {
    const prompt = getPrompt();
    const { passphrase } = await prompt<{
      passphrase: string;
    }>({
      type: "password",
      name: "passphrase",
      message: promptMessage,
      validate: (val) => {
        if (!isNewPassphrase || (!required && !val)) {
          return true;
        }
        return validatePassphrase(val);
      },
    });

    if (isNewPassphrase && passphrase) {
      await prompt({
        type: "password",
        name: "confirm",
        message: "Confirm passphrase:",
        validate: (val) => val === passphrase || "Confirmation doesn't match.",
      });
    }

    return (passphrase || undefined) as IsRequired extends true
      ? string
      : string | undefined;
  },
  promptLockout = async <IsRequired extends boolean>(required?: IsRequired) => {
    const prompt = getPrompt();
    let shouldLockout: boolean, lockoutMs: number | undefined;
    if (!required) {
      shouldLockout = (
        await prompt<{ shouldLockout: boolean }>({
          type: "confirm",
          name: "shouldLockout",
          message: "Set an inactivity lockout? (optional)",
        })
      ).shouldLockout;
    } else {
      shouldLockout = true;
    }

    if (shouldLockout) {
      const minutes = (
        await prompt<{ minutes: number }>({
          type: "numeral",
          name: "minutes",
          initial: 120,
          min: 1,
          float: false,
          required: true,
          message: "Minutes of inactivity before lockout:",
        })
      ).minutes;

      lockoutMs = minutes * 60 * 1000;
    }

    return lockoutMs as IsRequired extends true ? number : number | undefined;
  },
  promptDeviceSecurityOptions = async <
    PassphraseShouldPrompt extends boolean,
    PassphraseRequired extends PassphraseShouldPrompt extends true
      ? boolean
      : false,
    LockoutShouldPrompt extends boolean,
    LockoutRequired extends LockoutShouldPrompt extends true ? boolean : false
  >(params: {
    shouldPromptPassphrase: PassphraseShouldPrompt;
    passphraseRequired: PassphraseRequired;
    shouldPromptLockout: LockoutShouldPrompt;
    lockoutRequired: LockoutRequired;
    maxLockout: LockoutRequired extends true ? number : undefined;
  }) => {
    const prompt = getPrompt();
    const {
      shouldPromptPassphrase,
      passphraseRequired,
      shouldPromptLockout,
      lockoutRequired,
      maxLockout,
    } = params;

    let passphrase: string | undefined, lockoutMs: number | undefined;

    if (shouldPromptPassphrase) {
      passphrase = await promptPassphrase(
        passphraseRequired
          ? `Set a device passphrase (${chalk.bold(
              "required"
            )} by org--min 10 characters):`
          : OPTIONAL_PASSPHRASE_MSG,
        passphraseRequired,
        true
      );
    }

    if (lockoutRequired || (passphrase && shouldPromptLockout)) {
      const shouldLockout =
        lockoutRequired ||
        (
          await prompt<{ shouldLockout: boolean }>({
            type: "confirm",
            name: "shouldLockout",
            message: "Set an inactivity lockout?",
          })
        ).shouldLockout;

      if (shouldLockout) {
        const maxLockoutMinutes =
          typeof maxLockout == "number" ? maxLockout / 1000 / 60 : undefined;

        const getLockoutMinutes = async () => {
          return (
            await prompt<{ minutes: number }>({
              type: "numeral",
              name: "minutes",
              initial: maxLockoutMinutes ?? 120,
              min: 1,
              max:
                typeof maxLockout == "number"
                  ? maxLockout / 1000 / 60
                  : undefined,
              float: false,
              required: true,
              message: `Minutes of inactivity before lockout${
                lockoutRequired ? " (" + chalk.bold("required") + " by org" : ""
              }${
                maxLockoutMinutes ? "--max " + maxLockoutMinutes.toString() : ""
              }${lockoutRequired ? ")" : ""}:`,
            })
          ).minutes;
        };

        let minutes = await getLockoutMinutes();

        while (maxLockoutMinutes && minutes > maxLockoutMinutes) {
          console.log(
            chalk.bold(
              chalk.red(
                `Max lockout allowed by org is ${maxLockoutMinutes} minutes.`
              )
            )
          );
          minutes = await getLockoutMinutes();
        }

        lockoutMs = minutes * 60 * 1000;
      }
    }

    return { passphrase, lockoutMs } as {
      passphrase: PassphraseShouldPrompt extends true
        ? PassphraseRequired extends true
          ? string
          : string | undefined
        : undefined;
      lockoutMs: LockoutShouldPrompt extends true
        ? LockoutRequired extends true
          ? number
          : number | undefined
        : undefined;
    };
  },
  enforceDeviceSecuritySettings = async (
    initialState: Client.State,
    loadedOrg: Model.Org
  ) => {
    let passphrase: string | undefined, lockoutMs: number | undefined;
    const orgRequiresPassphrase = loadedOrg.settings.crypto.requiresPassphrase,
      orgRequiresLockout = loadedOrg.settings.crypto.requiresLockout,
      orgMaxLockout = loadedOrg.settings.crypto.lockoutMs,
      passphraseRequired = Boolean(
        orgRequiresPassphrase && !initialState.requiresPassphrase
      ),
      lockoutRequired = Boolean(
        (orgRequiresLockout && !initialState.lockoutMs) ||
          (orgRequiresLockout &&
            orgMaxLockout &&
            initialState.lockoutMs! > orgMaxLockout)
      ),
      shouldPromptPassphrase = passphraseRequired,
      shouldPromptLockout = lockoutRequired;

    if (shouldPromptPassphrase || shouldPromptLockout) {
      let msg = "This org requires a passphrase";
      if (shouldPromptLockout && orgMaxLockout) {
        msg += ` and a lockout of ${Math.floor(
          orgMaxLockout / 1000 / 60
        )} minutes or less`;
      }
      msg += ".";
      console.log(chalk.bold(msg));

      ({ passphrase, lockoutMs } = await promptDeviceSecurityOptions({
        shouldPromptPassphrase,
        passphraseRequired,
        shouldPromptLockout,
        lockoutRequired,
        maxLockout: orgMaxLockout,
      }));
    }

    if (passphrase) {
      await dispatch({
        type: Client.ActionType.SET_DEVICE_PASSPHRASE,
        payload: { passphrase },
      });
    }

    if (lockoutMs) {
      await dispatch({
        type: Client.ActionType.SET_DEVICE_LOCKOUT,
        payload: { lockoutMs },
      });
    }
  },
  unlock = async () => {
    const passphrase = await promptPassphrase(
      "EnvKey is locked. Enter this device's passphrase to unlock:",
      true
    );

    const res = await dispatch({
      type: Client.ActionType.UNLOCK_DEVICE,
      payload: { passphrase },
    });

    if (res.status == 403) {
      console.log(
        chalk.bold("Forgot passphrase?"),
        "Use",
        chalk.bold("envkey accounts recover"),
        "for recovery options."
      );
      return exit(1, chalk.bold("Invalid passphrase."));
    }

    await logAndExitIfActionFailed(
      res,
      "There was a problem unlocking EnvKey."
    );

    return res.state;
  };
