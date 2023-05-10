import type * as Keytar from "keytar";
import { log } from "../utils/logger";
import Conf from "conf";
import {
  encryptSymmetricWithPassphrase,
  decryptSymmetricWithPassphrase,
  encryptSymmetricWithKey,
} from "../crypto/inline";
import { secureRandomAlphanumeric } from "../crypto/utils";
import { decodeUTF8, encodeBase64 } from "tweetnacl-util";
import { Crypto, Client } from "../../types";
import * as R from "ramda";
import * as os from "os";

const needsKeytar = ["darwin", "win32"].includes(os.platform());

declare const __non_webpack_require__:
  | ((arg0: string) => typeof Keytar)
  | undefined;

// uses node-keytar to store sensitive data in the os keychain when one is available
// - keychain on mac
// - credential manager on windows
// - libsecret is available on Linux, but the behavior was flaky across distros during testing,
//   so it has been disabled below.
// keytar is added next to the cli.js bundle inside pkg, or in extraResources in an electron.
// This key_store.ts file is implicitly imported by anything referencing @core, so we put
// this in a getter using try/catch.
let _keytar: typeof Keytar;
const getKeytar: () => typeof Keytar = () => {
  if (_keytar) {
    return _keytar;
  }

  // electron and CLI
  if (typeof __non_webpack_require__ !== "undefined") {
    maybeLog("CLI inside `pkg`");
    // this one is first for a little faster CLI commands
    if (process.env.ENVKEY_CLI_BUILD_VERSION) {
      try {
        maybeLog("loading keytar from ./envkey-keytar.node");
        _keytar = __non_webpack_require__("./envkey-keytar.node"); // deployed to the same folder
        maybeLog("keytar was loaded");
        return _keytar;
      } catch (loadErr) {
        maybeLog("did not load keytar", {
          loadErr,
        });
      }
    }
    if (process.env.IS_ELECTRON) {
      // electron
      try {
        maybeLog("loading keytar from __non_webpack_require__('keytar')");
        _keytar = __non_webpack_require__("keytar");
        maybeLog("loaded keytar from __non_webpack_require__('keytar')");
        return _keytar;
      } catch (loadErr) {
        maybeLog("did not load non-webpack keytar from 'keytar'", {
          loadErr: loadErr.message,
        });
      }
    }
  }
  // local dev, probably
  try {
    maybeLog("loading keytar from require('keytar')");
    _keytar = require("keytar");
    maybeLog("keytar was loaded from require('keytar')");
    return _keytar;
  } catch (loadErr) {
    maybeLog("did not load keytar from require('keytar')", {
      loadErr: loadErr.message,
    });
  }

  throw new Error("keytar unavailable to key_store");
};

type DeviceKey = { auth: string } & (
  | { key: string }
  | { encryptedKey: Crypto.PassphraseEncryptedData }
  | { key: string; encryptedKey: Crypto.PassphraseEncryptedData }
);

const SERVICE_NAME = "com.envkey.local-server.root-device-key",
  DEVICE_KEY = "root-device-key";

export const initKeyStore = async () => {
    await resolveLocked();
  },
  initDeviceKey = async (passphrase?: string) => {
    maybeLog("Initializing root device key...");

    // if we're replacing an existing device key, keep the same auth key
    // for authenticating requests
    const existingDeviceKey = await getDeviceKey(),
      auth = existingDeviceKey
        ? existingDeviceKey.auth
        : secureRandomAlphanumeric(22),
      key = secureRandomAlphanumeric(22);

    let deviceKey: DeviceKey;
    if (passphrase) {
      const encryptedKey = await encryptSymmetricWithPassphrase({
        data: key,
        passphrase,
      });
      deviceKey = { auth, encryptedKey, key };
    } else {
      deviceKey = { auth, key };
    }

    await setDeviceKey(deviceKey);
    locked = false;
    maybeLog("Initialized root device key.");
    return deviceKey;
  },
  getDeviceKey = () => getKey(DEVICE_KEY) as Promise<DeviceKey | null>,
  hasDeviceKey = () => getKey(DEVICE_KEY).then(Boolean),
  isLocked = () => locked,
  unlock = async (passphrase: string) => {
    maybeLog("Unlocking device...");
    let deviceKey = await getDeviceKey();
    if (!deviceKey) {
      throw new Error("Device key not found.");
    }

    if ("key" in deviceKey && deviceKey.key) {
      maybeLog("Device already unlocked.");
      return deviceKey;
    } else if ("encryptedKey" in deviceKey && deviceKey.encryptedKey) {
      const key = await decryptSymmetricWithPassphrase({
        encrypted: deviceKey.encryptedKey,
        passphrase,
      });
      if (!key) {
        throw new Error("Decryption failed");
      }

      deviceKey = { ...deviceKey, key };
      await setDeviceKey(deviceKey);
      locked = false;
      maybeLog("Unlocked device.");
      return deviceKey;
    }
  },
  lock = async () => {
    maybeLog("Locking out device...");
    const deviceKey = await getDeviceKey();
    if (!deviceKey) {
      throw new Error("Device key not found.");
    }

    if (!("key" in deviceKey)) {
      maybeLog("Device already locked.");
      return;
    }

    if ("encryptedKey" in deviceKey) {
      await setDeviceKey(R.omit(["key"], deviceKey));
      locked = true;
      maybeLog("Device locked.");
    } else {
      maybeLog("keyStore - Can't lock device that has no passphrase set.");
    }
  },
  getCoreProcAuthToken = async () => {
    if (encryptedAuthToken) {
      return encryptedAuthToken;
    } else if (encryptedAuthTokenPromise) {
      await encryptedAuthTokenPromise;
      return encryptedAuthToken!;
    }

    const deviceKey = await getDeviceKey();
    if (!deviceKey || !("auth" in deviceKey) || !deviceKey.auth) {
      throw new Error("Invalid device key");
    }

    const encrypted = encryptSymmetricWithKey({
      data: Client.CORE_PROC_AUTH_TOKEN,
      encryptionKey: deviceKey.auth,
    });

    encryptedAuthToken = encodeBase64(decodeUTF8(JSON.stringify(encrypted)));

    return encryptedAuthToken!;
  },
  enableLogging = () => (loggingEnabled = true);

let loggingEnabled =
    Boolean(process.env.IS_ELECTRON) || Boolean(process.env.ENVKEY_DEBUG),
  fallback: Conf | undefined,
  cache: Record<string, string | {} | null> = {},
  promiseCache: Record<string, Promise<string | {} | null>> = {},
  locked = false,
  encryptedAuthToken: string | undefined,
  encryptedAuthTokenPromise: Promise<string> | undefined;

const maybeLog = (msg: string, data?: object) => {
    if (loggingEnabled) {
      log(msg, data);
    }
  },
  setDeviceKey = (deviceKey: DeviceKey) => {
    return putKey(DEVICE_KEY, deviceKey);
  },
  resolveLocked = async () => {
    const deviceKey = await getDeviceKey();
    if (!deviceKey) {
      throw new Error("Device key not found.");
    }
    locked = Boolean("encryptedKey" in deviceKey && !("key" in deviceKey));
  },
  fallbackStore = () => {
    // conf for file system fallback - stored in platform config dir
    if (!fallback) {
      fallback = new Conf({
        // 👇 conf encryption key is not set for security purposes, just ensures integrity of config file (plus a little obscurity)
        encryptionKey: "7d359d90209b490b9771c3658543a06d",
        configName: "envkey-keystore-fallback",
        // necessary because package.json is normally used, but discarded during executable packaging.
        // also Conf internals would use file paths that don't work with `vercel/pkg`
        projectName: "envkey",
        projectSuffix: "",
      });
      maybeLog("Fallback store initialized.", { path: fallback.path });
    }
    return fallback;
  },
  putKey = async (k: string, v: string | {}) => {
    if (cache[k] && cache[k] === v) {
      return;
    }
    cache[k] = v;

    if (needsKeytar) {
      maybeLog(`Setting ${k} in OS credential store...`);
      await getKeytar().setPassword(SERVICE_NAME, k, JSON.stringify(v));
    } else {
      maybeLog(`Setting ${k} in file store...`);
      fallbackStore().set(k, v);
    }

    maybeLog(`${k} set.`);
  },
  deleteKey = async (k: string) => {
    if (needsKeytar) {
      return getKeytar().deletePassword(SERVICE_NAME, k);
    }
    return fallbackStore().delete(k);
  },
  getKey = async (k: string) => {
    if (promiseCache[k]) {
      return promiseCache[k];
    }
    if (cache[k]) {
      return cache[k];
    }

    if (needsKeytar) {
      maybeLog(`Fetching ${k} from OS credential store...`);
      promiseCache[k] = getKeytar()
        .getPassword(SERVICE_NAME, k)
        .then((v) => (v ? JSON.parse(v) : v));
      cache[k] = await promiseCache[k];
      delete promiseCache[k];
    } else {
      maybeLog(`Fetching ${k} from file store...`);
      cache[k] = (fallbackStore().get(k) ?? null) as {} | null;
    }

    maybeLog(cache[k] ? `Fetched ${k}.` : `${k} is null.`);
    return cache[k];
  };
