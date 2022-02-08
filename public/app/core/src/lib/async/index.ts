import { pick } from "../utils/object";
import { getProxy } from "../../worker/start";
import { Client } from "../../types";

// makes supplied function run on background thread and return promise
export const asyncify =
  <T extends (...args: any[]) => any>(name: string, fn: T) =>
  async (...params: Parameters<T>) => {
    const proxy = await getProxy();
    return proxy[name](...(params as any[])) as ReturnType<T>;
  };

export const clearOrphanedBlobPaths = async (
  state: Client.State,
  currentUserId: string,
  currentDeviceId: string
) => {
  const proxy = await getProxy();

  return proxy.clearOrphanedBlobPaths(
    {
      ...pick(["graph", "envsFetchedAt", "changesetsFetchedAt"], state),
      envs: Object.keys(state.envs),
      changesets: Object.keys(state.changesets),
    },
    currentUserId,
    currentDeviceId
  );
};
