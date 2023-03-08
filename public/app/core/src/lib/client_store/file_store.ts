import { Crypto } from "../../types";
import Conf from "conf";
import { getDeviceKey } from "./key_store";
import {
  encryptSymmetricWithKey,
  decryptSymmetricWithKey,
} from "../crypto/proxy";
import { log } from "../utils/logger";

const fileStore = new Conf({
  configName: "envkey-file-store",
  // The following two additional settings are needed to work around Conf internal usage of
  // file paths which do not play nicely with `vercel/pkg`.
  projectName: "envkey",
  projectSuffix: "",
});

let loggingEnabled = false;

export const put = async (k: string, v: string | {}) => {
    if (loggingEnabled) log(`Comitting ${k} to file store...`);
    const deviceKey = await getDeviceKey();
    if (!deviceKey) {
      // no-op when missing device key
      if (loggingEnabled)
        log(`Couldn't commit ${k}: device key missing. No-op.`);
      return;
    }
    if (!("key" in deviceKey && deviceKey.key)) {
      // no-op when key store is locked
      if (loggingEnabled)
        log(`Couldn't commit ${k}: Device key locked. No-op.`);
      return;
    }

    const encrypted = await encryptSymmetricWithKey({
      data: JSON.stringify(v),
      encryptionKey: deviceKey.key,
    });

    fileStore.set(k, encrypted);

    if (loggingEnabled) log(`${k} encrypted and committed.`);
  },
  get = async (k: string) => {
    if (loggingEnabled) log(`Fetching ${k} from file store...`);
    const deviceKey = await getDeviceKey();

    if (!deviceKey) {
      // no-op when missing device key
      if (loggingEnabled) {
        log(`Couldn't fetch ${k}: device key missing. No-op.`);
      }

      return null;
    }

    if (!("key" in deviceKey && deviceKey.key)) {
      // no-op when key store is locked
      if (loggingEnabled) {
        log(`Couldn't fetch ${k}: device key locked. No-op.`);
      }
      return null;
    }

    const encrypted = fileStore.get(k) as Crypto.PassphraseEncryptedData | null;

    if (!encrypted) {
      if (loggingEnabled) log(`${k} is null.`);
      return null;
    }

    try {
      const decrypted = await decryptSymmetricWithKey({
        encrypted,
        encryptionKey: deviceKey.key,
      });

      if (loggingEnabled) {
        log(`Fetched and decrypted ${k}.`);
      }

      return JSON.parse(decrypted);
    } catch (err) {
      if (loggingEnabled) {
        log(`Error decrypting ${k}.`);
      }
      throw err;
    }
  },
  del = (k: string) => {
    if (loggingEnabled) {
      log(`Deleting ${k} from file store...`);
    }
    fileStore.delete(k);
    if (loggingEnabled) {
      log(`${k} deleted.`);
    }
  },
  enableLogging = () => (loggingEnabled = true);
