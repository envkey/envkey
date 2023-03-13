import { Action } from "./action";

export namespace Env {
  export type EnvWithMetaCell =
    | {
        val: string;
        inheritsEnvironmentId?: undefined;
        isEmpty?: undefined;
        isUndefined?: undefined;
      }
    | {
        val?: undefined;
        inheritsEnvironmentId: string;
        isEmpty?: undefined;
        isUndefined?: undefined;
      }
    | {
        val: "";
        inheritsEnvironmentId?: undefined;
        isEmpty: true;
        isUndefined?: undefined;
      }
    | {
        val?: undefined;
        inheritsEnvironmentId?: undefined;
        isEmpty?: undefined;
        isUndefined: true;
      };

  export type EnvMetaCell = {
    val?: undefined;
  } & (
    | {
        inheritsEnvironmentId: string;
        isEmpty?: undefined;
        isUndefined?: undefined;
      }
    | {
        inheritsEnvironmentId?: undefined;
        isEmpty: true;
        isUndefined?: undefined;
      }
    | {
        inheritsEnvironmentId?: undefined;
        isEmpty?: undefined;
        isUndefined: true;
      }
    | {
        inheritsEnvironmentId?: undefined;
        isEmpty?: undefined;
        isUndefined?: undefined;
      }
  );

  export type UserEnvCell = EnvWithMetaCell | EnvMetaCell;

  export type KeyableEnvVal = EnvWithMetaCell;

  export type EnvWithMeta = {
    inherits: Record<string, string[]>;
    variables: Record<string, EnvWithMetaCell>;
  };

  export type EnvMetaOnly = {
    inherits: Record<string, string[]>;
    variables: Record<string, EnvMetaCell>;
  };

  export type EnvInheritsOnly = {
    inherits: Record<string, string[]>;
    variables?: undefined;
  };

  export type UserEnv = EnvWithMeta | EnvMetaOnly | EnvInheritsOnly;

  export type EnvMetaState = {
    variables: Record<string, EnvMetaCell>;
  };

  export type EnvInheritsState = {
    inherits: Record<string, string[]>;
  };

  export type KeyableEnv = Record<string, KeyableEnvVal>;

  export type RawEnv = { [k: string]: string };

  export type VariableNote = {
    note: string;
    authorId: string;
    createdAt: string;
  };

  export type VariableData = Record<
    string,
    {
      notes?: VariableNote[];
      variableGroupId?: string;
    }
  >;

  export type ChangesetPayload = {
    actions: Action.ReplayableEnvUpdateAction[];
    message?: string;
  };

  export type Changeset = ChangesetPayload & {
    createdAt: number;
    encryptedById: string;
    createdById: string;
    id: string;
  };

  export type ListVersionsParams = {
    envParentId: string;
    environmentId: string;
    entryKeys?: string[];
    createdAfter?: number;
    reverse?: true;
  };

  export type TargetVersionParams = ListVersionsParams & {
    version: number;
  };

  export type PotentialConflict = {
    entryKey: string;
    changeset: Changeset;
    action: Action.ReplayableEnvUpdateAction;
  };

  export type DiffsByKey = Record<
    string,
    {
      fromValue: EnvWithMetaCell | undefined;
      toValue: EnvWithMetaCell | undefined;
    }
  >;

  // export type RevertToVersionParams = {
  //   versionStr: string;
  //   environmentIds?: string[];
  //   entryKeys?: string[];
  //   recursive?: boolean;
  // };

  // export type VersionSubmittedBetween = [number, number];

  // export type RevertPlan = {
  //   [envParentId: string]: {
  //     [environmentId: string]: {
  //       version: number;
  //       diffs: Patch;
  //     };
  //   };
  // };
}
