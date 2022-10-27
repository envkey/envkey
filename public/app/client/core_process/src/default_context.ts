import { version } from "../../cli/package.json";
import { Client } from "@core/types";

export const getContext = (
  accountIdOrCliKey?: string,
  store?: Client.ReduxStore,
  localSocketUpdate?: Client.LocalSocketUpdateFn
): Client.Context => ({
  client: {
    clientName: "core",
    clientVersion: version,
  },
  clientId: "core",
  accountIdOrCliKey,
  store,
  localSocketUpdate,
});
