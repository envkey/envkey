import Client from "../client";
import Api from "../api";
import { Draft } from "immer";
import * as z from "zod";
import { zodPrimitive } from "../utils";

export namespace Graph {
  export type Graph = Client.Graph.UserGraph | Api.Graph.OrgGraph;
  export type GraphObject =
    | Client.Graph.UserGraphObject
    | Api.Graph.GraphObject;

  export type Indexed<T extends GraphObject> = { [id: string]: T };
  export type MaybeIndexed<T extends GraphObject> = {
    [id: string]: T | undefined;
  };
  export type Grouped<T extends GraphObject> = { [id: string]: T[] };
  export type MaybeGrouped<T extends GraphObject> = {
    [id: string]: T[] | undefined;
  };

  export type Producer<T extends Graph> = (
    graphDraft: Draft<T>
  ) => Draft<T> | void;
}
