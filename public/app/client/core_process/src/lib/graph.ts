import { Draft } from "immer";
import { Client, Api } from "@core/types";

export const deleteProposer = (action: { payload: Api.Net.IdParams }) => (
    graphDraft: Draft<Client.Graph.UserGraph>
  ) => {
    delete graphDraft[action.payload.id];
  },
  updateProposer = (action: { payload: Api.Net.IdParams }) => (
    graphDraft: Draft<Client.Graph.UserGraph>
  ) => {
    graphDraft[action.payload.id] = {
      ...graphDraft[action.payload.id],
      ...action.payload,
    } as Client.Graph.UserGraphObject;
  };
