import { Client, Api } from "@core/types";
import * as R from "ramda";
import { stripEmptyRecursive } from "@core/lib/utils/object";

export const statusProducers = (
    statusKey: keyof Client.State,
    errorKey: keyof Client.State
  ): Pick<
    Client.AsyncActionMethods<Client.Action.EnvkeyAction>,
    "failureStateProducer" | "endStateProducer"
  > & {
    stateProducer: Client.StateProducer<Client.Action.EnvkeyAction>;
  } => ({
    stateProducer: (draft) => {
      (draft[statusKey] as any) = true;
      delete draft[errorKey];
    },
    failureStateProducer: (draft, { payload }) => {
      (draft[errorKey] as any) = payload;
    },
    endStateProducer: (draft) => {
      delete draft[statusKey];
    },
  }),
  objectStatusProducers = (
    statusKey: keyof Client.State,
    errorKey: keyof Client.State
  ): Pick<
    Client.AsyncActionMethods<
      Client.Action.EnvkeyAction & { payload: { id: string } }
    >,
    "failureStateProducer" | "endStateProducer"
  > & {
    stateProducer: Client.StateProducer<
      Client.Action.EnvkeyAction & { payload: { id: string } }
    >;
  } => ({
    stateProducer: (draft, { type, payload: { id } }) => {
      (draft[statusKey] as any)[id] = true;
      delete (draft[errorKey] as any)[id];
    },
    failureStateProducer: (
      draft,
      {
        meta: {
          rootAction: {
            payload: { id },
          },
        },
        payload,
      }
    ) => {
      (draft[errorKey] as any)[id] = payload;
    },
    endStateProducer: (
      draft,
      {
        meta: {
          rootAction: {
            payload: { id },
          },
        },
      }
    ) => {
      delete (draft[statusKey] as any)[id];
    },
  }),
  reorderStatusProducers = (
    reorderType:
      | "appBlock"
      | "appBlockGroup"
      | "appGroupBlock"
      | "appGroupBlockGroup"
      | "groupMembership"
  ): Pick<
    Client.ApiActionParams<
      Api.Action.RequestAction & {
        payload: (
          | { appId: string }
          | { appGroupId: string }
          | { blockGroupId: string }
        ) & {
          order: Api.Net.OrderIndexById;
        };
      }
    >,
    "stateProducer" | "failureStateProducer" | "endStateProducer"
  > => ({
    stateProducer: (draft, { payload }) => {
      const id = (("appId" in payload && payload.appId) ||
        ("appGroupId" in payload && payload.appGroupId) ||
        ("blockGroupId" in payload && payload.blockGroupId)) as string;

      draft.isReorderingAssociations = R.assocPath(
        [id, reorderType],
        true,
        draft.isReorderingAssociations
      );

      draft.reorderAssociationsErrors = stripEmptyRecursive(
        R.dissocPath([id, reorderType], draft.reorderAssociationsErrors)
      );
    },
    failureStateProducer: (
      draft,
      {
        meta: {
          rootAction: { payload: rootPayload },
        },
        payload,
      }
    ) => {
      const id = (("appId" in rootPayload && rootPayload.appId) ||
        ("appGroupId" in rootPayload && rootPayload.appGroupId) ||
        ("blockGroupId" in rootPayload && rootPayload.blockGroupId)) as string;
      draft.reorderAssociationsErrors = R.assocPath(
        [id, reorderType],
        payload,
        draft.reorderAssociationsErrors
      );
    },
    endStateProducer: (
      draft,
      {
        meta: {
          rootAction: { payload: rootPayload },
        },
      }
    ) => {
      const id = (("appId" in rootPayload && rootPayload.appId) ||
        ("appGroupId" in rootPayload && rootPayload.appGroupId) ||
        ("blockGroupId" in rootPayload && rootPayload.blockGroupId)) as string;
      draft.isReorderingAssociations = stripEmptyRecursive(
        R.dissocPath([id, reorderType], draft.isReorderingAssociations)
      );
    },
  }),
  removeObjectProducers = objectStatusProducers("isRemoving", "removeErrors"),
  renameObjectProducers = objectStatusProducers("isRenaming", "renameErrors"),
  updateSettingsProducers = objectStatusProducers(
    "isUpdatingSettings",
    "updateSettingsErrors"
  ),
  updateFirewallProducers = objectStatusProducers(
    "isUpdatingFirewall",
    "updateFirewallErrors"
  ),
  updateObjectProducers = objectStatusProducers("isUpdating", "updateErrors");
