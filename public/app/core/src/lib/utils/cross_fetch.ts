import nodeFetch, {
  RequestInit as NodeRequestInit,
  Response as NodeResponse,
} from "node-fetch";

export type FetchRequestInit = RequestInit & { timeout?: number };

const crossFetch = async (
  url: string,
  init?: FetchRequestInit
): Promise<Response | NodeResponse> => {
  if (typeof window == "undefined") {
    return nodeFetch(url, init as NodeRequestInit);
  } else {
    if (typeof init?.timeout == "number") {
      const controller = new AbortController(),
        promise = fetch(url, { signal: controller.signal, ...(init ?? {}) }),
        timeout = setTimeout(() => controller.abort(), init.timeout);
      return promise.finally(() => clearTimeout(timeout));
    } else {
      return fetch(url, init as RequestInit | undefined);
    }
  }
};

export default crossFetch;
