import { clientAction } from "../handler";
import { Client } from "@core/types";

clientAction<Client.Action.ClientActions["NetworkUnreachable"]>({
  type: "clientAction",
  actionType: Client.ActionType.NETWORK_UNREACHABLE,
  procStateProducer: (draft) => {
    draft.networkUnreachable = true;
  },
});

clientAction<Client.Action.ClientActions["NetworkReachable"]>({
  type: "clientAction",
  actionType: Client.ActionType.NETWORK_REACHABLE,
  procStateProducer: (draft) => {
    delete draft.networkUnreachable;
  },
});
