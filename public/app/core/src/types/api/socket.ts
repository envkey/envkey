import { default as ActionType } from "./action_type";

export type ClearUserSocketParams =
  | {
      orgId: string;
    }
  | {
      orgId: string;
      userId: string;
    }
  | {
      orgId: string;
      userId: string;
      deviceId: string;
    };

export type ClearEnvkeySocketParams =
  | {
      orgId: string;
    }
  | {
      orgId: string;
      generatedEnvkeyId: string;
    };

export type OrgSocketUpdateMessage = {
  actorId?: string;
} & (
  | {
      otherUpdateReason?: undefined;
      actionTypes: ActionType[];
      meta?: undefined;
    }
  | {
      otherUpdateReason: "upgrade_success" | "upgrade_failed";
      actionTypes: [];
      meta: {
        apiVersion: string;
        infraVersion: string;
      };
    }
);

export type OrgSocketBroadcastFn = (
  orgId: string,
  msg: OrgSocketUpdateMessage,
  skipDeviceId?: string,
  scope?: {
    userIds?: string[];
    deviceIds?: string[];
  }
) => void;

export type EnvkeySocketBroadcastFn = (
  orgId: string,
  generatedEnvkeyId: string
) => void;

export interface SocketServer {
  start: () => void;

  sendOrgUpdate: OrgSocketBroadcastFn;

  sendEnvkeyUpdate: EnvkeySocketBroadcastFn;

  clearOrgSockets: (
    orgId: string,
    clearActive: boolean,
    noReconnect: boolean
  ) => Promise<void>;

  clearUserSockets: (
    orgId: string,
    userId: string,
    clearActive: boolean,
    noReconnect: boolean
  ) => Promise<void>;

  clearDeviceSocket: (
    orgId: string,
    userId: string,
    deviceId: string,
    clearActive: boolean,
    noReconnect: boolean
  ) => Promise<void>;

  clearOrgEnvkeySockets: (
    orgId: string,
    clearActive: boolean,
    noReconnect: boolean
  ) => Promise<void>;

  clearEnvkeySockets: (
    orgId: string,
    generatedEnvkeyId: string,
    clearActive: boolean,
    noReconnect: boolean
  ) => Promise<void>;
}
